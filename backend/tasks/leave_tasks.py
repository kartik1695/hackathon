import logging

from config.celery import app
from core.tasks.base import BaseHRMSTask

logger = logging.getLogger("hrms")

# Monthly accrual rates (days per month)
MONTHLY_ACCRUAL = {
    "CL": 0.5,   # 6 days / year
    "PL": 1.5,   # 18 days / year
    "SL": 0.5,   # 6 days / year
    # CO: not accrued, only granted
    # LOP: no balance
}


class ProcessLeaveApplicationTask(BaseHRMSTask):
    name = "tasks.leave_tasks.process_leave_application"

    def execute(self, leave_id: int):
        from apps.leaves.models import LeaveRequest
        from apps.leaves.repositories import LeaveRequestWriteRepository

        leave = LeaveRequest.objects.select_related("employee", "employee__manager").filter(pk=leave_id).first()
        if not leave:
            logger.info("Leave not found leave_id=%s", leave_id)
            return {"status": "not_found"}

        try:
            from agents.graph import run_agent
        except ImportError as exc:
            logger.exception("Agent import failed")
            LeaveRequestWriteRepository().update(leave, ai_context_card=f"AI unavailable: {exc}")
            return {"status": "error", "error": str(exc)}

        state = {
            "intent": "leave_application",
            "employee_id": leave.employee_id,
            "requester_id": leave.employee.user_id if hasattr(leave.employee, "user_id") else leave.employee_id,
            "requester_role": "employee",
            "input_data": {
                "leave_id": leave.pk,
                "leave_type": leave.leave_type,
                "from_date": leave.from_date,
                "to_date": leave.to_date,
                "days_count": leave.days_count,
                "is_half_day": leave.is_half_day,
                "reason": leave.reason,
            },
            "retrieved_docs": [],
            "tool_results": {},
            "llm_response": None,
            "spof_flag": False,
            "conflict_detected": False,
            "conflict_summary": None,
            "manager_context": None,
            "burnout_score": None,
            "burnout_signals": None,
            "error": None,
        }
        result = run_agent(state)

        repo = LeaveRequestWriteRepository()
        repo.update(
            leave,
            spof_flag=bool(result.get("spof_flag") or False),
            conflict_flag=bool(result.get("conflict_detected") or False),
            conflict_context=result.get("tool_results") or {},
            ai_context_card=(result.get("manager_context") or result.get("llm_response") or "").strip(),
        )

        # Send a follow-up manager notification with AI insights now available
        _send_ai_insights_update(leave)

        logger.info("Leave application processed leave_id=%s", leave_id)
        return {
            "status": "ok",
            "leave_id": leave_id,
            "spof_flag": leave.spof_flag,
            "conflict_flag": leave.conflict_flag,
        }


def _send_ai_insights_update(leave):
    """After AI processing completes, send an updated notification to manager."""
    try:
        from tasks.notification_tasks import dispatch_notification

        from apps.employees.models import Employee

        employee = Employee.objects.select_related("manager__user", "user").filter(pk=leave.employee_id).first()
        manager = getattr(employee, "manager", None) if employee else None
        manager_email = manager.user.email if manager and hasattr(manager, "user") and manager.user else ""
        if not manager_email or not leave.ai_context_card:
            return

        dispatch_notification.delay(
            ["inapp"],
            manager_email,
            f"AI Insights Ready — Leave #{leave.pk} ({employee.user.name if employee and employee.user else ''})",
            leave.ai_context_card,
            {
                "leave_id": leave.pk,
                "spof_flag": leave.spof_flag,
                "conflict_flag": leave.conflict_flag,
                "ai_insights": leave.ai_context_card,
                "is_ai_update": True,
            },
        )
    except Exception as exc:
        logger.exception("Failed to send AI insights update leave_id=%s error=%s", leave.pk, exc)


class ProcessLeaveApprovalTask(BaseHRMSTask):
    name = "tasks.leave_tasks.process_leave_approval"

    def execute(self, leave_id: int):
        from apps.leaves.models import LeaveRequest

        leave = LeaveRequest.objects.select_related("employee__user").filter(pk=leave_id).first()
        if not leave:
            logger.info("Leave not found leave_id=%s", leave_id)
            return {"status": "not_found"}

        try:
            from tasks.notification_tasks import dispatch_notification
        except ImportError as exc:
            logger.exception("Notification task import failed")
            return {"status": "error", "error": str(exc)}

        recipient = leave.employee.user.email if hasattr(leave.employee, "user") and leave.employee.user else ""
        if recipient:
            from apps.leaves.models import LeaveBalance

            bal = LeaveBalance.objects.filter(employee_id=leave.employee_id).first()
            balance_note = ""
            if bal:
                field_map = {"CL": bal.casual_remaining, "PL": bal.privilege_remaining, "SL": bal.sick_remaining, "CO": bal.comp_off_remaining}
                remaining = field_map.get(leave.leave_type)
                if remaining is not None:
                    balance_note = f" Your remaining {leave.leave_type} balance: {remaining:.1f} day(s)."

            dispatch_notification.delay(
                ["inapp"],
                recipient,
                f"Leave #{leave.pk} Approved ✓",
                (
                    f"Your {leave.get_leave_type_display()} request ({leave.from_date} → {leave.to_date}, "
                    f"{leave.days_count:.1f} day(s)) has been approved.{balance_note}"
                ),
                {
                    "leave_id": leave.pk,
                    "leave_type": leave.leave_type,
                    "status": "APPROVED",
                    "from_date": str(leave.from_date),
                    "to_date": str(leave.to_date),
                    "days_count": float(leave.days_count),
                },
            )
        logger.info("Leave approval processed leave_id=%s", leave_id)
        return {"status": "ok"}


class AccrueMonthlyLeavesTask(BaseHRMSTask):
    """
    Runs on the 1st of every month via Celery Beat.
    Adds monthly leave credits to all active employees:
      CL: +0.5 / month  (6/year)
      PL: +1.5 / month  (18/year)
      SL: +0.5 / month  (6/year)
    """
    name = "tasks.leave_tasks.accrue_monthly_leaves"

    def execute(self):
        from apps.employees.models import Employee
        from apps.leaves.models import LeaveBalance, LeavePolicy

        # Fetch configured caps per type from LeavePolicy if present
        caps = {}
        for p in LeavePolicy.objects.all():
            if p.annual_allocation > 0:
                caps[p.leave_type] = p.annual_allocation

        employees = Employee.objects.filter(is_active=True).values_list("id", flat=True)
        updated = 0

        for emp_id in employees:
            try:
                balance, _ = LeaveBalance.objects.get_or_create(
                    employee_id=emp_id,
                    defaults={"casual_remaining": 0, "privilege_remaining": 0, "sick_remaining": 0, "comp_off_remaining": 0},
                )
                field_map = {
                    "CL": ("casual_remaining", MONTHLY_ACCRUAL["CL"], caps.get("CL", 999)),
                    "PL": ("privilege_remaining", MONTHLY_ACCRUAL["PL"], caps.get("PL", 999)),
                    "SL": ("sick_remaining", MONTHLY_ACCRUAL["SL"], caps.get("SL", 999)),
                }
                changed_fields = []
                for leave_type, (field, accrual, cap) in field_map.items():
                    current = float(getattr(balance, field, 0))
                    new_val = min(current + accrual, cap)
                    if new_val != current:
                        setattr(balance, field, new_val)
                        changed_fields.append(field)

                if changed_fields:
                    changed_fields.append("updated_at")
                    balance.save(update_fields=changed_fields)
                    updated += 1
            except Exception as exc:
                logger.exception("Leave accrual failed for employee_id=%s error=%s", emp_id, exc)

        logger.info("Monthly leave accrual complete employees_updated=%s", updated)
        return {"status": "ok", "employees_updated": updated}


process_leave_application = app.register_task(ProcessLeaveApplicationTask())
process_leave_approval = app.register_task(ProcessLeaveApprovalTask())
accrue_monthly_leaves = app.register_task(AccrueMonthlyLeavesTask())
