import logging
from datetime import date

from django.db import transaction

from .models import LeaveBalance, LeaveRequest
from .repositories import LeaveBalanceReadRepository, LeaveRequestReadRepository, LeaveRequestWriteRepository

logger = logging.getLogger("hrms")


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
    def apply(self, validated_data: dict) -> LeaveRequest:
        self._validate_balance(validated_data["leave_type"], validated_data["days_count"])
        leave = self.write_repo.create(employee=self.employee, **validated_data)
        logger.info("Leave created leave_id=%s employee_id=%s", leave.pk, self.employee.employee_id)
        return leave

    def approve(self, leave: LeaveRequest, approver) -> LeaveRequest:
        approver_employee = getattr(approver, "employee", None)
        if not approver_employee or leave.employee.manager_id != approver_employee.id:
            raise PermissionError("You are not this employee's manager")
        leave = self.write_repo.update(leave, status=LeaveRequest.STATUS_APPROVED, approver=approver)
        logger.info("Leave approved leave_id=%s approver_id=%s", leave.pk, approver.id)
        return leave

    def simulate(self, leave_type: str, days: int) -> dict:
        balance = self.balance_read_repo.get_by_employee_id(self.employee.id)
        if not balance:
            raise ValueError("Leave balance not initialized")

        field_map = {"CL": "casual_remaining", "EL": "earned_remaining", "SL": "sick_remaining"}
        accrual = {"CL": 0.83, "EL": 1.25, "SL": 0.83}
        current = float(getattr(balance, field_map.get(leave_type, "casual_remaining"), 0))
        months_left = 12 - date.today().month
        projected = current + (accrual.get(leave_type, 0) * months_left) - days
        return {
            "leave_type": leave_type,
            "current_balance": current,
            "days_requested": days,
            "projected_year_end": round(projected, 2),
            "is_sufficient": projected >= 0,
        }

    def _validate_balance(self, leave_type: str, days: float) -> None:
        # Lock the balance row to prevent concurrent over-allocation
        balance = LeaveBalance.objects.select_for_update().filter(employee_id=self.employee.id).first()
        if not balance:
            raise ValueError("Leave balance not initialized")
        field_map = {"CL": "casual_remaining", "EL": "earned_remaining", "SL": "sick_remaining"}
        remaining = float(getattr(balance, field_map.get(leave_type, "casual_remaining"), 0))
        if remaining < days:
            raise ValueError(f"Insufficient {leave_type} balance. Available: {remaining}, Requested: {days}")
