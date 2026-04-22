import logging
from datetime import datetime, timezone

from django.db import transaction

from .models import AttendanceLog
from .repositories import AttendanceLogReadRepository, AttendanceLogWriteRepository

logger = logging.getLogger("hrms")


class AttendanceService:
    def __init__(
        self,
        employee,
        read_repo: AttendanceLogReadRepository | None = None,
        write_repo: AttendanceLogWriteRepository | None = None,
    ):
        self.employee = employee
        self.read_repo = read_repo or AttendanceLogReadRepository()
        self.write_repo = write_repo or AttendanceLogWriteRepository()

    @transaction.atomic
    def check_in(self, date, status: str) -> AttendanceLog:
        existing = self.read_repo.get_by_employee_and_date(self.employee.id, date)
        now = datetime.now(tz=timezone.utc)
        if existing:
            log = self.write_repo.update(existing, check_in=existing.check_in or now, status=status)
        else:
            log = self.write_repo.create(employee=self.employee, date=date, check_in=now, status=status)
        logger.info("Attendance check-in employee_id=%s date=%s", self.employee.employee_id, date)
        return log
