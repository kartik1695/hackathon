import logging

from config.celery import app
from core.cache.keys import CacheKeys
from core.cache.redis_backend import RedisBackend
from core.tasks.base import BaseHRMSTask

logger = logging.getLogger("hrms")
_cache = RedisBackend()


class BurnoutScanTask(BaseHRMSTask):
    name = "tasks.burnout_tasks.burnout_scan"

    def execute(self, employee_id: int):
        try:
            from agents.nodes.burnout import run as burnout_run
        except ImportError as exc:
            logger.exception("Burnout node import failed")
            return {"status": "error", "error": str(exc)}

        state = {
            "intent": "burnout_check",
            "employee_id": employee_id,
            "requester_id": employee_id,
            "requester_role": "system",
            "input_data": {},
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
        state = burnout_run(state)
        key = CacheKeys.burnout_score(employee_id)
        payload = {"score": state.get("burnout_score"), "signals": state.get("burnout_signals")}
        _cache.set(key, payload, ttl_seconds=24 * 3600)
        logger.info("Burnout scan stored employee_id=%s key=%s", employee_id, key)
        return {"status": "ok", "employee_id": employee_id, "cache_key": key, "payload": payload}


class BurnoutScanAllTask(BaseHRMSTask):
    name = "tasks.burnout_tasks.burnout_scan_all"

    def execute(self):
        try:
            from apps.employees.models import Employee
        except ImportError as exc:
            logger.exception("Employee model import failed")
            return {"status": "error", "error": str(exc)}

        qs = Employee.objects.filter(is_active=True).values_list("id", flat=True)
        employee_ids = list(qs)
        for emp_id in employee_ids:
            burnout_scan.delay(int(emp_id))
        logger.info("Burnout scan all queued count=%s", len(employee_ids))
        return {"status": "ok", "queued": len(employee_ids)}


burnout_scan = app.register_task(BurnoutScanTask())
burnout_scan_all = app.register_task(BurnoutScanAllTask())
