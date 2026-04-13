from django.contrib.auth import get_user_model

from core.repositories.base import BaseReadRepository, BaseWriteRepository

from .models import Department, Employee

User = get_user_model()


class EmployeeReadRepository(BaseReadRepository[Employee]):
    def get_by_id(self, id: int) -> Employee | None:
        return (
            Employee.objects.select_related("user", "department", "manager")
            .filter(pk=id)
            .first()
        )

    def list(self, **filters) -> list[Employee]:
        return list(Employee.objects.filter(**filters).select_related("user", "department", "manager"))


class EmployeeWriteRepository(BaseWriteRepository[Employee]):
    def create(self, **kwargs) -> Employee:
        return Employee.objects.create(**kwargs)

    def update(self, instance: Employee, **kwargs) -> Employee:
        for key, value in kwargs.items():
            setattr(instance, key, value)
        instance.save(update_fields=list(kwargs.keys()) + ["updated_at"])
        return instance

    def delete(self, instance: Employee) -> None:
        instance.delete()


class UserWriteRepository(BaseWriteRepository[User]):
    def create(self, **kwargs) -> User:
        password = kwargs.pop("password")
        user = User.objects.create(**kwargs)
        user.set_password(password)
        user.save(update_fields=["password"])
        return user

    def update(self, instance: User, **kwargs) -> User:
        password = kwargs.pop("password", None)
        for key, value in kwargs.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

    def delete(self, instance: User) -> None:
        instance.delete()


class DepartmentReadRepository(BaseReadRepository[Department]):
    def get_by_id(self, id: int) -> Department | None:
        return Department.objects.filter(pk=id).first()

    def list(self, **filters) -> list[Department]:
        return list(Department.objects.filter(**filters))
