"""
Multi-turn leave collection node — LLM-first.

Manages stateful collection of multiple leave types across chat turns.
Uses the LLM for:
  1. Parsing the initial natural-language leave request into structured items
  2. Extracting structured details (dates, reason) from a free-form user reply
  3. Deciding whether the user confirmed or cancelled a violation prompt

Each stage is stored in state and echoed back by the client via input_data so
the collection survives mid-flow context switches (e.g. a policy question).

Stages:
  collecting_details     → ask for from_date / to_date / reason per leave type
  checking_policy        → hand off to policy_checker (next node in flow)
  awaiting_confirmation  → violations found; ask user to confirm or cancel
  applying               → hand off to mcp_tools (apply_leave_batch)
  done                   → all leaves applied
"""
import json
import logging
import re
from datetime import date

from agents.state import AgentState

logger = logging.getLogger("hrms")

LEAVE_TYPE_NAMES = {"CL": "Casual Leave", "EL": "Earned / Privilege Leave", "SL": "Sick Leave"}

# Alias map used as a fast fallback when the LLM is unavailable
_LEAVE_TYPE_MAP = {
    "cl": "CL", "casual": "CL", "casual leave": "CL",
    "el": "EL", "earned": "EL", "earned leave": "EL",
    "pl": "EL", "privilege": "EL", "privilege leave": "EL",
    "sl": "SL", "sick": "SL", "sick leave": "SL", "medical": "SL",
}


def run(state: AgentState) -> AgentState:
    input_data = state.get("input_data") or {}

    # Restore collection state from input_data (client echoes it back each turn)
    leave_items: list[dict] = list(state.get("leave_items") or input_data.get("leave_items") or [])
    collection_stage: str | None = state.get("collection_stage") or input_data.get("collection_stage")
    collecting_index: int = int(state.get("collecting_index") or input_data.get("collecting_index") or 0)
    policy_violations: list[dict] = list(state.get("policy_violations") or input_data.get("policy_violations") or [])

    state["leave_items"] = leave_items
    state["collection_stage"] = collection_stage
    state["collecting_index"] = collecting_index
    state["policy_violations"] = policy_violations

    if collection_stage is None:
        return _parse_initial_request(state)
    if collection_stage == "collecting_details":
        return _collect_item_details(state)
    if collection_stage == "awaiting_confirmation":
        return _handle_soft_confirmation(state)
    if collection_stage == "blocked":
        return _handle_blocked(state)
    # "checking_policy" / "applying" / "done" → pass through to next nodes
    return state


# ---------------------------------------------------------------------------
# Stage handlers
# ---------------------------------------------------------------------------

def _parse_initial_request(state: AgentState) -> AgentState:
    """Turn 1: use LLM to parse the multi-type leave request into structured items."""
    input_data = state.get("input_data") or {}
    query = str(input_data.get("query") or input_data.get("message") or "")
    if not query:
        for msg in reversed(state.get("chat_history") or []):
            if msg.get("role") == "user":
                query = str(msg.get("content") or "")
                break

    parsed = _llm_parse_leave_types(query, state) or _regex_parse_leave_types(query)

    if parsed:
        leave_items = [
            {
                "type": p["type"],
                "days": p["days"],
                "from_date": None,
                "to_date": None,
                "reason": None,
                "status": "pending",
                "violations": [],
                "applied_leave_id": None,
            }
            for p in parsed
        ]
        state["leave_items"] = leave_items
        state["collection_stage"] = "collecting_details"
        state["collecting_index"] = 0
        logger.info("LeaveCollector parsed %d leave type(s) from initial request", len(leave_items))
    else:
        # Could not parse — LLM will ask the user to clarify
        state["leave_items"] = []
        state["collection_stage"] = "collecting_details"
        state["collecting_index"] = 0
        logger.info("LeaveCollector could not parse leave types; LLM will ask for clarification")

    return state


def _collect_item_details(state: AgentState) -> AgentState:
    """Intermediate turns: use LLM to extract dates+reason from user reply, then advance."""
    input_data = state.get("input_data") or {}
    leave_items: list[dict] = state.get("leave_items") or []
    idx: int = state.get("collecting_index") or 0

    if not leave_items:
        return state  # LLM will ask user to specify leave types

    # Try structured fields first (API clients may send them directly)
    from_date_raw = input_data.get("from_date")
    to_date_raw = input_data.get("to_date")
    reason = input_data.get("reason")

    # If not structured, try LLM extraction from the latest user message
    if not (from_date_raw and to_date_raw and reason):
        user_msg = str(input_data.get("query") or input_data.get("message") or "")
        if not user_msg:
            for msg in reversed(state.get("chat_history") or []):
                if msg.get("role") == "user":
                    user_msg = str(msg.get("content") or "")
                    break
        if user_msg and idx < len(leave_items):
            extracted = _llm_extract_details(user_msg, leave_items[idx], state)
            if extracted:
                from_date_raw = extracted.get("from_date") or from_date_raw
                to_date_raw = extracted.get("to_date") or to_date_raw
                reason = extracted.get("reason") or reason

    # Store details if complete
    if from_date_raw and to_date_raw and reason and idx < len(leave_items):
        fd = _parse_date(from_date_raw)
        td = _parse_date(to_date_raw)
        if fd and td:
            leave_items[idx] = {
                **leave_items[idx],
                "from_date": str(fd),
                "to_date": str(td),
                "reason": str(reason),
                "status": "details_collected",
            }
            state["leave_items"] = leave_items
            idx += 1
            state["collecting_index"] = idx
            logger.info(
                "LeaveCollector stored details for item index=%s type=%s",
                idx - 1, leave_items[idx - 1].get("type"),
            )

    # Find the next item still waiting
    next_pending = next(
        (i for i, item in enumerate(leave_items) if i >= idx and item.get("status") == "pending"),
        None,
    )

    if next_pending is not None:
        state["collecting_index"] = next_pending
    else:
        all_ready = all(item.get("status") in ("details_collected", "applied") for item in leave_items)
        if all_ready and leave_items:
            state["collection_stage"] = "checking_policy"
            logger.info("LeaveCollector all items ready; advancing to policy check")

    return state


def _handle_soft_confirmation(state: AgentState) -> AgentState:
    """User responds to a WARNING-only prompt — LLM detects yes/no."""
    input_data = state.get("input_data") or {}

    confirmed = input_data.get("confirmed")
    if confirmed is not None:
        decision = "yes" if (confirmed is True or str(confirmed).lower() in ("true", "yes", "1", "proceed", "confirm")) else "no"
    else:
        user_msg = _latest_user_message(state)
        decision = _llm_classify_confirmation(user_msg, state) if user_msg else None

    if decision == "yes":
        state["collection_stage"] = "applying"
        logger.info("LeaveCollector user confirmed warnings; advancing to apply")
    elif decision == "no":
        _reset_to_collect(state)
        logger.info("LeaveCollector user declined warnings; resetting to detail collection")
    # else: ambiguous — LLM will re-ask

    return state


def _handle_blocked(state: AgentState) -> AgentState:
    """Hard policy errors exist — the user CANNOT proceed without fixing the request.

    We check if the user's latest message provides corrected details.
    If not, the LLM will re-explain the block and ask them to re-enter.
    """
    input_data = state.get("input_data") or {}

    # If user explicitly tries to confirm despite a hard block, reject it
    confirmed = input_data.get("confirmed")
    if confirmed is not None and str(confirmed).lower() in ("true", "yes", "1", "proceed", "confirm"):
        # Stay blocked — do not advance. LLM will explain why.
        logger.info("LeaveCollector: user attempted to bypass hard block; staying blocked")
        return state

    # Check if user supplied corrected details for the blocked item(s)
    leave_items = state.get("leave_items") or []
    violations = state.get("policy_violations") or []
    blocked_types = {v.get("leave_type") for v in violations if v.get("severity") == "error"}

    # Try to extract new details from the user's message
    user_msg = _latest_user_message(state)
    corrected_any = False
    for item in leave_items:
        if item.get("type") not in blocked_types:
            continue
        extracted = _llm_extract_details(user_msg, item, state) if user_msg else None
        if not extracted:
            continue
        fd = _parse_date(extracted.get("from_date"))
        td = _parse_date(extracted.get("to_date"))
        reason = extracted.get("reason") or item.get("reason")
        if fd and td:
            item.update({"from_date": str(fd), "to_date": str(td), "reason": reason, "status": "details_collected", "violations": []})
            corrected_any = True

    if corrected_any:
        state["leave_items"] = leave_items
        state["policy_violations"] = []
        state["collection_stage"] = "checking_policy"
        logger.info("LeaveCollector: corrected details received; re-running policy check")
    # else: still blocked — LLM will explain what needs to be fixed

    return state


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------

def _llm_parse_leave_types(text: str, state: AgentState) -> list[dict] | None:
    """Ask the LLM to extract [{type, days}] from a free-form request."""
    if not text.strip():
        return None
    try:
        from core.llm.base import LLMMessage
        from core.llm.factory import LLMProviderFactory
        provider = LLMProviderFactory.get_provider()
    except Exception:
        return None

    system = (
        "You are a leave-request parser. Given a user sentence, extract all requested leave types and their day counts.\n"
        "Return ONLY a JSON array of objects with fields: type (one of CL, EL, SL), days (integer).\n"
        "Mappings: casual/CL → CL; earned/privilege/PL/EL → EL; sick/SL/medical → SL.\n"
        "If nothing can be extracted return an empty array [].\n"
        "Example input: 'I want 2 SL, 3 CL and 1 PL'\n"
        'Example output: [{"type":"SL","days":2},{"type":"CL","days":3},{"type":"EL","days":1}]'
    )
    try:
        resp = provider.complete(
            [LLMMessage(role="system", content=system), LLMMessage(role="user", content=text)],
            temperature=0.0,
        )
        raw = resp.content.strip()
        # Strip markdown code fences if present
        raw = re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            return None
        result = []
        seen = set()
        for item in parsed:
            t = str(item.get("type") or "").upper()
            d = item.get("days")
            if t in ("CL", "EL", "SL") and d and t not in seen:
                result.append({"type": t, "days": int(d)})
                seen.add(t)
        logger.info("LLM parsed leave types: %s", result)
        return result if result else None
    except Exception:
        logger.debug("LLM leave-type parse failed; falling back to regex", exc_info=True)
        return None


def _llm_extract_details(user_msg: str, current_item: dict, state: AgentState) -> dict | None:
    """Ask the LLM to extract from_date, to_date, reason from a user reply."""
    if not user_msg.strip():
        return None
    try:
        from core.llm.base import LLMMessage
        from core.llm.factory import LLMProviderFactory
        provider = LLMProviderFactory.get_provider()
    except Exception:
        return None

    leave_type = current_item.get("type", "")
    type_name = LEAVE_TYPE_NAMES.get(leave_type, leave_type)
    today = date.today().isoformat()
    system = (
        f"You are extracting leave details from a user message for a {type_name} ({current_item.get('days')} day(s)) request.\n"
        f"Today's date is {today}. Interpret relative dates like 'Monday', 'next week', 'tomorrow' using today's date.\n"
        "Return ONLY a JSON object with fields: from_date (YYYY-MM-DD), to_date (YYYY-MM-DD), reason (string).\n"
        "If a field cannot be determined, set it to null.\n"
        'Example output: {"from_date":"2025-05-05","to_date":"2025-05-06","reason":"fever"}'
    )
    try:
        resp = provider.complete(
            [LLMMessage(role="system", content=system), LLMMessage(role="user", content=user_msg)],
            temperature=0.0,
        )
        raw = resp.content.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
        data = json.loads(raw)
        result = {
            "from_date": data.get("from_date"),
            "to_date": data.get("to_date"),
            "reason": data.get("reason"),
        }
        logger.info("LLM extracted leave details: %s", result)
        return result
    except Exception:
        logger.debug("LLM detail extraction failed", exc_info=True)
        return None


def _llm_classify_confirmation(user_msg: str, state: AgentState) -> str | None:
    """Ask the LLM whether the user is confirming (yes), cancelling (no), or unclear (null)."""
    if not user_msg.strip():
        return None
    try:
        from core.llm.base import LLMMessage
        from core.llm.factory import LLMProviderFactory
        provider = LLMProviderFactory.get_provider()
    except Exception:
        return None

    violations_text = "; ".join(
        v.get("message", "") for v in (state.get("policy_violations") or [])
    )
    system = (
        "The user was shown leave policy violation warnings and asked whether to proceed or cancel.\n"
        f"Violations shown: {violations_text}\n"
        'Return ONLY a JSON object: {"decision": "yes"} to proceed, {"decision": "no"} to cancel, '
        '{"decision": null} if unclear.'
    )
    try:
        resp = provider.complete(
            [LLMMessage(role="system", content=system), LLMMessage(role="user", content=user_msg)],
            temperature=0.0,
        )
        raw = resp.content.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
        data = json.loads(raw)
        decision = data.get("decision")
        logger.info("LLM confirmation classification: %s", decision)
        return decision  # "yes", "no", or None
    except Exception:
        logger.debug("LLM confirmation classification failed", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _reset_to_collect(state: AgentState) -> None:
    """Reset all leave items to pending so the user can re-enter details."""
    leave_items = state.get("leave_items") or []
    for item in leave_items:
        if item.get("status") == "details_collected":
            item["status"] = "pending"
        item["violations"] = []
    state["leave_items"] = leave_items
    state["policy_violations"] = []
    state["collection_stage"] = "collecting_details"
    state["collecting_index"] = 0


def _latest_user_message(state: AgentState) -> str:
    """Return the most recent user message from input_data or chat_history."""
    input_data = state.get("input_data") or {}
    msg = str(input_data.get("query") or input_data.get("message") or "")
    if msg:
        return msg
    for m in reversed(state.get("chat_history") or []):
        if m.get("role") == "user":
            return str(m.get("content") or "")
    return ""


# ---------------------------------------------------------------------------
# Regex fallback for leave-type parsing
# ---------------------------------------------------------------------------

def _regex_parse_leave_types(text: str) -> list[dict]:
    found: list[dict] = []
    seen_types: set[str] = set()
    text_lower = text.lower()
    patterns = [
        r'(\d+)\s+(sick leave|sick|sl|casual leave|casual|cl|earned leave|earned|el|privilege leave|privilege|pl|medical)',
        r'(sick leave|sick|sl|casual leave|casual|cl|earned leave|earned|el|privilege leave|privilege|pl|medical)\s*[:\-\s]+(\d+)',
    ]
    for pat in patterns:
        for m in re.finditer(pat, text_lower, re.IGNORECASE):
            g = m.groups()
            if g[0].strip().isdigit():
                days, type_str = int(g[0]), g[1].lower().strip()
            else:
                type_str, days = g[0].lower().strip(), int(g[1])
            leave_type = _LEAVE_TYPE_MAP.get(type_str)
            if leave_type and leave_type not in seen_types:
                found.append({"type": leave_type, "days": days})
                seen_types.add(leave_type)
    return found


# ---------------------------------------------------------------------------
# Misc utils
# ---------------------------------------------------------------------------

def _parse_date(val) -> date | None:
    if isinstance(val, date):
        return val
    if not val:
        return None
    try:
        return date.fromisoformat(str(val))
    except Exception:
        return None


def get_collection_context(state: AgentState) -> dict:
    """Build a summary dict included in the LLM human-context payload."""
    leave_items = state.get("leave_items") or []
    idx = state.get("collecting_index") or 0
    stage = state.get("collection_stage")
    violations = state.get("policy_violations") or []

    items_summary = [
        {
            "index": i,
            "type": item.get("type"),
            "type_name": LEAVE_TYPE_NAMES.get(item.get("type", ""), item.get("type")),
            "days": item.get("days"),
            "from_date": item.get("from_date"),
            "to_date": item.get("to_date"),
            "reason": item.get("reason"),
            "status": item.get("status"),
            "applied_leave_id": item.get("applied_leave_id"),
        }
        for i, item in enumerate(leave_items)
    ]

    current = leave_items[idx] if 0 <= idx < len(leave_items) else None
    return {
        "collection_stage": stage,
        "total_leave_types": len(leave_items),
        "collecting_index": idx,
        "current_item": current,
        "current_type_name": LEAVE_TYPE_NAMES.get((current or {}).get("type", ""), "") if current else "",
        "leave_items": items_summary,
        "violations": violations,
        "stage_instructions": _stage_instructions(stage, idx, leave_items, violations),
    }


def _stage_instructions(stage, idx, items, violations) -> str:
    if stage == "collecting_details":
        if not items:
            return (
                "No leave types detected yet. Ask the user which leave types they want "
                "(e.g. '2 SL, 3 CL, 1 PL') before asking for dates."
            )
        current = items[idx] if 0 <= idx < len(items) else None
        if current:
            type_name = LEAVE_TYPE_NAMES.get(current.get("type", ""), current.get("type"))
            days = current.get("days")
            return (
                f"Ask the user for {type_name} ({days} day(s)) — item {idx + 1} of {len(items)}. "
                "You need: start date, end date, and reason. "
                "Be conversational; the user can reply in natural language."
            )
        return "All items collected. Move on."

    if stage == "checking_policy":
        return "Policy and balance check running. Do not address the user yet."

    if stage == "blocked":
        errors = [v for v in violations if v.get("severity") == "error"]
        error_lines = "\n".join(f"  ✗ {v.get('message', '')}" for v in errors)
        return (
            "HARD POLICY BLOCK — the user cannot proceed without correcting their request.\n"
            "Do NOT offer a 'proceed anyway' option. Do NOT apply the leave.\n"
            "Explain clearly why it is blocked:\n"
            f"{error_lines}\n"
            "Ask the user to provide corrected details (e.g., split 3 CL into 2+1 on different date ranges)."
        )

    if stage == "awaiting_confirmation":
        warnings = [v for v in violations if v.get("severity") == "warning"]
        msgs = [v.get("message", "") for v in warnings]
        return (
            "Present these ADVISORY warnings and ask the user whether to proceed or cancel:\n"
            + "\n".join(f"  ⚠️  {m}" for m in msgs)
        )

    if stage == "applying":
        return "Leaves are being submitted now. Do not ask further questions."

    if stage == "done":
        return "All leaves submitted. Summarise what was applied and any pending manager approvals."

    return ""
