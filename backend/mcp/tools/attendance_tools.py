import logging
from datetime import date, timedelta

from mcp.rbac import ensure_role
from mcp.registry import tool

logger = logging.getLogger("hrms")


@tool("get_attendance_summary")
def get_attendance_summary(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        logger.info("MCP forbidden tool=get_attendance_summary requester_role=%s", requester_role)
        return err

    from apps.attendance.models import AttendanceLog

    today = date.today()
    since = today - timedelta(days=int((input_data or {}).get("window_days") or 30))

    qs = AttendanceLog.objects.filter(employee_id=employee_id, date__gte=since)
    present = qs.filter(status=AttendanceLog.STATUS_PRESENT).count()
    wfh = qs.filter(status=AttendanceLog.STATUS_WFH).count()
    absent = qs.filter(status=AttendanceLog.STATUS_ABSENT).count()

    logger.info("MCP tool ok tool=get_attendance_summary employee_id=%s window_since=%s", employee_id, since)
    return {"attendance_summary": {"window_days": (today - since).days, "present": present, "wfh": wfh, "absent": absent}}


@tool("get_attendance_anomalies")
def get_attendance_anomalies(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        logger.info("MCP forbidden tool=get_attendance_anomalies requester_role=%s", requester_role)
        return err

    from apps.attendance.models import AttendanceAnomaly

    today = date.today()
    since = today - timedelta(days=int((input_data or {}).get("window_days") or 30))
    qs = (
        AttendanceAnomaly.objects.filter(employee_id=employee_id, date__gte=since)
        .order_by("-date", "-created_at")
        .values("id", "date", "anomaly_type", "description", "resolved")[:50]
    )
    items = list(qs)
    logger.info("MCP tool ok tool=get_attendance_anomalies employee_id=%s count=%s", employee_id, len(items))
    return {"attendance_anomalies": items}
