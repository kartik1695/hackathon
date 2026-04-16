import logging
import time

from agents.state import AgentState

logger = logging.getLogger("hrms")

_TOOLS_BY_INTENT: dict[str, list[str]] = {
    # Single-leave background-task flow (Celery)
    "leave_application": ["create_leave_request", "get_employee_profile", "get_leave_balance", "get_team_calendar", "get_leave_history"],
    # Multi-turn chat flow — tools differ by collection stage (resolved at runtime below)
    "leave_collection": ["get_employee_profile", "get_leave_balance", "get_leave_history"],
    # Manager leave actions
    "approve_leave": ["get_pending_approvals", "approve_leave_request", "get_leave_details"],
    "reject_leave": ["reject_leave_request", "get_leave_details"],
    "cancel_leave": ["cancel_leave_request", "get_leave_history", "get_leave_details"],
    # Leave status / actionables
    "leave_status": ["get_leave_history", "get_leave_balance"],
    "pending_approvals": ["get_pending_approvals"],
    # Comp off
    "comp_off_request": ["request_comp_off", "get_leave_balance"],
    "comp_off_approve": ["get_pending_approvals", "approve_comp_off", "reject_comp_off"],
    # Re-notify
    "renotify_manager": ["renotify_manager", "get_leave_history"],
    # Other intents
    "burnout_check": ["get_attendance_summary", "get_attendance_anomalies"],
    "review_summary": ["get_employee_goals", "get_review_cycles"],
    "nl_query": ["find_employee_by_name", "get_employee_profile"],
    # Employee directory / org queries — planner picks the right tool
    "employee_query": [],  # fully LLM-planned; see _plan_next_tool_call
}

def _first_json_object(text: str) -> dict | None:
    try:
        import json
    except Exception:
        return None
    s = (text or "").strip()
    if not s:
        return None
    start = s.find("{")
    end = s.rfind("}")
    if start < 0 or end < 0 or end <= start:
        return None
    try:
        return json.loads(s[start : end + 1])
    except Exception:
        return None


def _allow_personal_details() -> bool:
    try:
        from django.conf import settings as django_settings
    except Exception:
        return False
    return bool(getattr(django_settings, "ALLOW_DIRECTORY_PERSONAL_DETAILS", False))


def _safe_json_dumps(obj) -> str:
    try:
        import json
        return json.dumps(obj, ensure_ascii=False, default=str)
    except Exception:
        return str(obj)


def _self_referential_plan(query: str, state: AgentState, already_called: list[str]) -> dict | None:
    """
    Deterministic planner for queries that refer to the requester themselves
    (queries containing 'my team', 'my manager', 'who am i', etc.).
    Returns a tool-call spec dict or None if the query is not self-referential.
    This runs BEFORE the LLM planner to avoid unnecessary round-trips.
    """
    q = query.lower().strip()
    requester_emp_id = state.get("employee_id")  # requester's own DB employee id

    # ── Self profile ────────────────────────────────────────────────────────
    SELF_PROFILE_TRIGGERS = (
        "who am i", "my profile", "my role", "my title", "my department",
        "my dept", "my employee id", "my details", "show me my", "my information",
        "my info", "my designation",
    )
    if any(t in q for t in SELF_PROFILE_TRIGGERS):
        if "get_my_profile" not in already_called:
            return {"tool_name": "get_my_profile", "employee_id": requester_emp_id, "input_data": {}}

    # ── My manager / who is my manager ──────────────────────────────────────
    MY_MANAGER_TRIGGERS = (
        "my manager", "who is my manager", "who's my manager", "who manages me",
        "who do i report to", "my reporting manager", "my boss",
    )
    if any(t in q for t in MY_MANAGER_TRIGGERS):
        if "get_employee_manager_chain" not in already_called:
            return {"tool_name": "get_employee_manager_chain", "employee_id": requester_emp_id, "input_data": {}}

    # ── My team / my direct reports ─────────────────────────────────────────
    MY_TEAM_TRIGGERS = (
        "my team", "my direct reports", "who reports to me", "who is in my team",
        "people in my team", "members of my team", "my reportees", "my reportees",
        "my subordinates", "list my team", "show my team", "how many people do i manage",
        "how many reports do i have", "my employees",
    )
    if any(t in q for t in MY_TEAM_TRIGGERS):
        if "get_direct_reports" not in already_called:
            return {"tool_name": "get_direct_reports", "employee_id": requester_emp_id, "input_data": {}}

    # ── My peers / my colleagues ─────────────────────────────────────────────
    MY_PEERS_TRIGGERS = (
        "my peers", "my colleagues", "my teammates", "who are my peers",
        "who are my colleagues", "who else is in my team",
        "same team as me", "people in my department",
    )
    if any(t in q for t in MY_PEERS_TRIGGERS):
        if "get_peers" not in already_called:
            return {"tool_name": "get_peers", "employee_id": requester_emp_id, "input_data": {}}

    # ── My org tree ──────────────────────────────────────────────────────────
    MY_ORG_TRIGGERS = (
        "my org chart",
        "my org tree",
        "my org structure",
        "my full team",
        "org chart",
        "org tree",
        "org structure",
        "org hierarchy",
        "entire team under me",
        "all employees under me",
    )
    if any(t in q for t in MY_ORG_TRIGGERS):
        if "get_org_tree" not in already_called:
            return {"tool_name": "get_org_tree", "employee_id": requester_emp_id, "input_data": {}}

    return None


def _resolve_pronoun_employee_id(
    query: str, tool_results: dict, state: "AgentState | None" = None
) -> int | None:
    """
    Resolve a pronoun (him/her/his/their/he/she/they) to a DB employee id.

    Resolution order:
      1. Entity log (most recent turn's focus_employee_id) — most reliable
      2. manager_chain level=2 then level=1 — handles "his team" after manager query
      3. find_employee_by_name single result
      4. get_direct_reports single result
    """
    PRONOUNS = ("him", "her", "his", "their", "he", "she", "they", "them")
    ql = query.lower()
    if not any(p in ql.split() for p in PRONOUNS):
        return None

    # 1. Entity log — check the most recent turns for a focused employee
    if state is not None:
        session_id = state.get("chat_session_id") or ""
        if session_id:
            try:
                from apps.ai.memory import ChatMemoryCache
                mem = ChatMemoryCache()
                entity_log = mem.get_entity_log(session_id, last_n=5)
                # Walk backwards — most recent first
                for entry in reversed(entity_log):
                    focus_id = entry.get("focus_employee_id")
                    if focus_id:
                        logger.info(
                            "MCP pronoun resolved via entity_log id=%s from turn: %s",
                            focus_id, entry.get("turn_query", "")[:60],
                        )
                        return int(focus_id)
            except Exception:
                logger.exception("Entity log pronoun resolution failed")

    # 2: manager chain — prefer skip-level (level=2) for "his team" after manager query
    chain_data = (tool_results.get("get_employee_manager_chain") or {}).get("manager_chain") or []
    if chain_data:
        chain_data_sorted = sorted(chain_data, key=lambda x: x.get("level", 0), reverse=True)
        for entry in chain_data_sorted:
            if entry.get("id"):
                return int(entry["id"])

    # 3: last name search result
    name_results = (tool_results.get("find_employee_by_name") or {}).get("results") or []
    if len(name_results) == 1 and name_results[0].get("id"):
        return int(name_results[0]["id"])

    # 4: first direct report (handles "what about him?" after a team listing)
    reports = (tool_results.get("get_direct_reports") or {}).get("direct_reports") or []
    if len(reports) == 1 and reports[0].get("id"):
        return int(reports[0]["id"])

    return None


def _direct_reports_plan(
    query: str, tool_results: dict, already_called: list[str], state: "AgentState | None" = None
) -> dict | None:
    q = (query or "").strip()
    ql = q.lower()

    triggers = (
        "who reports to ",
        "who is reporting to ",
        "direct reports of ",
        "reportees of ",
        "team of ",
        "people reporting to ",
        "people who report to ",
    )
    # Pronoun query: "who else reports to him/her" — resolve from prior tool results
    PRONOUNS = ("him", "her", "his", "their", "he", "she", "they", "them")
    query_words = ql.split()
    if any(p in query_words for p in PRONOUNS):
        if "get_direct_reports" not in already_called:
            resolved_id = _resolve_pronoun_employee_id(q, tool_results, state=state)
            if resolved_id:
                logger.info(
                    "MCP planner pronoun-resolved tool=get_direct_reports employee_id=%s query=%s",
                    resolved_id, q,
                )
                return {"tool_name": "get_direct_reports", "employee_id": resolved_id, "input_data": {}}
        return None

    if not any(t in ql for t in triggers):
        return None

    if any(
        t in ql
        for t in (
            "who reports to me",
            "who is reporting to me",
            "my direct reports",
            "my team",
        )
    ):
        return None

    if (
        "find_employee_by_name" in already_called
        and "get_direct_reports" not in already_called
    ):
        match = tool_results.get("find_employee_by_name") or {}
        results = match.get("results") or []
        if len(results) == 1 and results[0].get("id"):
            return {
                "tool_name": "get_direct_reports",
                "employee_id": results[0]["id"],
                "input_data": {},
            }
        return None

    if "find_employee_by_name" in already_called:
        return None

    name = ""
    if "who is reporting to " in ql:
        name = ql.split("who is reporting to ", 1)[1]
    elif "who reports to " in ql:
        name = ql.split("who reports to ", 1)[1]
    elif "people reporting to " in ql:
        name = ql.split("people reporting to ", 1)[1]
    elif "people who report to " in ql:
        name = ql.split("people who report to ", 1)[1]
    elif "direct reports of " in ql:
        name = ql.split("direct reports of ", 1)[1]
    elif "reportees of " in ql:
        name = ql.split("reportees of ", 1)[1]
    elif "team of " in ql:
        name = ql.split("team of ", 1)[1]

    name = (name or "").strip().strip("?.!,;:")
    if not name:
        return None

    return {
        "tool_name": "find_employee_by_name",
        "employee_id": None,
        "input_data": {"query": name},
    }


def _plan_next_tool_call(
    state: AgentState,
    apply_input: dict,
    tool_results: dict,
    list_tools_fn,
    already_called: list[str],
) -> dict | None:
    try:
        from core.llm.base import LLMMessage
        from core.llm.factory import LLMProviderFactory
    except Exception:
        return None

    query = str((apply_input or {}).get("query") or "").strip()
    if not query:
        return None

    # Fast-path: pronoun resolution before any LLM call
    # Handles "who else reports to him/her", "what is his team", etc.
    pronoun_id = _resolve_pronoun_employee_id(query, tool_results, state=state)
    if pronoun_id and "get_direct_reports" not in already_called:
        DIRECT_REPORT_TRIGGERS = (
            "who else reports", "who reports to him", "who reports to her",
            "his team", "her team", "their team", "his direct", "her direct",
            "reports to him", "reports to her", "reporting to him", "reporting to her",
        )
        if any(t in query.lower() for t in DIRECT_REPORT_TRIGGERS):
            logger.info(
                "MCP planner pronoun-fast-path tool=get_direct_reports employee_id=%s query=%s",
                pronoun_id, query,
            )
            return {"tool_name": "get_direct_reports", "employee_id": pronoun_id, "input_data": {}}

    self_plan = _self_referential_plan(query, state, already_called)
    if self_plan:
        logger.info(
            "MCP planner self-referential tool=%s requester=%s query=%s",
            self_plan.get("tool_name"),
            state.get("requester_id"),
            query,
        )
        return self_plan

    direct_reports_plan = _direct_reports_plan(query, tool_results, already_called, state=state)
    if direct_reports_plan:
        logger.info(
            "MCP planner direct-reports tool=%s requester=%s query=%s",
            direct_reports_plan.get("tool_name"),
            state.get("requester_id"),
            query,
        )
        return direct_reports_plan

    available = list_tools_fn() or []
    allow_personal = _allow_personal_details()

    system = (
        "You are a tool planner for an HRMS assistant.\n"
        "Pick the next single tool call needed to answer the user's query.\n"
        "Return ONLY valid JSON — one of these two shapes:\n"
        '  {"stop": true}\n'
        '  {"tool_call": {"tool": "<name>", "employee_id": <int|null>, "input_data": {...}}}\n\n'
        "=== EMPLOYEE TOOL CATALOG ===\n"
        "get_my_profile            — requester's own profile (role, dept, title, manager).\n"
        "get_employee_profile      — full profile of one employee by DB id. Requires employee_id.\n"
        "get_employee_by_emp_id    — look up by string id (EMP001). Use input_data.emp_id.\n"
        "find_employee_by_name     — fuzzy name/email search. Use input_data.query = person name. Returns list of matches.\n"
        "get_employee_manager_chain — manager hierarchy (up to 5 hops). Use for 'who is X's manager', reporting chain.\n"
        "get_direct_reports        — immediate reports of a manager. Use for 'who reports to X', 'who is reporting to X', 'X's team'.\n"
        "get_peers                 — colleagues with same manager. Use for 'my peers', 'John's teammates'.\n"
        "get_org_tree              — recursive org tree under a manager (depth 3). Use for 'org chart under X', 'full team structure'.\n"
        "get_department_employees  — all employees in a dept. Use input_data.department_code or department_name.\n"
        "list_departments          — all departments with headcount. Use for 'what departments exist', 'largest department'.\n"
        "search_employees          — flexible filter: role/title/dept/joined_after. Use input_data keys: role, title, department_code, joined_after, joined_before, query.\n"
        "get_largest_teams         — managers ranked by direct report count. Use for 'who has most reports', 'largest team'.\n"
        "get_new_hires             — recent joiners. Use input_data.days or parse 'this month'/'this year' from query.\n"
        "get_employees_by_role     — all employees with a role. Use input_data.role = manager|hr|cfo|employee|admin.\n"
        "\n"
        "=== PLANNING RULES ===\n"
        "1. Use only tools from 'available_tools'.\n"
        "2. Do not repeat a tool already in 'already_called'.\n"
        "\n"
        "--- SELF-REFERENTIAL ('my X') RULES — apply these FIRST ---\n"
        "3a. 'my team' / 'my direct reports' / 'who reports to me' / 'people I manage':\n"
        "    → get_direct_reports with employee_id = requester_employee_id\n"
        "3b. 'my manager' / 'who is my manager' / 'who do I report to' / 'my boss':\n"
        "    → get_employee_manager_chain with employee_id = requester_employee_id\n"
        "3c. 'my peers' / 'my colleagues' / 'my teammates' / 'who else is in my team':\n"
        "    → get_peers with employee_id = requester_employee_id\n"
        "3d. 'my org chart' / 'my org tree' / 'full structure under me':\n"
        "    → get_org_tree with employee_id = requester_employee_id\n"
        "3e. 'my profile' / 'my role' / 'my department' / 'who am I':\n"
        "    → get_my_profile with employee_id = requester_employee_id\n"
        "CRITICAL: Never call find_employee_by_name for self-referential ('my X') queries.\n"
        "\n"
        "--- PRONOUN RESOLUTION — apply BEFORE other-employee rules ---\n"
        "0. If the query uses a pronoun ('him', 'her', 'them', 'his', 'their', 'he', 'she', 'they')\n"
        "   instead of a name, resolve it from tool_results in this order:\n"
        "   a. tool_results.get_employee_manager_chain.manager_chain — look for the most relevant person.\n"
        "      level=1 is the requester's immediate manager, level=2 is the skip-level manager, etc.\n"
        "      Use the id field of the resolved person as employee_id.\n"
        "   b. tool_results.find_employee_by_name.results[0] — if a name search was just done.\n"
        "   c. tool_results.get_direct_reports.direct_reports[0] — if a team was just fetched.\n"
        "   If you can resolve the pronoun, proceed with the correct employee_id — do NOT stop.\n"
        "   Example: query='who else reports to him', tool_results has manager_chain level=2 id=489\n"
        "   → call get_direct_reports with employee_id=489\n"
        "\n"
        "--- OTHER-EMPLOYEE RULES ---\n"
        "4. Query mentions a person's name (not 'my'): call find_employee_by_name first with input_data.query = extracted name.\n"
        "5. After find_employee_by_name returns exactly 1 result: use that result's 'id' as employee_id for the next tool.\n"
        "6. If find_employee_by_name returns 0 or >1 results: stop (LLM will ask user to clarify).\n"
        "7. 'reporting chain' / 'who is X's manager': get_employee_manager_chain.\n"
        "8. 'who reports to X' / 'who is reporting to X' / 'reporting to X' / 'X's team' / 'X's direct reports': get_direct_reports.\n"
        "9. 'X's peers' / 'X's teammates': get_peers.\n"
        "10. Query mentions EMP\\d+ string id: get_employee_by_emp_id with input_data.emp_id.\n"
        "\n"
        "--- DIRECTORY / ORG RULES ---\n"
        "11. Department employees: get_department_employees (input_data.department_code or department_name).\n"
        "12. All managers / HR / CFO: get_employees_by_role (input_data.role).\n"
        "13. New joiners / recent hires: get_new_hires.\n"
        "14. Largest team / most reports / highest reportees / reportee count: get_largest_teams.\n"
        "    If query says 'more than N reportees' or 'reportees > N', set input_data.min_reports = N.\n"
        "15. Org chart / full structure under someone: get_org_tree.\n"
        "16. Flexible filter (role, title, joined date): search_employees.\n"
        "17. List all departments: list_departments.\n"
        "\n"
        "--- FORMAT RULES ---\n"
        "18. Set employee_id=null when the tool does not need a specific employee (list_departments, search_employees, get_largest_teams, get_new_hires, get_employees_by_role).\n"
        f"19. allow_personal_details={str(allow_personal).lower()} — plan the same regardless; tools enforce access.\n"
    )

    requester_emp_id = state.get("employee_id")
    payload = {
        "intent": state.get("intent"),
        "requester_role": state.get("requester_role"),
        # IMPORTANT: requester_employee_id is the DB id of the person asking the question.
        # When the query uses 'my' (my team, my manager, my peers), use this id directly.
        "requester_employee_id": requester_emp_id,
        "query": query,
        "available_tools": available,
        "already_called": already_called,
        "tool_results": tool_results or {},
        "_note": (
            "Use requester_employee_id as employee_id when the query says 'my team', "
            "'my manager', 'my peers', 'my org', 'who reports to me', etc. "
            "Do NOT call find_employee_by_name for self-referential queries."
        ),
    }
    human = _safe_json_dumps(payload)

    try:
        provider = LLMProviderFactory.get_provider()
        t0 = time.perf_counter()
        resp = provider.complete([LLMMessage(role="system", content=system), LLMMessage(role="user", content=human)], temperature=0.0)
        logger.info("[PERF] mcp_planner_llm %.3fs", time.perf_counter() - t0)
    except Exception:
        return None

    obj = _first_json_object(resp.content)
    if not obj:
        return None

    if obj.get("stop") is True:
        return None

    call = obj.get("tool_call")
    if not isinstance(call, dict):
        return None

    name = call.get("tool") or call.get("name")
    if not isinstance(name, str) or name not in available:
        return None

    spec: dict = {"tool_name": name}
    if "employee_id" in call:
        spec["employee_id"] = call.get("employee_id")
    if "input_data" in call and isinstance(call.get("input_data"), dict):
        spec["input_data"] = call.get("input_data")

    logger.info(
        "MCP tool planner ok intent=%s requester_role=%s tool=%s",
        state.get("intent"),
        state.get("requester_role"),
        spec.get("tool_name"),
    )
    return spec


def _parse_leave_intent_input(state: AgentState) -> dict:
    """
    For `leave_application` chat intent: extract leave_type, from_date, to_date,
    reason, is_half_day, half_day_session from the NL query using a fast LLM call.

    When the current message is a short confirmation ("yes", "go ahead", etc.),
    uses the conversation history to recover the leave details the user already provided.
    """
    import datetime
    import json
    import re as _re

    input_data = state.get("input_data") or {}
    query = str(input_data.get("query") or "").strip()

    # If already structured (e.g. from a direct API call), pass through
    if input_data.get("leave_type") and input_data.get("from_date"):
        return input_data

    if not query:
        return input_data

    try:
        from core.llm.base import LLMMessage
        from core.llm.factory import LLMProviderFactory
        provider = LLMProviderFactory.get_provider()
    except Exception:
        return input_data

    today = datetime.date.today().isoformat()

    # ── Confirmation shortcut: "yes" / "go ahead" etc. ───────────────────────
    # If the current message is just a confirmation, use history to recover leave details.
    _confirmation_words = {
        "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "go ahead",
        "please do", "confirm", "submit it", "yes please", "do it",
        "proceed", "sounds good",
    }
    q_normalised = query.lower().strip(".,!? ")
    if q_normalised in _confirmation_words or query.lower() in _confirmation_words:
        history = state.get("chat_history") or []
        # Build a condensed history block for the LLM to extract from
        history_text = "\n".join(
            f"{m.get('role','?').upper()}: {(m.get('content') or '')[:500]}"
            for m in history[-8:]
        )
        system = (
            f"Today is {today}. The user has confirmed a leave request. "
            "Extract the leave details that were discussed in the conversation history below.\n"
            "Return ONLY valid JSON:\n"
            '  leave_type: "CL"|"PL"|"SL"|"CO"|"LOP"\n'
            '  from_date: "YYYY-MM-DD"\n'
            '  to_date: "YYYY-MM-DD"\n'
            '  reason: string\n'
            '  is_half_day: true/false\n'
            '  half_day_session: "AM"|"PM"|""\n'
            "If a field cannot be determined, set it to null.\n"
            "Resolve all relative dates against today."
        )
        user_msg = f"CONVERSATION HISTORY:\n{history_text}\n\nUser now said: \"{query}\""
        try:
            resp = provider.complete(
                [LLMMessage(role="system", content=system), LLMMessage(role="user", content=user_msg)],
                temperature=0.0,
            )
            raw = resp.content.strip()
            raw = _re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
            parsed = json.loads(raw)
            merged = {**input_data, **{k: v for k, v in parsed.items() if v not in (None, "")}}
            logger.info(
                "leave_application confirmation-recovery: type=%s from=%s to=%s",
                merged.get("leave_type"), merged.get("from_date"), merged.get("to_date"),
            )
            return merged
        except Exception:
            logger.exception("leave_application confirmation-recovery failed")
            return input_data

    # ── Normal path: extract from current message ─────────────────────────────
    system = (
        f"Today is {today}. Extract leave request details from the user's message.\n"
        "Return ONLY valid JSON with these fields:\n"
        '  leave_type: one of "CL", "PL", "SL", "CO", "LOP"\n'
        '  from_date: "YYYY-MM-DD" or null\n'
        '  to_date: "YYYY-MM-DD" or null\n'
        '  reason: string or ""\n'
        '  is_half_day: true/false\n'
        '  half_day_session: "AM" or "PM" or ""\n'
        '  on_behalf_of: full name of the employee to apply leave for, or "" if applying for self\n'
        "Rules:\n"
        "- If only one date given, set both from_date and to_date to that date.\n"
        "- Resolve relative dates (tomorrow, next Monday, 15th April) against today.\n"
        "- If no leave_type mentioned, default to CL.\n"
        "- Half day: 'AM half day' → is_half_day=true, half_day_session=AM.\n"
        "- 'apply leave for [name]' or 'apply [name]'s leave' → on_behalf_of=[name].\n"
        'Example: {"leave_type":"CL","from_date":"2026-04-15","to_date":"2026-04-16",'
        '"reason":"personal work","is_half_day":false,"half_day_session":""}'
    )
    # Include last 4 history turns so relative dates and references resolve correctly
    history = state.get("chat_history") or []
    messages = [LLMMessage(role="system", content=system)]
    for m in history[-4:]:
        role = m.get("role")
        if role in ("user", "assistant"):
            messages.append(LLMMessage(role=role, content=(m.get("content") or "")[:400]))
    messages.append(LLMMessage(role="user", content=query))

    try:
        resp = provider.complete(messages, temperature=0.0)
        raw = resp.content.strip()
        raw = _re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
        parsed = json.loads(raw)
        merged = {**input_data, **{k: v for k, v in parsed.items() if v not in (None, "")}}
        logger.info(
            "leave_application NL parse: type=%s from=%s to=%s half_day=%s",
            merged.get("leave_type"), merged.get("from_date"),
            merged.get("to_date"), merged.get("is_half_day"),
        )
        return merged
    except Exception:
        logger.exception("leave_application NL parse failed; using raw input_data")
        return input_data


def _parse_action_intent_input(state: AgentState, intent: str) -> dict:
    """
    For action intents (approve_leave, reject_leave, cancel_leave, etc.):
    extract the relevant IDs and parameters from the NL query.
    Fast regex fallback runs first so the action still works without an LLM call.
    """
    import re as _re
    input_data = state.get("input_data") or {}
    query = str(input_data.get("query") or "").strip()

    # Already structured
    if input_data.get("leave_id") or input_data.get("comp_off_id"):
        return input_data

    if not query:
        return input_data

    # ── Fast regex fallback — extracts IDs without an LLM call ──────────────
    # Patterns: "approve leave #7", "approve 14 and 15", "reject #12 reason bad timing",
    #           "approved 3 because he worked", "approve comp off 5"
    result = dict(input_data)
    q_lower = query.lower()

    # Extract ALL numeric IDs — supports "approve 14 and 15", "approve #7 #8"
    all_ids = [int(m) for m in _re.findall(r'\b(\d+)\b', query)]
    extracted_id = all_ids[0] if all_ids else None

    if intent in ("approve_leave", "reject_leave", "cancel_leave", "renotify_manager"):
        if extracted_id and not result.get("leave_id"):
            result["leave_id"] = extracted_id
        # Store all IDs for bulk operations (approve 14 and 15)
        if len(all_ids) > 1:
            result["leave_ids"] = all_ids
    elif intent == "comp_off_approve":
        if extracted_id and not result.get("comp_off_id"):
            result["comp_off_id"] = extracted_id
        if len(all_ids) > 1:
            result["comp_off_ids"] = all_ids
        # Extract action: approve vs reject
        if "reject" in q_lower or "decline" in q_lower:
            result["action"] = "reject"
        else:
            result["action"] = "approve"
    elif intent == "comp_off_request":
        pass  # date extraction still needs LLM

    # Extract rejection reason after "because", "reason", "since", "as"
    reason_match = _re.search(r'(?:because|reason[:\s]|since|as)[:\s]+(.+)', q_lower)
    if reason_match and not result.get("rejection_reason") and not result.get("reason"):
        reason_text = reason_match.group(1).strip().rstrip(".,!?")
        if intent in ("reject_leave",):
            result["rejection_reason"] = reason_text
        elif intent == "comp_off_request":
            result["reason"] = reason_text

    # If regex already gave us what we need, skip the LLM call entirely
    has_needed = (
        (intent in ("approve_leave", "reject_leave", "cancel_leave", "renotify_manager") and result.get("leave_id")) or
        (intent == "comp_off_approve" and result.get("comp_off_id"))
    )
    if has_needed:
        logger.info("action_intent regex parse intent=%s result=%s", intent, result)
        return result

    try:
        from core.llm.base import LLMMessage
        from core.llm.factory import LLMProviderFactory
        import datetime
        import json
        import re as _re

        provider = LLMProviderFactory.get_provider()
    except Exception:
        return input_data

    intent_schemas = {
        "approve_leave":   '{"leave_id": <int or null>}',
        "reject_leave":    '{"leave_id": <int or null>, "rejection_reason": "<string>"}',
        "cancel_leave":    '{"leave_id": <int or null>}',
        "renotify_manager": '{"leave_id": <int or null>}',
        "comp_off_request": (
            '{"worked_on": "YYYY-MM-DD", "days_claimed": <float 0.5-2.0>, "reason": "<string>"}'
        ),
        "comp_off_approve": '{"comp_off_id": <int or null>, "rejection_reason": "<string or empty>", "action": "approve" or "reject"}',
    }
    schema = intent_schemas.get(intent, "{}")
    today = datetime.date.today().isoformat()

    system = (
        f"Today is {today}. Extract structured data from the user's message for the intent '{intent}'.\n"
        f"Return ONLY valid JSON matching this shape: {schema}\n"
        "Set integer IDs to null if not mentioned. Resolve relative dates against today."
    )
    try:
        resp = provider.complete(
            [LLMMessage(role="system", content=system), LLMMessage(role="user", content=query)],
            temperature=0.0,
        )
        raw = resp.content.strip()
        raw = _re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
        parsed = json.loads(raw)
        merged = {**input_data, **{k: v for k, v in parsed.items() if v not in (None, "")}}
        logger.info("action_intent NL parse intent=%s result=%s", intent, merged)
        return merged
    except Exception:
        logger.exception("action_intent NL parse failed intent=%s", intent)
        return input_data


def _resolve_employee_by_name(name: str, *, manager_employee_id: int, requester_id: int, requester_role: str) -> int | None:
    """
    Given a name like 'Guru Laxmi', find the matching Employee pk among the
    manager's direct reports. Returns None if not found or ambiguous.
    """
    if not name:
        return None
    try:
        from apps.employees.models import Employee
        name_lower = name.strip().lower()
        reports = Employee.objects.select_related("user").filter(
            manager_id=manager_employee_id, is_active=True
        )
        matches = [e for e in reports if name_lower in (e.user.name or "").lower()]
        if len(matches) == 1:
            return matches[0].pk
        # Try exact full-name match first, fall back to partial
        exact = [e for e in matches if (e.user.name or "").lower() == name_lower]
        if len(exact) == 1:
            return exact[0].pk
        logger.info("_resolve_employee_by_name name=%r matches=%s", name, len(matches))
    except Exception:
        logger.exception("_resolve_employee_by_name failed name=%r", name)
    return None


def run(state: AgentState) -> AgentState:
    try:
        import mcp.tools.attendance_tools
        import mcp.tools.employee_tools
        import mcp.tools.leave_tools
        import mcp.tools.performance_tools
        from mcp.registry import get, list_tools
    except ImportError as exc:
        logger.exception("MCP tools import failed")
        state["tool_results"] = {"error": str(exc)}
        state["error"] = str(exc)
        return state

    if state.get("intent") == "burnout_check":
        try:
            from agents.nodes.burnout import run as burnout_run
        except ImportError as exc:
            logger.exception("Burnout node import failed")
            state["error"] = str(exc)
        else:
            state = burnout_run(state)

    tool_results: dict = dict(state.get("tool_results") or {})

    # Write-action tools must NEVER be served from pinned prior-turn cache.
    # Always evict them so they are freshly called this turn.
    _WRITE_TOOLS = {
        "create_leave_request", "apply_leave_batch",
        "approve_leave_request", "reject_leave_request",
        "cancel_leave_request", "request_comp_off",
        "approve_comp_off", "reject_comp_off", "renotify_manager",
    }
    for _wt in _WRITE_TOOLS:
        tool_results.pop(_wt, None)

    # Always fetch fresh history/balance — stale pinned versions show outdated state
    _ALWAYS_FRESH = {"get_leave_history", "get_leave_balance", "get_pending_approvals"}
    for _ft in _ALWAYS_FRESH:
        tool_results.pop(_ft, None)

    # For multi-turn leave collection, tool selection depends on the current stage
    intent = state.get("intent", "nl_query")
    collection_stage = state.get("collection_stage")
    if intent == "leave_collection" and collection_stage == "applying":
        # Batch-apply all collected leave items
        tool_names = ["apply_leave_batch"]
        # Build the batch input_data for the tool
        apply_input = {**(state.get("input_data") or {}), "leave_items": state.get("leave_items") or []}
    elif intent == "leave_application":
        tool_names = _TOOLS_BY_INTENT.get(intent, [])
        # Parse the NL query into structured leave fields so create_leave_request can act
        apply_input = _parse_leave_intent_input(state)
        # If manager is applying on behalf of a direct report, resolve the name → employee_id
        on_behalf_of = apply_input.get("on_behalf_of", "")
        if on_behalf_of and state.get("requester_role") in ("manager", "hr", "admin"):
            resolved_id = _resolve_employee_by_name(
                on_behalf_of,
                manager_employee_id=state.get("employee_id"),
                requester_id=state.get("requester_id"),
                requester_role=state.get("requester_role"),
            )
            if resolved_id:
                state = {**state, "employee_id": resolved_id}
                logger.info(
                    "on_behalf_of resolved: name=%r → employee_id=%s",
                    on_behalf_of, resolved_id,
                )
    elif intent in ("approve_leave", "reject_leave", "cancel_leave",
                    "comp_off_request", "comp_off_approve", "renotify_manager"):
        tool_names = _TOOLS_BY_INTENT.get(intent, [])
        apply_input = _parse_action_intent_input(state, intent)
    else:
        tool_names = _TOOLS_BY_INTENT.get(intent, [])
        apply_input = state.get("input_data") or {}

    call_specs: list[dict] = []
    if intent in ("nl_query", "employee_query"):
        already_called: list[str] = []
        for _ in range(6):  # employee queries may need more hops
            spec = _plan_next_tool_call(state, apply_input, tool_results, list_tools, already_called)
            if not spec:
                break
            tool_name = spec.get("tool_name")
            if not tool_name:
                break
            if tool_name in already_called:
                break
            call_specs.append(spec)
            already_called.append(tool_name)
            fn = get(tool_name)
            if not fn:
                tool_results[tool_name] = {"error": "Tool not registered", "code": "TOOL_NOT_FOUND"}
                continue
            input_data = spec.get("input_data") if isinstance(spec.get("input_data"), dict) else apply_input
            employee_id = spec.get("employee_id") or state.get("employee_id")
            try:
                _t = time.perf_counter()
                tool_results[tool_name] = fn(
                    employee_id=employee_id,
                    requester_id=state.get("requester_id"),
                    requester_role=state.get("requester_role"),
                    input_data=input_data,
                )
                logger.info(
                    "[PERF] mcp_tool %-30s %.3fs", tool_name, time.perf_counter() - _t
                )
            except Exception as exc:
                logger.exception("MCP tool failed tool=%s", tool_name)
                tool_results[tool_name] = {"error": str(exc), "code": "TOOL_ERROR"}

        if not call_specs:
            call_specs = [{"tool_name": n, "input_data": apply_input} for n in tool_names]
    else:
        # Bulk leave actions: "approve 14 and 15" → expand into one spec per ID
        leave_ids = apply_input.get("leave_ids") or []
        comp_off_ids = apply_input.get("comp_off_ids") or []
        action_tool = None
        if intent == "approve_leave":
            action_tool = "approve_leave_request"
        elif intent == "reject_leave":
            action_tool = "reject_leave_request"
        elif intent == "cancel_leave":
            action_tool = "cancel_leave_request"
        elif intent == "comp_off_approve":
            action_tool = "approve_comp_off" if apply_input.get("action") != "reject" else "reject_comp_off"

        if action_tool and len(leave_ids) > 1:
            # One spec for get_pending_approvals (shared), then one per leave ID
            call_specs = [{"tool_name": n, "input_data": apply_input} for n in tool_names if n != action_tool]
            for lid in leave_ids:
                call_specs.append({"tool_name": action_tool, "input_data": {**apply_input, "leave_id": lid}, "_bulk_key": f"{action_tool}_{lid}"})
        elif action_tool and len(comp_off_ids) > 1:
            call_specs = [{"tool_name": n, "input_data": apply_input} for n in tool_names if n != action_tool]
            for cid in comp_off_ids:
                call_specs.append({"tool_name": action_tool, "input_data": {**apply_input, "comp_off_id": cid}, "_bulk_key": f"{action_tool}_{cid}"})
        else:
            call_specs = [{"tool_name": n, "input_data": apply_input} for n in tool_names]

    for spec in call_specs:
        tool_name = spec.get("tool_name")
        if not tool_name:
            continue
        # For bulk calls, use the unique _bulk_key so each call runs (not deduplicated by tool_name)
        result_key = spec.get("_bulk_key") or tool_name
        if result_key in tool_results and not spec.get("_bulk_key"):
            continue
        fn = get(tool_name)
        if not fn:
            tool_results[result_key] = {"error": "Tool not registered", "code": "TOOL_NOT_FOUND"}
            continue
        input_data = spec.get("input_data") if isinstance(spec.get("input_data"), dict) else apply_input
        employee_id = spec.get("employee_id")
        if not employee_id:
            employee_id = state.get("employee_id")
        try:
            _t = time.perf_counter()
            tool_results[result_key] = fn(
                employee_id=employee_id,
                requester_id=state.get("requester_id"),
                requester_role=state.get("requester_role"),
                input_data=input_data,
            )
            logger.info(
                "[PERF] mcp_tool %-30s %.3fs key=%s", tool_name, time.perf_counter() - _t, result_key
            )
        except Exception as exc:
            logger.exception("MCP tool failed tool=%s", tool_name)
            tool_results[result_key] = {"error": str(exc), "code": "TOOL_ERROR"}

    if state.get("intent") == "leave_application":
        created = tool_results.get("create_leave_request") or {}
        if created.get("status") == "ok" and created.get("leave_id"):
            input_data = state.get("input_data") or {}
            state["input_data"] = {**input_data, "leave_id": created.get("leave_id")}

    if state.get("intent") == "leave_collection" and state.get("collection_stage") == "applying":
        # Stamp applied leave IDs back into each leave_item for the LLM summary
        batch = tool_results.get("apply_leave_batch") or {}
        batch_results = batch.get("batch_results") or []
        leave_items = state.get("leave_items") or []
        for res in batch_results:
            if res.get("status") == "ok":
                for item in leave_items:
                    if item.get("type") == res.get("leave_type") and not item.get("applied_leave_id"):
                        item["applied_leave_id"] = res.get("leave_id")
                        item["status"] = "applied"
                        break
        state["leave_items"] = leave_items
        state["collection_stage"] = "done"

    state["tool_results"] = tool_results

    # Track which tools were actually called this turn so llm_generate can split
    # current vs prior-turn tool results correctly.
    all_called_this_turn: list[str] = []
    if intent in ("nl_query", "employee_query"):
        try:
            all_called_this_turn = already_called  # type: ignore[name-defined]
        except NameError:
            all_called_this_turn = []
    else:
        # Use _bulk_key when present so the context blob labels bulk results correctly
        all_called_this_turn = [s.get("_bulk_key") or s["tool_name"] for s in call_specs if s.get("tool_name")]
    state["_tools_called_this_turn"] = all_called_this_turn

    logger.info("MCP node complete intent=%s tools=%s", state.get("intent"), list(tool_results.keys()))
    return state
