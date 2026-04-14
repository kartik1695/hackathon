import json
import logging
import time

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
        t0 = time.perf_counter()
        response = provider.complete(messages, temperature=0.3)
        logger.info("[PERF] llm_generate %.3fs provider=%s model=%s tokens=%s",
                    time.perf_counter() - t0, response.provider, response.model, response.tokens_used)
    except Exception as exc:
        logger.exception("LLM generation failed")
        state["llm_response"] = _fallback_response(state, error=str(exc))
        state["manager_context"] = state["llm_response"]
        state["error"] = str(exc)
        return state

    state["llm_response"] = response.content
    state["manager_context"] = response.content
    return state


def _build_messages(state: AgentState, LLMMessage) -> list:
    system = _get_system_prompt(state)
    context_blob = _build_human_context(state)
    current_query = ((state.get("input_data") or {}).get("query") or "").strip()

    messages = [LLMMessage(role="system", content=system)]

    # Inject conversation history so pronouns/references resolve naturally
    history = state.get("chat_history") or []
    for m in history[-12:]:
        role = m.get("role")
        if role not in ("user", "assistant"):
            continue
        content = (m.get("content") or "").strip()
        if not content:
            continue
        messages.append(LLMMessage(role=role, content=content))

    # Context blob (tool results, intent, flags) as a system-style note
    messages.append(LLMMessage(role="user", content=f"[CONTEXT]\n{context_blob}"))
    messages.append(LLMMessage(role="assistant", content="Understood. I have the context above."))

    # Current user query as a plain natural-language message — pronouns resolve
    # against the conversation history turns above, not the JSON blob
    if current_query:
        messages.append(LLMMessage(role="user", content=current_query))

    return messages


def _get_system_prompt(state: AgentState) -> str:
    intent = state.get("intent") or "nl_query"
    chat_summary = state.get("chat_summary") or ""
    base = (
        "You are an HRMS assistant. Use only the provided tool_results and retrieved_docs for "
        "factual answers. Do not invent dates, balances, policies, emails, or approvals.\n"
        "If prior_turn_tool_results is present, it contains data fetched in earlier turns of "
        "this conversation — treat it as trusted context when answering follow-up questions."
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
            '    Could you double-check the name or provide their Employee ID (e.g. EMP007)?"\n'
            "  • needs_disambiguation=true AND results>1:\n"
            "    Say: \"I found [N] employees matching '[query]'. Which one did you mean? Here are the options:\"\n"
            "    Then list each suggestion with: Name, Department, Title, Manager, Employee ID.\n"
            '    End with: "Please reply with the Employee ID (e.g. EMP003) to continue."\n'
            "  • needs_disambiguation=false AND results=1: Use that employee's data directly.\n\n"
            "=== ORG STRUCTURE RULES ===\n"
            "  • Manager chain: use tool_results.get_employee_manager_chain.manager_chain. "
            "    level=1 is immediate manager, level=2 is skip-level, etc.\n"
            "  • Direct reports: use tool_results.get_direct_reports.direct_reports. "
            "    Show name, title, department in a table or list.\n"
            "  • Largest teams / most reportees: use tool_results.get_largest_teams.managers_by_team_size. "
            "    Sort is already by direct_report_count desc. If the user asks for 'more than N reportees', "
            "    only list managers returned by the tool.\n"
            "  • Peers: use tool_results.get_peers.peers.\n"
            "  • Org tree: use tool_results.get_org_tree.org_tree. Format as indented hierarchy.\n\n"
            "=== CONTACT INFO RULES ===\n"
            "  • If email/phone_number is null in the result, say: "
            '    "Contact details are not available for your role."\n'
            "  • Never show null fields as if they were real data.\n\n"
            "=== FORMAT ===\n"
            "  • Be concise. Use lists or tables for multiple employees.\n"
            "  • For single-employee results, use a structured card: Name | Role | Dept | Manager | Email | Phone.\n"
            "  • For team/dept lists, show a compact table: Name | Title | Department.\n"
        )
    else:
        prompt = (
            "You are an HRMS assistant answering employee and HR questions using ONLY the provided tool_results and retrieved_docs.\n"
            "CRITICAL: Only state facts that are present in tool_results. Never guess, infer, or suggest data you do not have.\n"
            "If the user's message is a greeting or vague (e.g. 'whatsup', 'hi', 'hello'), respond with a friendly greeting "
            "and briefly list what you can help with (leave balance, team info, attendance, HR policies, org chart). Do not fabricate HR data.\n"
            "If the user asks about another employee and the tool_results do not include that data, do not guess. Instead:\n"
            "- Use tool_results.find_employee_by_name.results to show matching employees (name, employee_id, department).\n"
            "- If multiple matches, ask the user to pick one by employee_id.\n"
            "- If no matches, say so and suggest providing a more specific name or employee ID.\n"
            "If contact fields are present but null, say contact details are not available for your role.\n"
            "If tool_results contain get_employee_manager_chain, use manager_chain to answer manager/reporting questions.\n"
            "If tool_results contain get_direct_reports, use direct_reports to list team members.\n"
            "If a relevant tool was NOT called and you do not have the data, say 'I don't have that information yet — "
            "please ask me specifically (e.g. \"who are Kartik's direct reports?\")' rather than offering to look it up."
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
    tool_results = state.get("tool_results") or {}

    # Separate current-turn tools from pinned (prior-turn) tools so the LLM
    # knows which data is fresh vs from a previous turn.
    # Use _tools_called_this_turn (stamped by mcp_tools node) as the authoritative
    # set of freshly-fetched tools — avoids stale pinned data overriding fresh results.
    tools_called_this_turn = set(state.get("_tools_called_this_turn") or [])
    pinned = state.get("_pinned_tool_results") or {}
    if tools_called_this_turn:
        current_tools = {k: v for k, v in tool_results.items() if k in tools_called_this_turn}
        prior_tools   = {k: v for k, v in pinned.items() if k not in tools_called_this_turn}
    else:
        # Fallback: old key-exclusion logic
        current_tools = {k: v for k, v in tool_results.items() if k not in pinned}
        prior_tools   = {k: v for k, v in pinned.items() if k not in current_tools}

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
        "tool_results": tool_results,
        "retrieved_docs": state.get("retrieved_docs") or [],
    }
    # Include prior-turn pinned tool results as separate context key so LLM
    # can reference facts fetched in previous turns without hallucinating.
    if prior_tools:
        payload["prior_turn_tool_results"] = prior_tools

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
