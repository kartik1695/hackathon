import logging

from agents.state import AgentState

logger = logging.getLogger("hrms")


def run(state: AgentState) -> AgentState:
    # For multi-turn leave collection, SPOF check is only relevant when actually applying
    if state.get("intent") == "leave_collection" and state.get("collection_stage") not in ("applying", "done", None):
        state["spof_flag"] = False
        return state

    employee_id = state.get("employee_id")
    if not employee_id:
        state["spof_flag"] = False
        return state

    try:
        from apps.employees.models import Employee
    except ImportError as exc:
        logger.exception("Employee model import failed")
        state["spof_flag"] = False
        state["error"] = str(exc)
        return state

    employee = Employee.objects.select_related("department").filter(pk=employee_id).first()
    if not employee:
        state["spof_flag"] = False
        return state

    qs = Employee.objects.filter(is_active=True, department=employee.department).exclude(pk=employee.pk)
    if employee.title:
        qs = qs.filter(title=employee.title)

    peer_count = qs.count()
    spof_flag = peer_count == 0
    state["spof_flag"] = spof_flag
    logger.info("SPOF evaluated employee_id=%s spof=%s peer_count=%s", employee_id, spof_flag, peer_count)
    return state

