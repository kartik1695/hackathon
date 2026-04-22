from core.repositories.base import BaseReadRepository, BaseWriteRepository

from .models import CompOffRequest, LeaveBalance, LeaveRequest


class LeaveRequestReadRepository(BaseReadRepository[LeaveRequest]):
    def get_by_id(self, id: int) -> LeaveRequest | None:
        return (
            LeaveRequest.objects.select_related("employee__user", "employee__manager", "approver", "applied_by")
            .filter(pk=id)
            .first()
        )

    def list(self, **filters) -> list[LeaveRequest]:
        return list(LeaveRequest.objects.filter(**filters).select_related("employee__user"))

    def get_team_calendar(self, manager_id: int, from_date, to_date) -> "list[LeaveRequest]":
        return list(
            LeaveRequest.objects.filter(
                employee__manager_id=manager_id,
                status=LeaveRequest.STATUS_APPROVED,
                from_date__lte=to_date,
                to_date__gte=from_date,
            ).select_related("employee__user")
        )

    def get_team_leaves(self, manager_employee_id: int, status: str | None = None) -> "list[LeaveRequest]":
        qs = LeaveRequest.objects.filter(
            employee__manager_id=manager_employee_id,
        ).select_related("employee__user", "employee__department", "applied_by", "approver").order_by("-created_at")
        if status:
            qs = qs.filter(status=status.upper())
        return list(qs[:200])

    def get_pending_for_manager(self, manager_employee_id: int) -> "list[LeaveRequest]":
        return list(
            LeaveRequest.objects.filter(
                employee__manager_id=manager_employee_id,
                status=LeaveRequest.STATUS_PENDING,
            )
            .select_related("employee__user", "employee__department", "applied_by")
            .order_by("created_at")
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


class LeaveBalanceWriteRepository(BaseWriteRepository[LeaveBalance]):
    def create(self, **kwargs) -> LeaveBalance:
        return LeaveBalance.objects.create(**kwargs)

    def update(self, instance: LeaveBalance, **kwargs) -> LeaveBalance:
        for key, value in kwargs.items():
            setattr(instance, key, value)
        instance.save(update_fields=list(kwargs.keys()) + ["updated_at"])
        return instance

    def delete(self, instance: LeaveBalance) -> None:
        instance.delete()


class CompOffRequestReadRepository(BaseReadRepository[CompOffRequest]):
    def get_by_id(self, id: int) -> CompOffRequest | None:
        return CompOffRequest.objects.select_related("employee__user", "approved_by").filter(pk=id).first()

    def list(self, **filters) -> list[CompOffRequest]:
        return list(CompOffRequest.objects.filter(**filters).select_related("employee__user"))

    def get_pending_for_manager(self, manager_employee_id: int) -> "list[CompOffRequest]":
        return list(
            CompOffRequest.objects.filter(
                employee__manager_id=manager_employee_id,
                status=CompOffRequest.STATUS_PENDING,
            ).select_related("employee__user")
        )


class CompOffRequestWriteRepository(BaseWriteRepository[CompOffRequest]):
    def create(self, **kwargs) -> CompOffRequest:
        return CompOffRequest.objects.create(**kwargs)

    def update(self, instance: CompOffRequest, **kwargs) -> CompOffRequest:
        for key, value in kwargs.items():
            setattr(instance, key, value)
        instance.save(update_fields=list(kwargs.keys()) + ["updated_at"])
        return instance

    def delete(self, instance: CompOffRequest) -> None:
        instance.delete()
