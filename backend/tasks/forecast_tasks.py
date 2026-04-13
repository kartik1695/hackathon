import logging
from datetime import date
from calendar import monthrange

from config.celery import app
from core.cache.keys import CacheKeys
from core.cache.redis_backend import RedisBackend
from core.tasks.base import BaseHRMSTask

logger = logging.getLogger("hrms")
_cache = RedisBackend()


class ForecastTask(BaseHRMSTask):
    name = "tasks.forecast_tasks.generate_leave_forecast"

    def execute(self, dept_id: int, year_month: str):
        try:
            from apps.leaves.models import LeaveRequest
        except ImportError as exc:
            logger.exception("LeaveRequest model import failed")
            return {"status": "error", "error": str(exc)}

        year, month = _parse_year_month(year_month)
        if not year or not month:
            return {"status": "error", "error": "Invalid year_month. Expected YYYY-MM"}

        start = date(year, month, 1)
        end = date(year, month, monthrange(year, month)[1])

        qs = (
            LeaveRequest.objects.filter(
                employee__department_id=dept_id,
                status=LeaveRequest.STATUS_APPROVED,
                from_date__lte=end,
                to_date__gte=start,
            )
            .values_list("days_count", flat=True)
        )
        total_days = float(sum(list(qs)) or 0.0)
        key = CacheKeys.leave_forecast(dept_id, year_month)
        payload = {"dept_id": dept_id, "year_month": year_month, "forecast_leave_days": total_days}
        _cache.set(key, payload, ttl_seconds=24 * 3600)
        logger.info("Leave forecast stored dept_id=%s year_month=%s total_days=%s", dept_id, year_month, total_days)
        return {"status": "ok", "cache_key": key, "payload": payload}


class ForecastAllTask(BaseHRMSTask):
    name = "tasks.forecast_tasks.generate_leave_forecast_all"

    def execute(self, year_month: str):
        try:
            from apps.employees.models import Department
        except ImportError as exc:
            logger.exception("Department model import failed")
            return {"status": "error", "error": str(exc)}

        dept_ids = list(Department.objects.values_list("id", flat=True))
        for dept_id in dept_ids:
            generate_leave_forecast.delay(int(dept_id), year_month)
        logger.info("Leave forecast all queued year_month=%s count=%s", year_month, len(dept_ids))
        return {"status": "ok", "queued": len(dept_ids), "year_month": year_month}


class ForecastCurrentMonthTask(BaseHRMSTask):
    name = "tasks.forecast_tasks.generate_leave_forecast_current_month"

    def execute(self):
        today = date.today()
        year_month = f"{today.year:04d}-{today.month:02d}"
        generate_leave_forecast_all.delay(year_month)
        logger.info("Leave forecast current month queued year_month=%s", year_month)
        return {"status": "ok", "year_month": year_month}


def _parse_year_month(value: str) -> tuple[int | None, int | None]:
    try:
        parts = (value or "").split("-", 1)
        year = int(parts[0])
        month = int(parts[1])
    except Exception:
        return None, None
    if month < 1 or month > 12:
        return None, None
    return year, month



generate_leave_forecast = app.register_task(ForecastTask())
generate_leave_forecast_all = app.register_task(ForecastAllTask())
