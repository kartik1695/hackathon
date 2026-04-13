import logging

from agents.state import AgentState

logger = logging.getLogger("hrms")


def run(state: AgentState) -> AgentState:
    state["conflict_detected"] = False
    state["conflict_summary"] = None

    # For multi-turn leave collection, only check conflicts when actually applying
    if state.get("intent") == "leave_collection" and state.get("collection_stage") not in ("applying", "done", None):
        return state

    employee_id = state.get("employee_id")
    input_data = state.get("input_data") or {}
    if not employee_id:
        return state

    try:
        from apps.leaves.models import LeaveRequest
    except ImportError as exc:
        logger.exception("LeaveRequest model import failed")
        state["error"] = str(exc)
        return state

    leave_id = input_data.get("leave_id")
    from_date = input_data.get("from_date")
    to_date = input_data.get("to_date")

    leave = None
    if leave_id:
        leave = LeaveRequest.objects.select_related("employee").filter(pk=leave_id).first()
        if leave:
            from_date = leave.from_date
            to_date = leave.to_date

    if not from_date or not to_date:
        return state

    overlaps = (
        LeaveRequest.objects.filter(employee_id=employee_id)
        .exclude(pk=leave.pk if leave else None)
        .filter(from_date__lte=to_date, to_date__gte=from_date)
        .exclude(status=LeaveRequest.STATUS_REJECTED)
        .order_by("-created_at")[:5]
    )
    overlap_list = list(overlaps)
    if overlap_list:
        state["conflict_detected"] = True
        state["conflict_summary"] = f"Overlapping leave requests found: {[lr.pk for lr in overlap_list]}"
        logger.info(
            "Leave conflict detected employee_id=%s from=%s to=%s overlap_count=%s",
            employee_id,
            from_date,
            to_date,
            len(overlap_list),
        )

    if leave:
        leave.conflict_flag = state["conflict_detected"]
        leave.conflict_context = {"overlaps": [lr.pk for lr in overlap_list], "from_date": str(from_date), "to_date": str(to_date)}
        leave.save(update_fields=["conflict_flag", "conflict_context", "updated_at"])

    return state

