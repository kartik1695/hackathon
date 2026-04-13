from core.repositories.base import BaseReadRepository, BaseWriteRepository

from .models import LeaveBalance, LeaveRequest


class LeaveRequestReadRepository(BaseReadRepository[LeaveRequest]):
    def get_by_id(self, id: int) -> LeaveRequest | None:
        return LeaveRequest.objects.select_related("employee", "approver").filter(pk=id).first()

    def list(self, **filters) -> list[LeaveRequest]:
        return list(LeaveRequest.objects.filter(**filters).select_related("employee"))

    def get_team_calendar(self, manager_id: int, from_date, to_date) -> "list[LeaveRequest]":
        return list(
            LeaveRequest.objects.filter(
                employee__manager_id=manager_id,
                status=LeaveRequest.STATUS_APPROVED,
                from_date__lte=to_date,
                to_date__gte=from_date,
            ).select_related("employee__user")
        )


class LeaveRequestWriteRepository(BaseWriteRepository[LeaveRequest]):
    def create(self, **kwargs) -> LeaveRequest:
        return LeaveRequest.objects.create(**kwargs)

    def update(self, instance: LeaveRequest, **kwargs) -> LeaveRequest:
        for key, value in kwargs.items():
            setattr(instance, key, value)
        instance.save(update_fields=list(kwargs.keys()) + ["updated_at"])
        return instance

    def delete(self, instance: LeaveRequest) -> None:
        instance.delete()


class LeaveBalanceReadRepository(BaseReadRepository[LeaveBalance]):
    def get_by_id(self, id: int) -> LeaveBalance | None:
        return LeaveBalance.objects.select_related("employee").filter(pk=id).first()

    def list(self, **filters) -> list[LeaveBalance]:
        return list(LeaveBalance.objects.filter(**filters).select_related("employee"))

    def get_by_employee_id(self, employee_id: int) -> LeaveBalance | None:
        return LeaveBalance.objects.select_related("employee").filter(employee_id=employee_id).first()
