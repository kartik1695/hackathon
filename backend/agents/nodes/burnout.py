import logging
from datetime import date, timedelta

from agents.state import AgentState

logger = logging.getLogger("hrms")


def run(state: AgentState) -> AgentState:
    employee_id = state.get("employee_id")
    if not employee_id:
        state["burnout_score"] = None
        state["burnout_signals"] = None
        return state

    try:
        from apps.attendance.models import AttendanceAnomaly, AttendanceLog
    except ImportError as exc:
        logger.exception("Attendance models import failed")
        state["burnout_score"] = None
        state["burnout_signals"] = None
        state["error"] = str(exc)
        return state

    today = date.today()
    since = today - timedelta(days=30)

    anomaly_qs = AttendanceAnomaly.objects.filter(employee_id=employee_id, date__gte=since)
    unresolved = anomaly_qs.filter(resolved=False).count()
    total_anomalies = anomaly_qs.count()

    absent_count = AttendanceLog.objects.filter(
        employee_id=employee_id, date__gte=since, status=AttendanceLog.STATUS_ABSENT
    ).count()

    score = min(1.0, (unresolved * 0.12) + (total_anomalies * 0.05) + (absent_count * 0.08))
    state["burnout_score"] = float(score)
    state["burnout_signals"] = {
        "window_days": 30,
        "anomalies_total": total_anomalies,
        "anomalies_unresolved": unresolved,
        "absent_days": absent_count,
    }
    logger.info(
        "Burnout computed employee_id=%s score=%.2f anomalies=%s unresolved=%s absent=%s",
        employee_id,
        score,
        total_anomalies,
        unresolved,
        absent_count,
    )
    return state

