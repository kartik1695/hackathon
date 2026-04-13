from core.repositories.base import BaseReadRepository, BaseWriteRepository

from .models import AttendanceAnomaly, AttendanceLog


class AttendanceLogReadRepository(BaseReadRepository[AttendanceLog]):
    def get_by_id(self, id: int) -> AttendanceLog | None:
        return AttendanceLog.objects.select_related("employee", "employee__user").filter(pk=id).first()

    def list(self, **filters) -> list[AttendanceLog]:
        return list(AttendanceLog.objects.filter(**filters).select_related("employee", "employee__user"))

    def get_by_employee_and_date(self, employee_id: int, date) -> AttendanceLog | None:
        return AttendanceLog.objects.filter(employee_id=employee_id, date=date).first()


class AttendanceLogWriteRepository(BaseWriteRepository[AttendanceLog]):
    def create(self, **kwargs) -> AttendanceLog:
        return AttendanceLog.objects.create(**kwargs)

    def update(self, instance: AttendanceLog, **kwargs) -> AttendanceLog:
        for key, value in kwargs.items():
            setattr(instance, key, value)
        instance.save(update_fields=list(kwargs.keys()) + ["updated_at"])
        return instance

    def delete(self, instance: AttendanceLog) -> None:
        instance.delete()


class AttendanceAnomalyWriteRepository(BaseWriteRepository[AttendanceAnomaly]):
    def create(self, **kwargs) -> AttendanceAnomaly:
        return AttendanceAnomaly.objects.create(**kwargs)

    def update(self, instance: AttendanceAnomaly, **kwargs) -> AttendanceAnomaly:
        for key, value in kwargs.items():
            setattr(instance, key, value)
        instance.save(update_fields=list(kwargs.keys()))
        return instance

    def delete(self, instance: AttendanceAnomaly) -> None:
        instance.delete()
