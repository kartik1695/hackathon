import logging

from django.db import transaction

from .models import Employee
from .repositories import DepartmentReadRepository, EmployeeReadRepository, EmployeeWriteRepository, UserWriteRepository

logger = logging.getLogger("hrms")


class EmployeeService:
    def __init__(
        self,
        read_repo: EmployeeReadRepository | None = None,
        write_repo: EmployeeWriteRepository | None = None,
        user_write_repo: UserWriteRepository | None = None,
        dept_read_repo: DepartmentReadRepository | None = None,
    ):
        self.read_repo = read_repo or EmployeeReadRepository()
        self.write_repo = write_repo or EmployeeWriteRepository()
        self.user_write_repo = user_write_repo or UserWriteRepository()
        self.dept_read_repo = dept_read_repo or DepartmentReadRepository()

    @transaction.atomic
    def create_employee(self, validated_data: dict) -> Employee:
        dept_id = validated_data.pop("department_id", None)
        manager_id = validated_data.pop("manager_id", None)

        user = self.user_write_repo.create(
            password=validated_data.pop("password"),
            email=validated_data.pop("email"),
            name=validated_data.pop("name"),
            phone_number=validated_data.pop("phone_number"),
        )

        department = self.dept_read_repo.get_by_id(dept_id) if dept_id else None
        manager = self.read_repo.get_by_id(manager_id) if manager_id else None

        employee = self.write_repo.create(user=user, department=department, manager=manager, **validated_data)
        logger.info("Employee created employee_id=%s user_id=%s", employee.employee_id, user.id)
        return employee
