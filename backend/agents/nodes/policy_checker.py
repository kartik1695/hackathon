"""
Policy & balance checker node — LLM-first.

Runs only when collection_stage == "checking_policy".

Violation severity levels:
  "error"   → HARD BLOCK. The leave CANNOT be applied as-is.
              Examples: exceeds max consecutive days, insufficient balance.
              The user MUST fix the request (split leave, change dates, reduce days).
              Confirming "yes" is NOT accepted.
  "warning"  → Soft advisory. The user can acknowledge and proceed.

Stage transitions:
  No violations         → "applying"
  Only warnings         → "awaiting_confirmation"  (user may proceed with yes/no)
  Any error violations  → "blocked"                (user must fix, cannot bypass)
"""
import json
import logging
import re
from datetime import date

from agents.state import AgentState

logger = logging.getLogger("hrms")

_DEFAULT_LIMITS: dict[str, dict] = {
    "CL": {"max_consecutive": 2,  "annual": 12},
    "EL": {"max_consecutive": 15, "annual": 15},
    "SL": {"max_consecutive": 3,  "annual": 10},
}

_BALANCE_FIELD = {"CL": "casual_remaining", "EL": "earned_remaining", "SL": "sick_remaining"}
_TYPE_NAMES    = {"CL": "Casual Leave",      "EL": "Earned / Privilege Leave", "SL": "Sick Leave"}


def run(state: AgentState) -> AgentState:
    if state.get("collection_stage") != "checking_policy":
        return state

    leave_items: list[dict] = state.get("leave_items") or []
    if not leave_items:
        state["collection_stage"] = "applying"
        return state

    balance   = _get_balance(state)
    policy_text = "\n\n".join(state.get("retrieved_docs") or [])

    # LLM evaluation (best-effort; falls back to rule-based)
    all_violations = _llm_evaluate(leave_items, balance, policy_text, state)

    # Always run hard rule-based checks regardless of LLM output
    for item in leave_items:
        hard = _hard_checks(item, balance)
        existing_rules = {v.get("rule") for v in all_violations if v.get("leave_type") == item.get("type")}
        for v in hard:
            if v["rule"] not in existing_rules:
                all_violations.append(v)

    # Attach per-item violations
    for item in leave_items:
        item["violations"] = [v for v in all_violations if v.get("leave_type") == item.get("type")]

    state["leave_items"]       = leave_items
    state["policy_violations"] = all_violations

    has_errors   = any(v.get("severity") == "error"   for v in all_violations)
    has_warnings = any(v.get("severity") == "warning" for v in all_violations)

    if has_errors:
        # Hard block — user must correct the request, cannot bypass
        state["collection_stage"] = "blocked"
        logger.info("PolicyChecker BLOCKED: %d error violation(s)", sum(1 for v in all_violations if v.get("severity") == "error"))
    elif has_warnings:
        # Soft warnings — ask user to confirm
        state["collection_stage"] = "awaiting_confirmation"
        logger.info("PolicyChecker found %d warning(s); awaiting confirmation", len(all_violations))
    else:
        state["collection_stage"] = "applying"
        logger.info("PolicyChecker passed; advancing to apply")

    return state


# ---------------------------------------------------------------------------
# LLM evaluation
# ---------------------------------------------------------------------------

def _llm_evaluate(leave_items: list[dict], balance: dict, policy_text: str, state: AgentState) -> list[dict]:
    """Ask the LLM to check each leave item against policy and balance."""
    try:
        from core.llm.base import LLMMessage
        from core.llm.factory import LLMProviderFactory
        provider = LLMProviderFactory.get_provider()
    except Exception:
        logger.debug("LLM unavailable in policy_checker; using rule-based fallback")
        return []

    balance_summary = json.dumps(balance, default=str) if balance else "Not available"
    items_summary = json.dumps(
        [
            {
                "type": item.get("type"),
                "type_name": _TYPE_NAMES.get(item.get("type", ""), item.get("type")),
                "days": item.get("days"),
                "from_date": item.get("from_date"),
                "to_date": item.get("to_date"),
                "reason": item.get("reason"),
            }
            for item in leave_items
        ],
        default=str,
    )

    policy_section = (
        f"POLICY DOCUMENTS:\n{policy_text[:3000]}" if policy_text.strip()
        else "No specific policy documents retrieved. Use general HR best practices."
    )

    system = (
        "You are an HRMS policy compliance checker. Your job is to validate leave requests.\n\n"
        f"{policy_section}\n\n"
        "LEAVE BALANCE:\n"
        f"{balance_summary}\n\n"
        "For each leave item provided, check:\n"
        "  1. Consecutive day limit (e.g. policy says 'max 2 CL at a time') — HARD RULE\n"
        "  2. Insufficient leave balance — HARD RULE\n"
        "  3. Other soft advisories from the policy documents\n\n"
        "Severity rules:\n"
        "  severity='error'   → HARD BLOCK. The employee cannot apply this leave without modifying their request.\n"
        "                        Use 'error' for: exceeding max consecutive days, insufficient balance.\n"
        "  severity='warning' → Soft advisory only. Employee may proceed after acknowledgement.\n\n"
        "Return ONLY a JSON array of violation objects. Each object must have:\n"
        "  leave_type (CL/EL/SL), rule (string key), severity (error|warning),\n"
        "  message (human-readable explanation including what the limit is and what was requested)\n"
        "If there are NO violations, return []. Do not invent violations.\n\n"
        'Example for hard block: [{"leave_type":"CL","rule":"max_consecutive","severity":"error",'
        '"message":"Policy allows max 2 Casual Leave days at a time. You requested 3. Please split into two separate applications."}]'
    )

    try:
        resp = provider.complete(
            [
                LLMMessage(role="system", content=system),
                LLMMessage(role="user", content=f"LEAVE ITEMS TO CHECK:\n{items_summary}"),
            ],
            temperature=0.0,
        )
        raw = resp.content.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw).rstrip("`").strip()
        violations = json.loads(raw)
        if not isinstance(violations, list):
            return []
        # Normalise and filter to known leave types
        result = []
        for v in violations:
            lt = str(v.get("leave_type") or "").upper()
            if lt not in ("CL", "EL", "SL"):
                continue
            result.append({
                "leave_type": lt,
                "rule": str(v.get("rule") or "policy"),
                "severity": str(v.get("severity") or "warning"),
                "message": str(v.get("message") or ""),
            })
        logger.info("LLM policy check returned %d violation(s)", len(result))
        return result
    except Exception:
        logger.debug("LLM policy evaluation failed; falling back to rule-based", exc_info=True)
        return []


# ---------------------------------------------------------------------------
# Hard rule-based checks (always run as safety net)
# ---------------------------------------------------------------------------

def _hard_checks(item: dict, balance: dict) -> list[dict]:
    """Rule-based safety net — always runs regardless of LLM output.
    All violations here are severity='error' (hard blocks)."""
    violations: list[dict] = []
    leave_type    = item.get("type") or ""
    days          = item.get("days") or 0
    from_date_str = item.get("from_date")
    to_date_str   = item.get("to_date")
    type_name     = _TYPE_NAMES.get(leave_type, leave_type)
    max_allowed   = _DEFAULT_LIMITS.get(leave_type, {}).get("max_consecutive", 999)

    # Max consecutive days — hard policy block
    if days > max_allowed:
        violations.append({
            "leave_type": leave_type,
            "rule": "max_consecutive",
            "severity": "error",
            "message": (
                f"{type_name}: Policy allows a maximum of {max_allowed} consecutive day(s) at a time. "
                f"You requested {days} day(s). Please split into separate applications."
            ),
        })

    # Insufficient balance — hard block
    balance_key = _BALANCE_FIELD.get(leave_type)
    if balance_key and balance:
        remaining = float(balance.get(balance_key) or 0)
        if days > remaining:
            violations.append({
                "leave_type": leave_type,
                "rule": "insufficient_balance",
                "severity": "error",
                "message": (
                    f"{type_name}: Insufficient balance. "
                    f"Available: {remaining:.1f} day(s), Requested: {days} day(s)."
                ),
            })

    # Date ordering — hard block
    if from_date_str and to_date_str:
        try:
            if date.fromisoformat(from_date_str) > date.fromisoformat(to_date_str):
                violations.append({
                    "leave_type": leave_type,
                    "rule": "invalid_dates",
                    "severity": "error",
                    "message": (
                        f"{type_name}: Start date ({from_date_str}) cannot be after end date ({to_date_str})."
                    ),
                })
        except Exception:
            pass

    return violations


# ---------------------------------------------------------------------------
# Balance fetch
# ---------------------------------------------------------------------------

def _get_balance(state: AgentState) -> dict:
    tool_results = state.get("tool_results") or {}
    balance = (tool_results.get("get_leave_balance") or {}).get("leave_balance") or {}
    if balance:
        return balance
    try:
        from apps.leaves.models import LeaveBalance
        bal = LeaveBalance.objects.filter(employee_id=state.get("employee_id")).first()
        if bal:
            balance = {
                "casual_remaining":  float(bal.casual_remaining),
                "earned_remaining":  float(bal.earned_remaining),
                "sick_remaining":    float(bal.sick_remaining),
            }
    except Exception:
        logger.exception("PolicyChecker: DB balance fetch failed")
    return balance
