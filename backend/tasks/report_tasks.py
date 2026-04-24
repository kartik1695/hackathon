import logging

from config.celery import app
from core.tasks.base import BaseHRMSTask

logger = logging.getLogger("hrms")


class PrecomputeEmployeeReportsTask(BaseHRMSTask):
    name = "tasks.report_tasks.precompute_employee_reports"

    def execute(self, as_of_date_str: str | None = None):
        from datetime import date

        from apps.employees.services import ReportInsightsService

        as_of_date = date.fromisoformat(as_of_date_str) if as_of_date_str else date.today()
        svc = ReportInsightsService(as_of_date=as_of_date)

        generated = 0
        failed: list[str] = []

        jobs: list[tuple[str, dict, callable]] = [
            (svc.REPORT_ORG_STATS, {}, svc.compute_org_stats),
            (svc.REPORT_ATTENDANCE_ANOMALIES, {"days": 30}, lambda: svc.compute_attendance_anomalies(days=30)),
            (svc.REPORT_BURNOUT, {"days": 30}, lambda: svc.compute_burnout_risk(days=30)),
            (svc.REPORT_ATTRITION, {"days": 60}, lambda: svc.compute_attrition_risk(days=60)),
            (svc.REPORT_DEPT_HEALTH, {"days": 30}, lambda: svc.compute_dept_health(days=30)),
            (svc.REPORT_LEAVE_TREND, {}, svc.compute_leave_trend),
            (svc.REPORT_PAYROLL_SUMMARY, {}, svc.compute_payroll_summary),
            (svc.REPORT_AI_INSIGHTS, {}, svc.compute_ai_insights),
            (svc.REPORT_SKILL_SALARY, {}, svc.compute_skill_salary),
        ]

        for base, params, fn in jobs:
            report_key = svc.build_report_key(base, params)
            try:
                payload = fn()
                svc.save_snapshot(report_key, payload, params=params)
                generated += 1
            except Exception:
                failed.append(report_key)
                logger.exception("precompute report failed report_key=%s as_of_date=%s", report_key, as_of_date)

        logger.info(
            "reports precomputed generated=%s failed=%s as_of_date=%s",
            generated,
            len(failed),
            as_of_date,
        )
        return {"status": "ok", "as_of_date": str(as_of_date), "generated": generated, "failed": failed}


precompute_employee_reports = app.register_task(PrecomputeEmployeeReportsTask())

