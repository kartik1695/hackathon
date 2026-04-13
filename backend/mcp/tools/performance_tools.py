import logging

from mcp.rbac import ensure_role
from mcp.registry import prompt, tool

logger = logging.getLogger("hrms")


@tool("get_employee_goals")
def get_employee_goals(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    err = ensure_role(requester_role, ["employee", "manager", "hr", "cfo", "admin"])
    if err:
        logger.info("MCP forbidden tool=get_employee_goals requester_role=%s", requester_role)
        return err

    from apps.performance.models import Goal

    qs = (
        Goal.objects.filter(employee_id=employee_id)
        .order_by("-created_at")
        .values("id", "title", "description", "status", "created_at")[:50]
    )
    items = list(qs)
    logger.info("MCP tool ok tool=get_employee_goals employee_id=%s count=%s", employee_id, len(items))
    return {"goals": items}


@tool("get_review_cycles")
def get_review_cycles(employee_id: int, requester_id: int, requester_role: str, input_data: dict | None = None) -> dict:
    err = ensure_role(requester_role, ["manager", "hr", "cfo", "admin"])
    if err:
        logger.info("MCP forbidden tool=get_review_cycles requester_role=%s", requester_role)
        return err

    from apps.performance.models import ReviewCycle

    qs = (
        ReviewCycle.objects.filter(employee_id=employee_id)
        .order_by("-period_start", "-created_at")
        .values("id", "period_start", "period_end", "status", "ai_draft", "created_at")[:20]
    )
    items = list(qs)
    logger.info("MCP tool ok tool=get_review_cycles employee_id=%s count=%s", employee_id, len(items))
    return {"review_cycles": items}


@prompt("review_summary_prompt")
def review_summary_prompt() -> str:
    return "Summarize the employee's review cycle using goals and signals. Be concise, objective, and actionable."
