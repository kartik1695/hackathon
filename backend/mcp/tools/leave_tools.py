import logging
from datetime import date
from pathlib import Path

from mcp.rbac import ensure_role
from mcp.registry import resource, tool

logger = logging.getLogger("hrms")


def _parse_date(val) -> date | None:
    if isinstance(val, date):
        return val
    if not val:
        return None
    try:
        return date.fromisoformat(str(val))
    except Exception:
        return None


@tool("create_leave_request")
def create_leave_request(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    err = ensure_role(requester_role, ["employee", "hr", "admin"])
    if err:
        logger.info("MCP forbidden tool=create_leave_request requester_role=%s", requester_role)
        return err

    input_data = input_data or {}
    leave_type = input_data.get("leave_type")
    from_date = _parse_date(input_data.get("from_date"))
    to_date = _parse_date(input_data.get("to_date"))
    days_count = input_data.get("days_count")

    if not leave_type or not from_date or not to_date or days_count is None:
        return {"status": "noop"}

    try:
        days_count = float(days_count)
    except (TypeError, ValueError):
        return {"error": "Invalid days_count", "code": "INVALID_INPUT"}

    try:
        from apps.employees.models import Employee
        from apps.leaves.models import LeaveRequest
        from apps.leaves.services import LeaveService
    except Exception as exc:
        return {"error": str(exc), "code": "IMPORT_ERROR"}

    requester_emp = Employee.objects.filter(user_id=requester_id).first()
    if requester_role == "employee":
        if not requester_emp or requester_emp.id != employee_id:
            return {"error": "Forbidden", "code": "FORBIDDEN"}

    existing = LeaveRequest.objects.filter(
        employee_id=employee_id,
        status=LeaveRequest.STATUS_PENDING,
        leave_type=leave_type,
        from_date=from_date,
        to_date=to_date,
        days_count=days_count,
    ).order_by("-created_at").first()
    if existing:
        return {"status": "ok", "leave_id": existing.pk, "deduped": True}

    employee = Employee.objects.select_related("user", "manager", "department").filter(pk=employee_id).first()
    if not employee:
        return {"error": "Employee not found", "code": "EMPLOYEE_NOT_FOUND"}

    try:
        leave = LeaveService(employee).apply(
            {"leave_type": leave_type, "from_date": from_date, "to_date": to_date, "days_count": days_count}
        )
    except Exception as exc:
        return {"error": str(exc), "code": "LEAVE_CREATE_FAILED"}

    logger.info("MCP tool ok tool=create_leave_request leave_id=%s employee_id=%s", leave.pk, employee.employee_id)
    return {
        "status": "ok",
        "leave_id": leave.pk,
        "employee_id": employee.employee_id,
        "leave_type": leave.leave_type,
        "from_date": str(leave.from_date),
        "to_date": str(leave.to_date),
        "days_count": float(leave.days_count),
        "deduped": False,
    }


@tool("get_leave_balance")
def get_leave_balance(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        logger.info("MCP forbidden tool=get_leave_balance requester_role=%s", requester_role)
        return err

    from apps.leaves.models import LeaveBalance

    bal = LeaveBalance.objects.select_related("employee").filter(employee_id=employee_id).first()
    if not bal:
        return {"leave_balance": None}

    payload = {
        "casual_remaining": float(bal.casual_remaining),
        "earned_remaining": float(bal.earned_remaining),
        "sick_remaining": float(bal.sick_remaining),
        "updated_at": bal.updated_at,
    }
    logger.info("MCP tool ok tool=get_leave_balance employee_id=%s requester_id=%s", employee_id, requester_id)
    return {"leave_balance": payload}


@tool("get_leave_history")
def get_leave_history(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        logger.info("MCP forbidden tool=get_leave_history requester_role=%s", requester_role)
        return err

    from apps.leaves.models import LeaveRequest

    qs = (
        LeaveRequest.objects.filter(employee_id=employee_id)
        .order_by("-created_at")
        .values("id", "leave_type", "from_date", "to_date", "days_count", "status", "spof_flag", "conflict_flag")[:20]
    )
    items = list(qs)
    logger.info("MCP tool ok tool=get_leave_history employee_id=%s count=%s", employee_id, len(items))
    return {"leave_history": items}


@tool("get_team_calendar")
def get_team_calendar(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    err = ensure_role(requester_role, ["manager", "hr", "cfo", "admin"])
    if err:
        logger.info("MCP forbidden tool=get_team_calendar requester_role=%s", requester_role)
        return err

    from apps.employees.models import Employee
    from apps.leaves.models import LeaveRequest

    emp = Employee.objects.select_related("manager").filter(pk=employee_id).first()
    if not emp:
        return {"error": "Employee not found", "code": "EMPLOYEE_NOT_FOUND"}

    manager_id = emp.manager_id or emp.id
    from_date = (input_data or {}).get("from_date")
    to_date = (input_data or {}).get("to_date")
    qs = LeaveRequest.objects.filter(
        employee__manager_id=manager_id,
        status=LeaveRequest.STATUS_APPROVED,
    )
    if from_date and to_date:
        qs = qs.filter(from_date__lte=to_date, to_date__gte=from_date)

    items = list(
        qs.select_related("employee")
        .order_by("-from_date")
        .values("id", "employee_id", "leave_type", "from_date", "to_date", "days_count", "status")[:50]
    )
    logger.info("MCP tool ok tool=get_team_calendar manager_id=%s count=%s", manager_id, len(items))
    return {"team_calendar": items}


@tool("apply_leave_batch")
def apply_leave_batch(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Apply multiple leave requests in one call.

    input_data must contain:
      leave_items: list of {type, days, from_date, to_date, reason}

    Returns:
      results: list of {leave_type, status, leave_id, error}
    """
    err = ensure_role(requester_role, ["employee", "hr", "admin"])
    if err:
        logger.info("MCP forbidden tool=apply_leave_batch requester_role=%s", requester_role)
        return err

    input_data = input_data or {}
    leave_items: list[dict] = input_data.get("leave_items") or []
    if not leave_items:
        return {"error": "leave_items is required", "code": "INVALID_INPUT"}

    try:
        from apps.employees.models import Employee
        from apps.leaves.models import LeaveRequest
        from apps.leaves.services import LeaveService
    except Exception as exc:
        return {"error": str(exc), "code": "IMPORT_ERROR"}

    requester_emp = Employee.objects.filter(user_id=requester_id).first()
    if requester_role == "employee":
        if not requester_emp or requester_emp.id != employee_id:
            return {"error": "Forbidden", "code": "FORBIDDEN"}

    employee = Employee.objects.select_related("user", "manager", "department").filter(pk=employee_id).first()
    if not employee:
        return {"error": "Employee not found", "code": "EMPLOYEE_NOT_FOUND"}

    results = []
    for item in leave_items:
        leave_type = item.get("type")
        from_date = _parse_date(item.get("from_date"))
        to_date = _parse_date(item.get("to_date"))
        reason = item.get("reason") or ""
        days_count = item.get("days")

        if not leave_type or not from_date or not to_date or days_count is None:
            results.append({
                "leave_type": leave_type,
                "status": "skipped",
                "error": "Missing required fields (type, from_date, to_date, days)",
            })
            continue

        try:
            days_count = float(days_count)
        except (TypeError, ValueError):
            results.append({"leave_type": leave_type, "status": "error", "error": "Invalid days_count"})
            continue

        # Deduplication
        existing = LeaveRequest.objects.filter(
            employee_id=employee_id,
            status=LeaveRequest.STATUS_PENDING,
            leave_type=leave_type,
            from_date=from_date,
            to_date=to_date,
            days_count=days_count,
        ).order_by("-created_at").first()
        if existing:
            results.append({
                "leave_type": leave_type,
                "status": "ok",
                "leave_id": existing.pk,
                "from_date": str(from_date),
                "to_date": str(to_date),
                "days_count": float(days_count),
                "deduped": True,
            })
            continue

        try:
            leave = LeaveService(employee).apply({
                "leave_type": leave_type,
                "from_date": from_date,
                "to_date": to_date,
                "days_count": days_count,
                "reason": reason,
            })
            results.append({
                "leave_type": leave_type,
                "status": "ok",
                "leave_id": leave.pk,
                "from_date": str(leave.from_date),
                "to_date": str(leave.to_date),
                "days_count": float(leave.days_count),
                "deduped": False,
            })
            logger.info(
                "MCP batch leave created leave_id=%s type=%s employee_id=%s",
                leave.pk, leave_type, employee.employee_id,
            )
        except Exception as exc:
            logger.exception("MCP batch leave failed type=%s employee_id=%s", leave_type, employee_id)
            results.append({"leave_type": leave_type, "status": "error", "error": str(exc)})

    return {"batch_results": results}


@resource("leave_policy_resource")
def leave_policy_resource() -> dict:
    try:
        base = Path(__file__).resolve().parents[3] / "rag" / "documents" / "leave_policy.txt"
        content = base.read_text(encoding="utf-8")
    except Exception as exc:
        logger.exception("Read leave policy resource failed")
        return {"error": str(exc)}
    return {"title": "Leave Policy", "content": content}
