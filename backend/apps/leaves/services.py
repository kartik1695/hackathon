import logging
from datetime import date, timedelta

from django.db import transaction

from .models import CompOffRequest, LeaveBalance, LeaveRequest
from .repositories import (
    CompOffRequestReadRepository,
    CompOffRequestWriteRepository,
    LeaveBalanceReadRepository,
    LeaveRequestReadRepository,
    LeaveRequestWriteRepository,
)

logger = logging.getLogger("hrms")

# Leave types that skip balance checks
_NO_BALANCE_TYPES = {"LOP"}
# Leave types whose balance lives in LeaveBalance
_BALANCE_FIELD_MAP = {
    "CL": "casual_remaining",
    "PL": "privilege_remaining",
    "SL": "sick_remaining",
    "CO": "comp_off_remaining",
}
# Days from today that backdating is allowed per type (SL allows 3 days back)
_BACKDATE_ALLOWED = {"SL": 3, "LOP": 7}


def _count_working_days(from_date: date, to_date: date, is_half_day: bool = False) -> float:
    """Count Mon–Fri days between from_date and to_date inclusive."""
    if is_half_day:
        return 0.5
    count = 0
    current = from_date
    while current <= to_date:
        if current.weekday() < 5:  # Mon=0 … Fri=4
            count += 1
        current += timedelta(days=1)
    return float(count)


class LeaveService:
    def __init__(
        self,
        employee,
        read_repo: LeaveRequestReadRepository | None = None,
        write_repo: LeaveRequestWriteRepository | None = None,
        balance_read_repo: LeaveBalanceReadRepository | None = None,
    ):
        self.employee = employee
        self.read_repo = read_repo or LeaveRequestReadRepository()
        self.write_repo = write_repo or LeaveRequestWriteRepository()
        self.balance_read_repo = balance_read_repo or LeaveBalanceReadRepository()

    @transaction.atomic
    def apply(self, validated_data: dict, applied_by=None) -> LeaveRequest:
        """
        Apply a leave request. `applied_by` is the User who is creating it
        (employee themselves, or a manager acting on behalf).
        """
        leave_type = validated_data["leave_type"]
        from_date = validated_data["from_date"]
        to_date = validated_data["to_date"]
        is_half_day = validated_data.get("is_half_day", False)
        half_day_session = validated_data.get("half_day_session", "")

        # ── Date validations ─────────────────────────────────────────────────
        if from_date > to_date:
            raise ValueError("from_date must be on or before to_date")

        today = date.today()
        backdate_limit = _BACKDATE_ALLOWED.get(leave_type, 0)
        earliest_allowed = today - timedelta(days=backdate_limit)
        if from_date < earliest_allowed:
            raise ValueError(
                f"{leave_type} allows a maximum of {backdate_limit} days backdating. "
                f"Earliest allowed: {earliest_allowed}"
            )

        # ── Half-day constraints ─────────────────────────────────────────────
        if is_half_day:
            if from_date != to_date:
                raise ValueError("Half-day leave must be on a single date (from_date == to_date)")
            if not half_day_session:
                raise ValueError("half_day_session (AM/PM) is required for half-day leave")

        # ── Auto-compute days_count (server-side, exclude weekends) ──────────
        days_count = _count_working_days(from_date, to_date, is_half_day)
        if days_count == 0:
            raise ValueError("No working days in the selected date range (weekend/holiday only)")

        # ── Overlap check: employee must not already have a leave in this range ─
        overlap = (
            LeaveRequest.objects.filter(
                employee_id=self.employee.id,
                status__in=[LeaveRequest.STATUS_PENDING, LeaveRequest.STATUS_APPROVED],
                from_date__lte=to_date,
                to_date__gte=from_date,
            )
            .exclude(is_half_day=True)  # half-days can overlap on same date with each other
            .first()
        )
        if overlap and not (is_half_day and overlap.is_half_day and overlap.half_day_session != half_day_session):
            raise ValueError(
                f"A leave request (#{overlap.pk}, {overlap.status}) already covers this date range"
            )

        # ── Balance validation (skip for LOP) ────────────────────────────────
        if leave_type not in _NO_BALANCE_TYPES:
            self._validate_balance(leave_type, days_count)

        create_data = {
            "employee": self.employee,
            "leave_type": leave_type,
            "from_date": from_date,
            "to_date": to_date,
            "days_count": days_count,
            "reason": validated_data.get("reason", ""),
            "is_half_day": is_half_day,
            "half_day_session": half_day_session if is_half_day else "",
            "applied_by": applied_by,
        }
        leave = self.write_repo.create(**create_data)
        logger.info(
            "Leave created leave_id=%s employee_id=%s leave_type=%s days=%s applied_by=%s",
            leave.pk, self.employee.employee_id, leave_type, days_count,
            getattr(applied_by, "id", None),
        )
        return leave

    @transaction.atomic
    def approve(self, leave: LeaveRequest, approver) -> LeaveRequest:
        """Manager approves a leave. Deducts balance atomically."""
        self._assert_is_manager(leave, approver)
        if leave.status != LeaveRequest.STATUS_PENDING:
            raise ValueError(f"Cannot approve a leave that is already {leave.status}")

        leave = self.write_repo.update(
            leave,
            status=LeaveRequest.STATUS_APPROVED,
            approver=approver,
        )

        # Deduct balance (idempotent — tracked by balance_deducted flag)
        if not leave.balance_deducted and leave.leave_type not in _NO_BALANCE_TYPES:
            balance = LeaveBalance.objects.select_for_update().filter(employee_id=leave.employee_id).first()
            if balance:
                balance.deduct(leave.leave_type, leave.days_count)
                self.write_repo.update(leave, balance_deducted=True)

        logger.info("Leave approved leave_id=%s approver_id=%s", leave.pk, approver.id)
        return leave

    @transaction.atomic
    def reject(self, leave: LeaveRequest, approver, rejection_reason: str = "") -> LeaveRequest:
        """Manager rejects a leave."""
        self._assert_is_manager(leave, approver)
        if leave.status not in (LeaveRequest.STATUS_PENDING,):
            raise ValueError(f"Cannot reject a leave that is already {leave.status}")

        leave = self.write_repo.update(
            leave,
            status=LeaveRequest.STATUS_REJECTED,
            approver=approver,
            rejection_reason=rejection_reason,
        )
        logger.info("Leave rejected leave_id=%s approver_id=%s", leave.pk, approver.id)
        return leave

    @transaction.atomic
    def cancel(self, leave: LeaveRequest, requester) -> LeaveRequest:
        """
        Cancel a leave. Employee can cancel their own PENDING leave.
        Manager can cancel their team member's PENDING leave.
        """
        requester_emp = getattr(requester, "employee", None)
        is_own = requester_emp and requester_emp.id == leave.employee_id
        is_manager = requester_emp and leave.employee.manager_id == requester_emp.id

        if not is_own and not is_manager:
            raise PermissionError("You can only cancel your own leave or your direct report's leave")

        if leave.status not in (LeaveRequest.STATUS_PENDING,):
            raise ValueError(
                f"Only PENDING leaves can be cancelled. This leave is {leave.status}. "
                "Contact HR to reverse an approved leave."
            )

        leave = self.write_repo.update(leave, status=LeaveRequest.STATUS_CANCELLED)
        logger.info(
            "Leave cancelled leave_id=%s by user_id=%s", leave.pk, getattr(requester, "id", None)
        )
        return leave

    def get_pending_for_manager(self, manager_employee_id: int) -> list:
        """All PENDING leave requests for a manager's direct reports."""
        return list(
            LeaveRequest.objects.filter(
                employee__manager_id=manager_employee_id,
                status=LeaveRequest.STATUS_PENDING,
            )
            .select_related("employee__user", "employee__department", "applied_by")
            .order_by("created_at")
        )

    def renotify_manager(self, leave: LeaveRequest, requester) -> bool:
        """Re-send the manager notification for a still-PENDING leave."""
        requester_emp = getattr(requester, "employee", None)
        if not requester_emp or requester_emp.id != leave.employee_id:
            raise PermissionError("Only the leave owner can trigger a re-notification")
        if leave.status != LeaveRequest.STATUS_PENDING:
            raise ValueError("Re-notification is only for pending leaves")

        try:
            from tasks.notification_tasks import dispatch_notification

            manager = leave.employee.manager
            manager_email = manager.user.email if manager and hasattr(manager, "user") else ""
            if not manager_email:
                return False

            dispatch_notification.delay(
                ["inapp"],
                manager_email,
                f"[REMINDER] Leave Request #{leave.pk} Awaiting Approval",
                (
                    f"Reminder: {leave.employee.user.name}'s {leave.get_leave_type_display()} request "
                    f"(#{leave.pk}, {leave.from_date} → {leave.to_date}) is still pending your approval."
                ),
                {
                    "leave_id": leave.pk,
                    "employee_id": leave.employee.employee_id,
                    "leave_type": leave.leave_type,
                    "from_date": str(leave.from_date),
                    "to_date": str(leave.to_date),
                    "days_count": float(leave.days_count),
                    "is_reminder": True,
                    "ai_context_card": leave.ai_context_card,
                },
            )
            logger.info("Re-notification queued leave_id=%s manager_email=%s", leave.pk, manager_email)
            return True
        except Exception as exc:
            logger.exception("renotify_manager failed leave_id=%s error=%s", leave.pk, exc)
            return False

    def simulate(self, leave_type: str, days: int) -> dict:
        balance = self.balance_read_repo.get_by_employee_id(self.employee.id)
        if not balance:
            raise ValueError("Leave balance not initialized")

        accrual = {"CL": 0.83, "PL": 1.25, "SL": 0.83, "CO": 0.0}
        if leave_type == "LOP":
            return {
                "leave_type": leave_type,
                "current_balance": None,
                "days_requested": days,
                "projected_year_end": None,
                "is_sufficient": True,
                "note": "LOP has no balance — always available",
            }
        current = balance.get_remaining(leave_type)
        months_left = 12 - date.today().month
        projected = current + (accrual.get(leave_type, 0) * months_left) - days
        return {
            "leave_type": leave_type,
            "current_balance": current,
            "days_requested": days,
            "projected_year_end": round(projected, 2),
            "is_sufficient": projected >= 0,
        }

    # ── Private helpers ──────────────────────────────────────────────────────

    def _validate_balance(self, leave_type: str, days: float) -> None:
        balance = LeaveBalance.objects.select_for_update().filter(employee_id=self.employee.id).first()
        if not balance:
            raise ValueError("Leave balance not initialized for this employee")
        remaining = balance.get_remaining(leave_type)
        if remaining < days:
            raise ValueError(
                f"Insufficient {leave_type} balance. Available: {remaining:.1f}, Requested: {days:.1f}"
            )

    def _assert_is_manager(self, leave: LeaveRequest, approver) -> None:
        approver_emp = getattr(approver, "employee", None)
        if not approver_emp:
            raise PermissionError("Approver has no employee profile")
        # HR and Admin can act on any leave
        if approver_emp.role in ("hr", "admin"):
            return
        if leave.employee.manager_id != approver_emp.id:
            raise PermissionError("You are not the direct manager of this employee")


class CompOffService:
    def __init__(self, employee):
        self.employee = employee

    @transaction.atomic
    def request(self, worked_on: date, days_claimed: float, reason: str = "") -> CompOffRequest:
        if days_claimed <= 0 or days_claimed > 2:
            raise ValueError("days_claimed must be between 0.5 and 2")

        # Check the worked_on date is a weekend or public holiday (weekends only for now)
        if worked_on.weekday() < 5:  # Mon–Fri
            logger.info(
                "CompOff requested for a weekday worked_on=%s employee_id=%s — allowed but flagged",
                worked_on, self.employee.employee_id,
            )

        req = CompOffRequest.objects.create(
            employee=self.employee,
            worked_on=worked_on,
            days_claimed=days_claimed,
            reason=reason,
        )
        logger.info(
            "CompOff request created id=%s employee_id=%s worked_on=%s days=%s",
            req.pk, self.employee.employee_id, worked_on, days_claimed,
        )
        return req

    @transaction.atomic
    def approve(self, comp_off_req: CompOffRequest, approver) -> CompOffRequest:
        approver_emp = getattr(approver, "employee", None)
        if not approver_emp:
            raise PermissionError("Approver has no employee profile")
        if approver_emp.role not in ("hr", "admin") and comp_off_req.employee.manager_id != approver_emp.id:
            raise PermissionError("You are not the direct manager of this employee")

        if comp_off_req.status != CompOffRequest.STATUS_PENDING:
            raise ValueError(f"Comp off request is already {comp_off_req.status}")

        comp_off_req.status = CompOffRequest.STATUS_APPROVED
        comp_off_req.approved_by = approver
        comp_off_req.save(update_fields=["status", "approved_by", "updated_at"])

        # Credit the balance
        balance, _ = LeaveBalance.objects.get_or_create(employee=comp_off_req.employee)
        balance.credit("CO", comp_off_req.days_claimed)

        logger.info(
            "CompOff approved id=%s employee_id=%s days=%s credited",
            comp_off_req.pk, comp_off_req.employee.employee_id, comp_off_req.days_claimed,
        )
        return comp_off_req

    @transaction.atomic
    def reject(self, comp_off_req: CompOffRequest, approver, rejection_reason: str = "") -> CompOffRequest:
        approver_emp = getattr(approver, "employee", None)
        if not approver_emp:
            raise PermissionError("Approver has no employee profile")
        if approver_emp.role not in ("hr", "admin") and comp_off_req.employee.manager_id != approver_emp.id:
            raise PermissionError("You are not the direct manager of this employee")

        if comp_off_req.status != CompOffRequest.STATUS_PENDING:
            raise ValueError(f"Comp off request is already {comp_off_req.status}")

        comp_off_req.status = CompOffRequest.STATUS_REJECTED
        comp_off_req.approved_by = approver
        comp_off_req.rejection_reason = rejection_reason
        comp_off_req.save(update_fields=["status", "approved_by", "rejection_reason", "updated_at"])
        logger.info("CompOff rejected id=%s", comp_off_req.pk)
        return comp_off_req
