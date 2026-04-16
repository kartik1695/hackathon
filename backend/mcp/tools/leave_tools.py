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


# ── Read tools ────────────────────────────────────────────────────────────────

@tool("get_leave_balance")
def get_leave_balance(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        return err
    from apps.leaves.models import LeaveBalance
    bal = LeaveBalance.objects.select_related("employee").filter(employee_id=employee_id).first()
    if not bal:
        return {"leave_balance": None}
    payload = {
        "CL": {"label": "Casual Leave", "remaining": float(bal.casual_remaining)},
        "PL": {"label": "Privilege Leave", "remaining": float(bal.privilege_remaining)},
        "SL": {"label": "Sick Leave", "remaining": float(bal.sick_remaining)},
        "CO": {"label": "Comp Off", "remaining": float(bal.comp_off_remaining)},
        "LOP": {"label": "Loss of Pay", "remaining": None, "note": "Always available"},
        "updated_at": str(bal.updated_at),
    }
    logger.info("MCP tool ok tool=get_leave_balance employee_id=%s", employee_id)
    return {"leave_balance": payload}


@tool("get_leave_history")
def get_leave_history(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        return err
    from apps.leaves.models import LeaveRequest
    qs = (
        LeaveRequest.objects.filter(employee_id=employee_id)
        .order_by("-created_at")
        .values(
            "id", "leave_type", "from_date", "to_date", "days_count",
            "status", "reason", "is_half_day", "half_day_session",
            "spof_flag", "conflict_flag", "rejection_reason", "created_at",
        )[:30]
    )
    items = list(qs)
    logger.info("MCP tool ok tool=get_leave_history employee_id=%s count=%s", employee_id, len(items))
    return {"leave_history": items}


@tool("get_leave_details")
def get_leave_details(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Get details of a specific leave request by ID."""
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        return err
    input_data = input_data or {}
    leave_id = input_data.get("leave_id")
    if not leave_id:
        return {"error": "leave_id is required", "code": "INVALID_INPUT"}
    try:
        from apps.leaves.models import LeaveRequest
        leave = LeaveRequest.objects.select_related("employee__user", "approver", "applied_by").filter(pk=leave_id).first()
        if not leave:
            return {"error": "Leave not found", "code": "NOT_FOUND"}
        return {
            "leave": {
                "id": leave.pk,
                "employee_id": leave.employee.employee_id,
                "employee_name": leave.employee.user.name if leave.employee.user else "",
                "leave_type": leave.leave_type,
                "leave_type_display": leave.get_leave_type_display(),
                "from_date": str(leave.from_date),
                "to_date": str(leave.to_date),
                "days_count": float(leave.days_count),
                "reason": leave.reason,
                "is_half_day": leave.is_half_day,
                "half_day_session": leave.half_day_session,
                "status": leave.status,
                "rejection_reason": leave.rejection_reason,
                "spof_flag": leave.spof_flag,
                "conflict_flag": leave.conflict_flag,
                "ai_context_card": leave.ai_context_card,
                "applied_by": leave.applied_by.get_full_name() if leave.applied_by else None,
                "created_at": str(leave.created_at),
            }
        }
    except Exception as exc:
        logger.exception("MCP get_leave_details failed")
        return {"error": str(exc), "code": "TOOL_ERROR"}


@tool("get_pending_approvals")
def get_pending_approvals(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Manager: get all pending leave + comp off requests from direct reports."""
    err = ensure_role(requester_role, ["manager", "hr", "admin"])
    if err:
        return err
    try:
        from apps.employees.models import Employee
        from apps.leaves.models import CompOffRequest, LeaveRequest

        emp = Employee.objects.filter(pk=employee_id).first()
        if not emp:
            return {"error": "Employee not found", "code": "NOT_FOUND"}

        leaves = list(
            LeaveRequest.objects.filter(
                employee__manager_id=emp.id,
                status=LeaveRequest.STATUS_PENDING,
            )
            .select_related("employee__user", "employee__department")
            .order_by("created_at")
            .values(
                "id", "leave_type", "from_date", "to_date", "days_count",
                "reason", "is_half_day", "half_day_session",
                "spof_flag", "conflict_flag", "ai_context_card",
                "employee__employee_id", "employee__user__name",
                "created_at",
            )[:20]
        )
        comp_offs = list(
            CompOffRequest.objects.filter(
                employee__manager_id=emp.id,
                status=CompOffRequest.STATUS_PENDING,
            )
            .select_related("employee__user")
            .order_by("created_at")
            .values("id", "worked_on", "days_claimed", "reason", "employee__employee_id", "employee__user__name", "created_at")[:10]
        )

        logger.info(
            "MCP tool ok tool=get_pending_approvals manager_id=%s leaves=%s comp_offs=%s",
            employee_id, len(leaves), len(comp_offs),
        )
        return {
            "pending_leaves": leaves,
            "pending_comp_offs": comp_offs,
            "total_pending": len(leaves) + len(comp_offs),
        }
    except Exception as exc:
        logger.exception("MCP get_pending_approvals failed")
        return {"error": str(exc), "code": "TOOL_ERROR"}


@tool("get_team_calendar")
def get_team_calendar(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    err = ensure_role(requester_role, ["manager", "hr", "cfo", "admin"])
    if err:
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
        qs.select_related("employee__user")
        .order_by("-from_date")
        .values("id", "employee_id", "leave_type", "from_date", "to_date", "days_count", "status",
                "is_half_day", "half_day_session", "employee__user__name")[:50]
    )
    logger.info("MCP tool ok tool=get_team_calendar manager_id=%s count=%s", manager_id, len(items))
    return {"team_calendar": items}


# ── Write/action tools ────────────────────────────────────────────────────────

@tool("create_leave_request")
def create_leave_request(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    err = ensure_role(requester_role, ["employee", "hr", "admin", "manager"])
    if err:
        return err
    input_data = input_data or {}
    leave_type = input_data.get("leave_type")
    from_date = _parse_date(input_data.get("from_date"))
    to_date = _parse_date(input_data.get("to_date"))
    reason = input_data.get("reason", "")
    is_half_day = bool(input_data.get("is_half_day", False))
    half_day_session = input_data.get("half_day_session", "")

    if not leave_type or not from_date or not to_date:
        return {"status": "noop", "error": "leave_type, from_date, to_date are required"}

    try:
        from apps.employees.models import Employee
        from apps.leaves.models import LeaveRequest
        from apps.leaves.services import LeaveService
    except Exception as exc:
        return {"error": str(exc), "code": "IMPORT_ERROR"}

    # Access control: employee can only apply for themselves
    requester_emp = Employee.objects.filter(user_id=requester_id).first()
    if requester_role == "employee":
        if not requester_emp or requester_emp.id != employee_id:
            return {"error": "Forbidden", "code": "FORBIDDEN"}

    # For manager applying on behalf: enforce direct report relationship
    if requester_role == "manager" and requester_emp and requester_emp.id != employee_id:
        from apps.employees.models import Employee as Emp
        target = Emp.objects.filter(pk=employee_id).first()
        if not target or target.manager_id != requester_emp.id:
            return {"error": "You can only apply leave for your direct reports", "code": "FORBIDDEN"}

    # Deduplication check
    if not is_half_day:
        existing = LeaveRequest.objects.filter(
            employee_id=employee_id,
            status=LeaveRequest.STATUS_PENDING,
            leave_type=leave_type,
            from_date=from_date,
            to_date=to_date,
        ).order_by("-created_at").first()
        if existing:
            return {"status": "ok", "leave_id": existing.pk, "deduped": True}

    employee = Employee.objects.select_related("user", "manager", "department").filter(pk=employee_id).first()
    if not employee:
        return {"error": "Employee not found", "code": "EMPLOYEE_NOT_FOUND"}

    try:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        applied_by = User.objects.filter(pk=requester_id).first()
        leave = LeaveService(employee).apply(
            {
                "leave_type": leave_type,
                "from_date": from_date,
                "to_date": to_date,
                "reason": reason,
                "is_half_day": is_half_day,
                "half_day_session": half_day_session,
            },
            applied_by=applied_by,
        )
    except Exception as exc:
        return {"error": str(exc), "code": "LEAVE_CREATE_FAILED"}

    logger.info("MCP tool ok tool=create_leave_request leave_id=%s employee_id=%s", leave.pk, employee.employee_id)
    return {
        "status": "ok",
        "leave_id": leave.pk,
        "employee_id": employee.employee_id,
        "leave_type": leave.leave_type,
        "leave_type_display": leave.get_leave_type_display(),
        "from_date": str(leave.from_date),
        "to_date": str(leave.to_date),
        "days_count": float(leave.days_count),
        "is_half_day": leave.is_half_day,
        "half_day_session": leave.half_day_session,
        "deduped": False,
    }


@tool("approve_leave_request")
def approve_leave_request(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Manager approves a leave request via chat."""
    err = ensure_role(requester_role, ["manager", "hr", "admin"])
    if err:
        return err
    input_data = input_data or {}
    leave_id = input_data.get("leave_id")
    if not leave_id:
        return {"error": "leave_id is required", "code": "INVALID_INPUT"}
    try:
        from django.contrib.auth import get_user_model
        from apps.leaves.models import LeaveRequest
        from apps.leaves.services import LeaveService

        User = get_user_model()
        leave = LeaveRequest.objects.select_related("employee__user", "employee__manager").filter(pk=leave_id).first()
        if not leave:
            return {"error": f"Leave #{leave_id} not found", "code": "NOT_FOUND"}

        approver = User.objects.filter(pk=requester_id).first()
        if not approver:
            return {"error": "Approver user not found", "code": "NOT_FOUND"}

        leave = LeaveService(leave.employee).approve(leave, approver)
        logger.info("MCP tool ok tool=approve_leave_request leave_id=%s approver_id=%s", leave_id, requester_id)
        return {
            "status": "ok",
            "leave_id": leave.pk,
            "employee_id": leave.employee.employee_id,
            "leave_type": leave.leave_type,
            "from_date": str(leave.from_date),
            "to_date": str(leave.to_date),
            "days_count": float(leave.days_count),
            "new_status": leave.status,
        }
    except PermissionError as exc:
        return {"error": str(exc), "code": "FORBIDDEN"}
    except Exception as exc:
        logger.exception("MCP approve_leave_request failed leave_id=%s", leave_id)
        return {"error": str(exc), "code": "APPROVE_FAILED"}


@tool("reject_leave_request")
def reject_leave_request(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Manager rejects a leave request with an optional reason."""
    err = ensure_role(requester_role, ["manager", "hr", "admin"])
    if err:
        return err
    input_data = input_data or {}
    leave_id = input_data.get("leave_id")
    rejection_reason = input_data.get("rejection_reason", "")
    if not leave_id:
        return {"error": "leave_id is required", "code": "INVALID_INPUT"}
    try:
        from django.contrib.auth import get_user_model
        from apps.leaves.models import LeaveRequest
        from apps.leaves.services import LeaveService

        User = get_user_model()
        leave = LeaveRequest.objects.select_related("employee__user", "employee__manager").filter(pk=leave_id).first()
        if not leave:
            return {"error": f"Leave #{leave_id} not found", "code": "NOT_FOUND"}

        approver = User.objects.filter(pk=requester_id).first()
        if not approver:
            return {"error": "Approver user not found", "code": "NOT_FOUND"}

        leave = LeaveService(leave.employee).reject(leave, approver, rejection_reason)
        logger.info("MCP tool ok tool=reject_leave_request leave_id=%s approver_id=%s", leave_id, requester_id)
        return {
            "status": "ok",
            "leave_id": leave.pk,
            "new_status": leave.status,
            "rejection_reason": leave.rejection_reason,
        }
    except PermissionError as exc:
        return {"error": str(exc), "code": "FORBIDDEN"}
    except Exception as exc:
        logger.exception("MCP reject_leave_request failed leave_id=%s", leave_id)
        return {"error": str(exc), "code": "REJECT_FAILED"}


@tool("cancel_leave_request")
def cancel_leave_request(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Employee cancels their own pending leave, or manager cancels a team member's leave."""
    err = ensure_role(requester_role, ["employee", "manager", "hr", "admin"])
    if err:
        return err
    input_data = input_data or {}
    leave_id = input_data.get("leave_id")
    if not leave_id:
        return {"error": "leave_id is required", "code": "INVALID_INPUT"}
    try:
        from django.contrib.auth import get_user_model
        from apps.leaves.models import LeaveRequest
        from apps.leaves.services import LeaveService

        User = get_user_model()
        leave = LeaveRequest.objects.select_related("employee__user", "employee__manager").filter(pk=leave_id).first()
        if not leave:
            return {"error": f"Leave #{leave_id} not found", "code": "NOT_FOUND"}

        requester = User.objects.filter(pk=requester_id).first()
        if not requester:
            return {"error": "Requester user not found", "code": "NOT_FOUND"}

        leave = LeaveService(leave.employee).cancel(leave, requester)
        logger.info("MCP tool ok tool=cancel_leave_request leave_id=%s requester_id=%s", leave_id, requester_id)
        return {"status": "ok", "leave_id": leave.pk, "new_status": leave.status}
    except PermissionError as exc:
        return {"error": str(exc), "code": "FORBIDDEN"}
    except ValueError as exc:
        return {"error": str(exc), "code": "CANCEL_FAILED"}
    except Exception as exc:
        logger.exception("MCP cancel_leave_request failed leave_id=%s", leave_id)
        return {"error": str(exc), "code": "CANCEL_FAILED"}


@tool("renotify_manager")
def renotify_manager(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Employee re-notifies their manager about a still-pending leave."""
    err = ensure_role(requester_role, ["employee"])
    if err:
        return err
    input_data = input_data or {}
    leave_id = input_data.get("leave_id")
    if not leave_id:
        return {"error": "leave_id is required", "code": "INVALID_INPUT"}
    try:
        from django.contrib.auth import get_user_model
        from apps.leaves.models import LeaveRequest
        from apps.leaves.services import LeaveService

        User = get_user_model()
        leave = LeaveRequest.objects.select_related("employee__user", "employee__manager__user").filter(pk=leave_id).first()
        if not leave:
            return {"error": f"Leave #{leave_id} not found", "code": "NOT_FOUND"}

        requester = User.objects.filter(pk=requester_id).first()
        sent = LeaveService(leave.employee).renotify_manager(leave, requester)
        return {"status": "ok", "sent": sent, "leave_id": leave_id}
    except (PermissionError, ValueError) as exc:
        return {"error": str(exc), "code": "RENOTIFY_FAILED"}
    except Exception as exc:
        logger.exception("MCP renotify_manager failed leave_id=%s", leave_id)
        return {"error": str(exc), "code": "RENOTIFY_FAILED"}


@tool("request_comp_off")
def request_comp_off(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Employee requests comp off credit for working on a holiday/weekend."""
    # Managers also work weekends/holidays — they must be able to claim comp off too
    err = ensure_role(requester_role, ["employee", "manager", "hr", "admin"])
    if err:
        return err
    input_data = input_data or {}
    worked_on = _parse_date(input_data.get("worked_on"))
    days_claimed = input_data.get("days_claimed", 1.0)
    reason = input_data.get("reason", "")

    if not worked_on:
        return {"error": "worked_on date is required", "code": "INVALID_INPUT"}
    try:
        days_claimed = float(days_claimed)
    except (TypeError, ValueError):
        return {"error": "Invalid days_claimed", "code": "INVALID_INPUT"}

    try:
        from apps.employees.models import Employee
        from apps.leaves.services import CompOffService

        emp = Employee.objects.filter(pk=employee_id).first()
        if not emp:
            return {"error": "Employee not found", "code": "NOT_FOUND"}

        requester_emp = Employee.objects.filter(user_id=requester_id).first()
        # Employees and managers can only claim for themselves; HR/admin can claim for anyone
        if requester_role in ("employee", "manager") and (not requester_emp or requester_emp.id != employee_id):
            return {"error": "Forbidden", "code": "FORBIDDEN"}

        req = CompOffService(emp).request(worked_on=worked_on, days_claimed=days_claimed, reason=reason)
        logger.info("MCP tool ok tool=request_comp_off comp_off_id=%s employee_id=%s", req.pk, emp.employee_id)
        return {
            "status": "ok",
            "comp_off_id": req.pk,
            "worked_on": str(req.worked_on),
            "days_claimed": float(req.days_claimed),
            "request_status": req.status,
        }
    except Exception as exc:
        logger.exception("MCP request_comp_off failed")
        return {"error": str(exc), "code": "COMP_OFF_FAILED"}


@tool("approve_comp_off")
def approve_comp_off(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Manager approves a comp off request — credits employee's CO balance."""
    err = ensure_role(requester_role, ["manager", "hr", "admin"])
    if err:
        return err
    input_data = input_data or {}
    comp_off_id = input_data.get("comp_off_id")
    if not comp_off_id:
        return {"error": "comp_off_id is required", "code": "INVALID_INPUT"}
    try:
        from django.contrib.auth import get_user_model
        from apps.leaves.models import CompOffRequest
        from apps.leaves.services import CompOffService

        User = get_user_model()
        req = CompOffRequest.objects.select_related("employee__user", "employee__manager").filter(pk=comp_off_id).first()
        if not req:
            return {"error": f"Comp off request #{comp_off_id} not found", "code": "NOT_FOUND"}

        approver = User.objects.filter(pk=requester_id).first()
        req = CompOffService(req.employee).approve(req, approver)
        logger.info("MCP tool ok tool=approve_comp_off comp_off_id=%s approver_id=%s", comp_off_id, requester_id)
        return {
            "status": "ok",
            "comp_off_id": req.pk,
            "employee_id": req.employee.employee_id,
            "days_credited": float(req.days_claimed),
            "new_status": req.status,
        }
    except (PermissionError, ValueError) as exc:
        return {"error": str(exc), "code": "APPROVE_COMP_OFF_FAILED"}
    except Exception as exc:
        logger.exception("MCP approve_comp_off failed comp_off_id=%s", comp_off_id)
        return {"error": str(exc), "code": "APPROVE_COMP_OFF_FAILED"}


@tool("reject_comp_off")
def reject_comp_off(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Manager rejects a comp off request."""
    err = ensure_role(requester_role, ["manager", "hr", "admin"])
    if err:
        return err
    input_data = input_data or {}
    comp_off_id = input_data.get("comp_off_id")
    rejection_reason = input_data.get("rejection_reason", "")
    if not comp_off_id:
        return {"error": "comp_off_id is required", "code": "INVALID_INPUT"}
    try:
        from django.contrib.auth import get_user_model
        from apps.leaves.models import CompOffRequest
        from apps.leaves.services import CompOffService

        User = get_user_model()
        req = CompOffRequest.objects.select_related("employee__user", "employee__manager").filter(pk=comp_off_id).first()
        if not req:
            return {"error": f"Comp off request #{comp_off_id} not found", "code": "NOT_FOUND"}

        approver = User.objects.filter(pk=requester_id).first()
        req = CompOffService(req.employee).reject(req, approver, rejection_reason)
        return {"status": "ok", "comp_off_id": req.pk, "new_status": req.status}
    except (PermissionError, ValueError) as exc:
        return {"error": str(exc), "code": "REJECT_COMP_OFF_FAILED"}
    except Exception as exc:
        logger.exception("MCP reject_comp_off failed comp_off_id=%s", comp_off_id)
        return {"error": str(exc), "code": "REJECT_COMP_OFF_FAILED"}


@tool("apply_leave_batch")
def apply_leave_batch(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    """Apply multiple leave requests in one call.

    input_data must contain:
      leave_items: list of {type, from_date, to_date, reason, is_half_day, half_day_session}
    """
    err = ensure_role(requester_role, ["employee", "hr", "admin", "manager"])
    if err:
        return err
    input_data = input_data or {}
    leave_items: list[dict] = input_data.get("leave_items") or []
    if not leave_items:
        return {"error": "leave_items is required", "code": "INVALID_INPUT"}

    try:
        from django.contrib.auth import get_user_model
        from apps.employees.models import Employee
        from apps.leaves.models import LeaveRequest
        from apps.leaves.services import LeaveService

        User = get_user_model()
        requester_emp = Employee.objects.filter(user_id=requester_id).first()
        if requester_role == "employee":
            if not requester_emp or requester_emp.id != employee_id:
                return {"error": "Forbidden", "code": "FORBIDDEN"}

        employee = Employee.objects.select_related("user", "manager", "department").filter(pk=employee_id).first()
        if not employee:
            return {"error": "Employee not found", "code": "EMPLOYEE_NOT_FOUND"}

        applied_by = User.objects.filter(pk=requester_id).first()
    except Exception as exc:
        return {"error": str(exc), "code": "IMPORT_ERROR"}

    results = []
    for item in leave_items:
        leave_type = item.get("type") or item.get("leave_type")
        from_date = _parse_date(item.get("from_date"))
        to_date = _parse_date(item.get("to_date"))
        reason = item.get("reason", "")
        is_half_day = bool(item.get("is_half_day", False))
        half_day_session = item.get("half_day_session", "")

        if not leave_type or not from_date or not to_date:
            results.append({
                "leave_type": leave_type,
                "status": "skipped",
                "error": "Missing required fields (type, from_date, to_date)",
            })
            continue

        # Deduplication
        existing = LeaveRequest.objects.filter(
            employee_id=employee_id,
            status=LeaveRequest.STATUS_PENDING,
            leave_type=leave_type,
            from_date=from_date,
            to_date=to_date,
        ).order_by("-created_at").first()
        if existing:
            results.append({
                "leave_type": leave_type,
                "status": "ok",
                "leave_id": existing.pk,
                "from_date": str(from_date),
                "to_date": str(to_date),
                "deduped": True,
            })
            continue

        try:
            leave = LeaveService(employee).apply({
                "leave_type": leave_type,
                "from_date": from_date,
                "to_date": to_date,
                "reason": reason,
                "is_half_day": is_half_day,
                "half_day_session": half_day_session,
            }, applied_by=applied_by)
            results.append({
                "leave_type": leave_type,
                "status": "ok",
                "leave_id": leave.pk,
                "from_date": str(leave.from_date),
                "to_date": str(leave.to_date),
                "days_count": float(leave.days_count),
                "deduped": False,
            })
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
