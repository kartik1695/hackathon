import json
import logging

from agents.state import AgentState

logger = logging.getLogger("hrms")


def run(state: AgentState) -> AgentState:
    try:
        from core.llm.base import LLMMessage
        from core.llm.factory import LLMProviderFactory
    except ImportError as exc:
        logger.exception("LLM imports failed")
        state["llm_response"] = _fallback_response(state, error=str(exc))
        state["manager_context"] = state["llm_response"]
        state["error"] = str(exc)
        return state

    try:
        provider = LLMProviderFactory.get_provider()
        messages = _build_messages(state, LLMMessage)
        response = provider.complete(messages, temperature=0.3)
    except Exception as exc:
        logger.exception("LLM generation failed")
        state["llm_response"] = _fallback_response(state, error=str(exc))
        state["manager_context"] = state["llm_response"]
        state["error"] = str(exc)
        return state

    state["llm_response"] = response.content
    state["manager_context"] = response.content
    logger.info("LLM generation complete provider=%s model=%s", response.provider, response.model)
    return state


def _build_messages(state: AgentState, LLMMessage) -> list:
    system = _get_system_prompt(state)
    human = _build_human_context(state)
    messages = [LLMMessage(role="system", content=system)]
    history = state.get("chat_history") or []
    for m in history[-12:]:
        role = m.get("role")
        if role not in ("user", "assistant"):
            continue
        content = (m.get("content") or "").strip()
        if not content:
            continue
        messages.append(LLMMessage(role=role, content=content))
    messages.append(LLMMessage(role="user", content=human))
    return messages


def _get_system_prompt(state: AgentState) -> str:
    intent = state.get("intent") or "nl_query"
    chat_summary = state.get("chat_summary") or ""
    base = (
        "You are an HRMS assistant. Use only the provided tool_results and retrieved_docs for "
        "factual answers. Do not invent dates, balances, policies, emails, or approvals."
    )

    if intent == "leave_collection":
        prompt = _leave_collection_prompt(state)
    elif intent == "leave_application":
        prompt = "You are helping with leave application context, risks, and manager guidance."
    elif intent == "burnout_check":
        prompt = "You are assessing burnout signals and recommending supportive next steps."
    elif intent == "review_summary":
        prompt = "You are drafting a concise performance review summary from provided signals."
    elif intent == "policy_query":
        prompt = (
            "You are answering policy questions using retrieved policy chunks. "
            "If the user had an active leave application in progress, acknowledge it and "
            "encourage them to continue after reading the policy."
        )
    elif intent == "employee_query":
        prompt = (
            "You are an HRMS directory assistant. Answer questions about employees, teams, and org structure "
            "using ONLY the data in tool_results. Never invent names, emails, phone numbers, or org relationships.\n\n"
            "=== NAME DISAMBIGUATION RULES ===\n"
            "Check tool_results.find_employee_by_name:\n"
            "  • needs_disambiguation=true AND results=[]:\n"
            "    Say: \"I couldn't find anyone named '[query]'. This might be a spelling variation. "
            "    Could you double-check the name or provide their Employee ID (e.g. EMP007)?\"\n"
            "  • needs_disambiguation=true AND results>1:\n"
            "    Say: \"I found [N] employees matching '[query]'. Which one did you mean? Here are the options:\"\n"
            "    Then list each suggestion with: Name, Department, Title, Manager, Employee ID.\n"
            "    End with: \"Please reply with the Employee ID (e.g. EMP003) to continue.\"\n"
            "  • needs_disambiguation=false AND results=1: Use that employee's data directly.\n\n"
            "=== ORG STRUCTURE RULES ===\n"
            "  • Manager chain: use tool_results.get_employee_manager_chain.manager_chain. "
            "    level=1 is immediate manager, level=2 is skip-level, etc.\n"
            "  • Direct reports: use tool_results.get_direct_reports.direct_reports. "
            "    Show name, title, department in a table or list.\n"
            "  • Peers: use tool_results.get_peers.peers.\n"
            "  • Org tree: use tool_results.get_org_tree.org_tree. Format as indented hierarchy.\n\n"
            "=== CONTACT INFO RULES ===\n"
            "  • If email/phone_number is null in the result, say: "
            "    \"Contact details are not available for your role.\"\n"
            "  • Never show null fields as if they were real data.\n\n"
            "=== FORMAT ===\n"
            "  • Be concise. Use lists or tables for multiple employees.\n"
            "  • For single-employee results, use a structured card: Name | Role | Dept | Manager | Email | Phone.\n"
            "  • For team/dept lists, show a compact table: Name | Title | Department.\n"
        )
    else:
        prompt = (
            "You are answering employee and HR questions using provided context.\n"
            "If the user asks about another employee (for example: phone number, email, manager) and the tool_results "
            "do not include that contact info, do not guess. Instead:\n"
            "- Use tool_results.find_employee_by_name.results to show matching employees (name, employee_id, department, username).\n"
            "- If multiple matches exist, ask the user to pick one by employee_id.\n"
            "- If no matches exist, say so and suggest providing a more specific name.\n"
            "If contact fields are present but null, explain that access may be restricted by role.\n"
            "If the user asks about reporting lines (for example: manager's manager), use "
            "tool_results.get_employee_manager_chain.manager_chain to answer. The first item is the immediate manager; "
            "the second item (if present) is the manager's manager.\n"
            "If the user asks who reports to a manager, use tool_results.get_direct_reports.direct_reports to list direct reports."
        )

    summary = chat_summary.strip()
    suffix = f"\nConversation summary: {summary}" if summary else ""
    return f"{base}\n\n{prompt}{suffix}"


def _leave_collection_prompt(state: AgentState) -> str:
    """Build a stage-specific system prompt for the multi-turn leave collection flow."""
    try:
        from agents.nodes.leave_collector import get_collection_context
        ctx = get_collection_context(state)
    except Exception:
        ctx = {}

    stage = ctx.get("collection_stage") or state.get("collection_stage")
    instructions = ctx.get("stage_instructions") or ""
    leave_items = ctx.get("leave_items") or []
    violations = ctx.get("violations") or []

    items_text = ""
    if leave_items:
        lines = []
        for item in leave_items:
            status_icon = {"pending": "⏳", "details_collected": "✅", "applied": "🎉"}.get(item.get("status", ""), "•")
            lines.append(
                f"  {status_icon} {item.get('type_name')} ({item.get('days')} day(s)): "
                f"from={item.get('from_date') or '?'} to={item.get('to_date') or '?'} "
                f"reason={item.get('reason') or '?'} status={item.get('status')}"
            )
        items_text = "Leave items:\n" + "\n".join(lines)

    violations_text = ""
    if violations:
        lines = [f"  ⚠️  [{v.get('severity','warning').upper()}] {v.get('message','')}" for v in violations]
        violations_text = "Policy / balance violations:\n" + "\n".join(lines)

    base_instruction = (
        "You are a conversational HRMS leave assistant guiding the employee through a "
        "multi-step leave application for multiple leave types in a single session.\n\n"
        "Rules:\n"
        "- Be concise and friendly.\n"
        "- Ask for ONE leave type's details at a time (start date, end date, reason).\n"
        "- Always quote what you know about the employee's leave balance from tool_results.\n"
        "- When presenting violations, be clear but non-judgemental; explain the rule.\n"
        "- After all leaves are applied, provide a clean summary with leave IDs.\n"
    )

    parts = [base_instruction]
    if items_text:
        parts.append(items_text)
    if violations_text:
        parts.append(violations_text)
    if instructions:
        parts.append(f"YOUR NEXT ACTION: {instructions}")

    return "\n\n".join(parts)


def _build_human_context(state: AgentState) -> str:
    payload: dict = {
        "intent": state.get("intent"),
        "employee_id": state.get("employee_id"),
        "requester_role": state.get("requester_role"),
        "input_data": state.get("input_data") or {},
        "spof_flag": state.get("spof_flag"),
        "conflict_detected": state.get("conflict_detected"),
        "conflict_summary": state.get("conflict_summary"),
        "burnout_score": state.get("burnout_score"),
        "burnout_signals": state.get("burnout_signals"),
        "tool_results": state.get("tool_results") or {},
        "retrieved_docs": state.get("retrieved_docs") or [],
    }
    # Include collection state for leave_collection intent
    if state.get("intent") == "leave_collection":
        payload["leave_items"]       = state.get("leave_items") or []
        payload["collection_stage"]  = state.get("collection_stage")
        payload["collecting_index"]  = state.get("collecting_index")
        payload["policy_violations"] = state.get("policy_violations") or []
    return json.dumps(payload, default=str, ensure_ascii=False)


def _fallback_response(state: AgentState, error: str) -> str:
    intent = state.get("intent") or "nl_query"
    if intent == "leave_application":
        return f"AI unavailable. Leave checks complete. spof={state.get('spof_flag')} conflict={state.get('conflict_detected')} error={error}"
    if intent == "burnout_check":
        return f"AI unavailable. Burnout score={state.get('burnout_score')} signals={state.get('burnout_signals')} error={error}"
    if intent == "review_summary":
        return f"AI unavailable. Review context collected. error={error}"
    return f"AI unavailable. Context collected. error={error}"
