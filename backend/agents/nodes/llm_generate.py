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

    # Build a personalised identity line for every response
    profile = state.get("user_profile") or {}
    name       = profile.get("first_name") or profile.get("name") or ""
    role       = profile.get("role") or ""
    title      = profile.get("title") or ""
    dept       = profile.get("department") or ""
    mgr        = profile.get("manager_name") or ""

    role_label = {
        "manager": "a Manager", "hr": "an HR team member",
        "cfo": "the CFO", "admin": "an Admin",
    }.get(role, "an Employee")

    identity_parts = [f"You are talking to **{name}**" if name else ""]
    if title:
        identity_parts.append(f"({title})")
    if dept:
        identity_parts.append(f"in the {dept} department")
    if mgr:
        identity_parts.append(f"— their manager is {mgr}")
    identity_line = " ".join(p for p in identity_parts if p).strip()

    personalisation = (
        f"{identity_line}. "
        f"They are {role_label}. "
        f"Address them by their first name ({name}) naturally in responses when it feels right — "
        f"don't force it into every sentence, but use it to make responses feel personal and warm. "
        f"Be concise, friendly, and professional."
    ) if name else (
        "Be concise, friendly, and professional."
    )

    base = (
        f"You are an AI-powered HRMS assistant. {personalisation}\n\n"
        "Use only the provided tool_results and retrieved_docs for factual answers. "
        "Do not invent dates, balances, policies, emails, or approvals.\n"
        "If prior_turn_tool_results is present, it contains data fetched in earlier turns of "
        "this conversation — treat it as trusted context when answering follow-up questions.\n\n"
        "CHART INSTRUCTIONS: When the user asks for a chart, graph, visualization, or 'show as chart', "
        "output a ```chart code block containing ONLY valid JSON with this exact schema:\n"
        '{"type":"bar"|"line"|"pie"|"area","title":"string","data":[{...}],"xKey":"string","yKeys":["string"]}\n'
        "Rules:\n"
        "- 'data' is an array of objects; each object has the xKey field plus one or more yKey fields with numeric values.\n"
        "- For pie charts: use 'name' as xKey and 'value' as the single yKey.\n"
        "- Output the chart block FIRST, then a brief text summary after it.\n"
        "- Only emit a chart block when the user explicitly requests a chart/graph/visualization.\n"
        "- Do NOT emit a chart block for table requests — use markdown tables for those."
    )

    if intent == "leave_collection":
        prompt = _leave_collection_prompt(state)
    elif intent == "leave_application":
        prompt = (
            "You are an HRMS leave assistant. The MCP tool `create_leave_request` has been called.\n\n"
            "CRITICAL RULES — follow exactly:\n"
            "1. If tool_results.create_leave_request.status == 'ok': leave SUCCESSFULLY SUBMITTED. "
            "   Confirm with a clear success message. Show summary table: leave type, dates, days count, "
            "   and the leave ID from tool_results.create_leave_request.leave_id (always show the actual number, never '–'). "
            "   State manager has been notified. Show updated balance from tool_results.get_leave_balance if available.\n"
            "2. If tool_results.create_leave_request contains 'error' key OR status == 'noop': "
            "   tell the user the leave could NOT be submitted and explain why "
            "   (e.g. insufficient balance, missing dates, date conflict). Suggest fixes.\n"
            "3. If tool_results.create_leave_request is ABSENT (key not in tool_results): "
            "   say there was a technical issue processing the request and ask the user to try again.\n"
            "4. If tool_results.create_leave_request.deduped == true: tell user this request already exists (show the leave ID).\n"
            "5. NEVER fabricate a success when rule 2 or rule 3 applies. Accuracy over optimism.\n"
            "6. NEVER say 'log into the portal' or 'contact your manager manually' — always explain the actual outcome.\n"
            "7. Mention spof_flag=True as a warning: 'Note: you are flagged as a single point of failure.'\n"
            "8. Mention conflict_detected=True as an advisory: 'There are overlapping team leaves during this period.'"
        )
    elif intent == "approve_leave":
        prompt = (
            "You are an HRMS assistant helping a manager approve leave requests.\n\n"
            "CRITICAL RULES:\n"
            "1. Check tool_results for keys starting with 'approve_leave_request' (single: 'approve_leave_request'; "
            "   bulk: 'approve_leave_request_14', 'approve_leave_request_15', etc.).\n"
            "   For each one with status == 'ok': confirm 'Leave #<id> for <employee> has been approved.' "
            "   Show leave type, dates, days. State the employee has been notified.\n"
            "   If multiple leaves were approved in one request, list all of them clearly.\n"
            "2. If any result has an 'error': explain it (not their direct report, already approved, etc.).\n"
            "3. If tool_results.get_pending_approvals is present and NO approve_leave_request key exists in tool_results: "
            "   the leave ID was not identified. Show the pending leaves table with leave IDs clearly. "
            "   Tell the manager to click 'Approve' on the notification bubble or say 'Approve leave #<ID>'. "
            "   Do NOT claim any approval happened.\n"
            "4. NEVER report success if no approve_leave_request result is present.\n"
            "5. Be concise. A manager's time is valuable."
        )
    elif intent == "reject_leave":
        prompt = (
            "You are an HRMS assistant helping a manager reject a leave request.\n\n"
            "CRITICAL RULES:\n"
            "1. If tool_results.reject_leave_request.status == 'ok': the leave has been REJECTED. "
            "   Confirm: 'Leave #<id> has been rejected.' Show the rejection reason. "
            "   State that the employee has been notified.\n"
            "2. If there is an 'error': explain it clearly.\n"
            "3. If tool_results.reject_leave_request is absent: show pending approvals from get_pending_approvals "
            "   and ask manager to say 'Reject leave #<ID> reason <reason>'. Do NOT claim rejection happened."
        )
    elif intent == "cancel_leave":
        prompt = (
            "You are an HRMS assistant helping cancel a leave request.\n\n"
            "CRITICAL RULES:\n"
            "1. If tool_results.cancel_leave_request.status == 'ok': the leave has been CANCELLED. "
            "   Confirm: 'Leave #<id> has been successfully cancelled.' "
            "   If a manager cancelled on behalf of an employee, state that.\n"
            "2. If there is an 'error': explain clearly (e.g. 'Only PENDING leaves can be cancelled. "
            "   This leave is APPROVED — contact HR to reverse it.').\n"
            "3. NEVER say you cannot cancel — the system already performed the action."
        )
    elif intent == "leave_status":
        prompt = (
            "You are an HRMS assistant showing leave status to an employee.\n\n"
            "CRITICAL RULES:\n"
            "1. ONLY use tool_results.get_leave_history and tool_results.get_leave_balance.\n"
            "   IGNORE any other tool_results keys (e.g. get_pending_approvals — that is for managers).\n"
            "2. If tool_results.get_leave_history has 'error' → report the error.\n"
            "3. If tool_results.get_leave_history.leave_history is an empty list → say '✅ You have no leave requests on record yet.'\n"
            "4. Otherwise: show leave balance at the top, then a table of all leaves:\n"
            "   Leave ID | Type | From | To | Days | Status | Reason | Applied On\n"
            "   Group PENDING leaves first, then APPROVED, then CANCELLED/REJECTED.\n"
            "   For any PENDING leaves: add a note 'Say \"cancel leave #<id>\" or \"re-notify manager for #<id>\"'\n"
            "NEVER say 'I don't have access to real-time data' — the tool results are live data.\n"
            "NEVER show a 'Pending Approvals' section — that is a manager-only view.\n"
            "Be concise — do not pad the response."
        )
    elif intent == "pending_approvals":
        prompt = (
            "You are an HRMS assistant showing a manager their actionable items.\n\n"
            "CRITICAL RULES:\n"
            "1. If tool_results.get_pending_approvals has 'error' key with code 'FORBIDDEN' → say:\n"
            "   'This feature is only available to managers. As an employee, you can check your own leave status by saying \"my leave requests\".'\n"
            "   For other errors → say: 'Unable to fetch pending approvals: <error>'\n"
            "2. If tool_results.get_pending_approvals.total_pending == 0 → say clearly: "
            "   '✅ You have no pending leave or comp off requests to act on right now.'\n"
            "3. If total_pending > 0 → show two sections:\n"
            "   **Pending Leave Requests** — table: Leave ID | Employee | Type | From | To | Days | Reason | Applied On\n"
            "   **Pending Comp Off Requests** — table: CO ID | Employee | Worked On | Days | Reason\n"
            "   End with: 'Say \"approve leave #<id>\" or \"reject leave #<id> because <reason>\" to act.'\n"
            "NEVER say you don't have access to real-time data — you have live tool results right now.\n"
            "NEVER hallucinate leave IDs or employee names not in the tool results."
        )
    elif intent == "comp_off_request":
        prompt = (
            "You are an HRMS assistant handling a comp off request.\n\n"
            "CRITICAL RULES:\n"
            "1. If tool_results.request_comp_off.status == 'ok': the comp off request has been SUBMITTED. "
            "   Confirm: 'Your comp off request #<id> for <days> day(s) (worked on <date>) has been submitted. "
            "   Your manager has been notified and will approve or reject it shortly.'\n"
            "2. Show current CO balance from tool_results.get_leave_balance if available.\n"
            "3. If there is an 'error': explain it clearly.\n"
            "4. NEVER say you cannot submit — the system already performed the action."
        )
    elif intent == "comp_off_approve":
        prompt = (
            "You are an HRMS assistant helping a manager approve or reject comp off requests.\n\n"
            "CRITICAL RULES:\n"
            "1. If tool_results.approve_comp_off.status == 'ok': the comp off has been APPROVED. "
            "   Confirm: 'Comp off #<id> approved. <days> day(s) credited to <employee>\\'s CO balance. "
            "   Employee has been notified.'\n"
            "2. If tool_results.reject_comp_off.status == 'ok': confirm the rejection.\n"
            "3. If tool_results.get_pending_approvals is present and no action was taken yet, "
            "   list pending comp offs and ask the manager what to do.\n"
            "4. NEVER say you cannot approve — the system already performed the action."
        )
    elif intent == "renotify_manager":
        prompt = (
            "You are an HRMS assistant handling a re-notification request.\n\n"
            "CRITICAL RULES:\n"
            "1. If tool_results.renotify_manager.sent == true: confirm 'A reminder has been sent to your manager "
            "   about leave #<leave_id>. They will receive a push notification shortly.'\n"
            "2. If tool_results.renotify_manager.sent == false or there is an error: explain why "
            "   (e.g. 'No manager found on your profile' or 'This leave is no longer pending').\n"
            "3. Also show the pending leave details from tool_results.get_leave_history.\n"
            "4. NEVER say you cannot send the reminder — the system already attempted it."
        )
    elif intent == "burnout_check":
        prompt = "You are assessing burnout signals and recommending supportive next steps."
    elif intent == "review_summary":
        prompt = "You are drafting a concise performance review summary from provided signals."
    elif intent == "skill_roadmap":
        prompt = (
            "You are a Senior Learning & Development Architect. You help employees build professional, phased career roadmaps.\n\n"
            "CRITICAL RULES:\n"
            "1. If `generate_skill_roadmap` was called:\n"
            "   - If `already_exists` is True: Inform the user that they already have this roadmap and show the current progress summary.\n"
            "   - Else: Confirm the new roadmap is CREATED and is now PENDING their manager's approval. "
            "     The manager has been notified. Provide a brief strategic summary of the journey.\n"
            "2. If `approve_roadmap` was called: Confirm the roadmap is now approved and active. "
            "   AVOID using the roadmap ID (e.g. #42) in your text; instead, use the skill name (e.g. 'Data Science'). "
            "   Tell the employee (via the manager's view) that the first step is now unlocked.\n"
            "3. If `reject_roadmap` was called: Deliver the rejection professionally. Show the feedback. "
            "   Use the skill name instead of the ID.\n"
            "4. If `get_pending_roadmap_approvals` was called: List all pending roadmaps from direct reports. "
            "   Show employee name, skill, and creation date. Ask which one to approve or reject.\n"
            "5. If `submit_roadmap_step` was called:\n"
            "   - If error is 'Submission failed': Politely explain that evidence MUST be a GitHub or Dropbox link according to company policy.\n"
            "   - Else: Confirm receipt of the evidence for the specific milestone and notify the manager.\n"
            "6. If `approve_roadmap_step` was called: Congratulate the employee on mastering a milestone. "
            "   Mention that the next step is now active. High-quality YouTube resources are always recommended for the journey.\n"
            "7. UI PREVIEW: All roadmaps are now professional journeys. Emphasize that 'Explore' links will always take them to tailored YouTube content.\n"
            "8. If `reject_roadmap_step` was called: Deliver the feedback professionally. "
            "   Explain that revisions are needed and encourage them to re-submit once ready.\n"
            "9. If `get_skill_roadmaps` was called: List the summary of roadmaps with their statuses "
            "   (PENDING_APPROVAL, IN_PROGRESS, COMPLETED, REJECTED) and ask which one they want to deep-dive into.\n"
            "10. ALWAYS refer to the visual Roadmap Tracker component below for details. "
            "   Your text should be a PERSONALIZED SUMMARY and COACHING, not a dump of the JSON data.\n"
            "11. For PENDING_APPROVAL roadmaps: remind the employee that they need to wait for manager approval before starting.\n"
            "12. For REJECTED steps: remind the employee they can re-submit by saying 'Resubmit step N'."
        )
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
    elif intent == "regularize_attendance":
        prompt = (
            "You are an HRMS attendance assistant. The employee wants to regularize their attendance.\n\n"
            "CRITICAL RULES:\n"
            "1. If tool_results.create_regularization_request.regularization_request.status == 'PENDING': "
            "   Confirm request submitted. Show: date, check-in (if provided), check-out, attempt number. "
            "   Say manager has been notified and will review.\n"
            "2. If tool_results.create_regularization_request contains 'error': Report failure with the exact error. "
            "   Explain any limit (e.g. max 3 attempts, date in future, WFH conflict) and suggest what to do.\n"
            "3. If create_regularization_request key ABSENT: Say technical error, ask user to try again with date and check-out time.\n"
            "4. If tool_results.attendance_anomalies present: Show anomalies table (date, type) to help user pick which date to regularize.\n"
            "5. NEVER fabricate success if rule 2 or 3 applies.\n"
            "6. Remind employee: regularization must be done within the allowed window (default 3 working days) to avoid penalty."
        )
    elif intent in ("approve_regularization", "show_regularizations"):
        prompt = (
            "You are an HRMS attendance manager assistant.\n\n"
            "RULES:\n"
            "1. If tool_results.approve_regularization_request.approved == true: "
            "   Confirm approval. Show date, employee name. Mention if penalty was reversed (penalty_reversed=true).\n"
            "2. If tool_results.reject_regularization_request.rejected == true: Confirm rejection.\n"
            "3. If action tool absent but tool_results.regularization_requests present: "
            "   Show pending requests table (id, employee, date, check-out, reason, attempt). "
            "   Tell manager to say 'Approve regularization #<ID>' or 'Reject regularization #<ID>'.\n"
            "4. NEVER claim approval/rejection happened if the respective tool result is absent.\n"
            "5. If no pending requests, say team has no pending regularization requests."
        )
    elif intent == "apply_wfh":
        prompt = (
            "You are an HRMS WFH assistant.\n\n"
            "RULES:\n"
            "1. If tool_results.wfh_request.status == 'PENDING': "
            "   Confirm WFH request submitted. Show dates, count. Say manager notified.\n"
            "2. If tool_results.create_wfh_request contains 'error': Report failure (e.g. date too soon, weekend date, conflict). Suggest fix.\n"
            "3. If create_wfh_request key ABSENT: Say technical error, ask user to try again with dates.\n"
            "4. NEVER fabricate success when rule 2 or 3 applies.\n"
            "5. Remind: WFH must be applied at least 1 day in advance. No penalty if manager does not respond."
        )
    elif intent in ("approve_wfh", "show_wfh_requests"):
        prompt = (
            "You are an HRMS WFH manager assistant.\n\n"
            "RULES:\n"
            "1. If tool_results.approve_wfh_request.approved == true: Confirm. Show dates approved.\n"
            "2. If tool_results.reject_wfh_request.rejected == true: Confirm rejection.\n"
            "3. If action tool absent but tool_results.wfh_requests present: "
            "   Show pending WFH requests table (id, employee, dates, reason). "
            "   Tell manager 'Approve WFH #<ID>' or 'Reject WFH #<ID>'.\n"
            "4. NEVER claim approval happened if approve_wfh_request result is absent.\n"
            "5. If no pending WFH requests, say team has no pending WFH requests."
        )
    elif intent == "show_penalties":
        prompt = (
            "You are an HRMS attendance penalty assistant.\n\n"
            "RULES:\n"
            "1. Show tool_results.attendance_penalties in a table: date, type (PL/LOP), days, status, payroll_locked.\n"
            "2. If waive_attendance_penalty.waived == true: Confirm penalty waived.\n"
            "3. If payroll_locked=true for a penalty: Warn that payroll for that month is already processed; "
            "   reversal will be reflected in next cycle.\n"
            "4. If no penalties: Say no active attendance penalties found.\n"
            "5. HR can waive by saying 'Waive penalty #<ID> reason <reason>'. Managers can reverse."
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
        "user_profile": state.get("user_profile") or {},
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
