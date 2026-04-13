import logging

from config.celery import app
from core.tasks.base import BaseHRMSTask

logger = logging.getLogger("hrms")


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
        logger.info("Leave application processed leave_id=%s", leave_id)
        return {"status": "ok", "leave_id": leave_id, "spof_flag": leave.spof_flag, "conflict_flag": leave.conflict_flag}


class ProcessLeaveApprovalTask(BaseHRMSTask):
    name = "tasks.leave_tasks.process_leave_approval"

    def execute(self, leave_id: int):
        from apps.leaves.models import LeaveRequest

        leave = LeaveRequest.objects.select_related("employee", "employee__user").filter(pk=leave_id).first()
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
            dispatch_notification.delay(
                ["inapp"],
                recipient,
                "Leave Approved",
                f"Your leave request {leave.pk} has been approved.",
                {"leave_id": leave.pk, "status": leave.status},
            )
        logger.info("Leave approval processed leave_id=%s", leave_id)
        return {"status": "ok"}


process_leave_application = app.register_task(ProcessLeaveApplicationTask())
process_leave_approval = app.register_task(ProcessLeaveApprovalTask())
