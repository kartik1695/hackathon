import json
import logging
import math
from typing import Dict, List, Tuple

from agents.state import AgentState

logger = logging.getLogger("hrms")


def route(state: AgentState) -> str:
    intent = state.get("intent")
    if intent:
        return intent

    input_data = state.get("input_data") or {}

    # If there is an active multi-type leave collection in progress, preserve it.
    # The client echoes back collection_stage on every subsequent turn.
    active_stage = state.get("collection_stage") or input_data.get("collection_stage")
    if active_stage and active_stage not in ("done",):
        q_lower = str(input_data.get("query") or "").lower()
        # Allow a mid-flow policy question to be answered without losing collection state
        if any(k in q_lower for k in ("policy", "handbook", "rules", "guideline", "how many leave", "how many days")):
            logger.info("Router: mid-collection policy question detected; routing to policy_query")
            return "policy_query"
        logger.info("Router: active collection_stage=%s; resuming leave_collection", active_stage)
        return "leave_collection"

    q = str(input_data.get("query") or "").lower().strip()
    if not q:
        return "nl_query"

    # ── Confirmation detection — must run BEFORE keyword routing ─────────────
    # Catches "yes", "yes please", "go ahead", "confirm", "sure", "ok" etc.
    # when the conversation history shows the assistant was about to submit a leave.
    _confirmation_words = {"yes", "yeah", "yep", "yup", "sure", "ok", "okay",
                           "go ahead", "please do", "confirm", "submit it",
                           "yes please", "do it", "proceed", "sounds good"}
    q_stripped = q.strip(".,!? ")
    if q_stripped in _confirmation_words or q in _confirmation_words:
        history = state.get("chat_history") or []
        # Check if the last assistant message was asking the user to confirm a leave submission
        _leave_confirm_signals = (
            "submit this leave", "shall i submit", "go ahead and submit",
            "would you like me to submit", "if you'd like me to go ahead",
            "shall i go ahead", "confirm the leave", "should i apply",
            "lock it in", "just let me know",
        )
        for msg in reversed(history[-6:]):
            if msg.get("role") == "assistant":
                assistant_text = (msg.get("content") or "").lower()
                if any(sig in assistant_text for sig in _leave_confirm_signals):
                    logger.info("Router: confirmation detected after leave-submit prompt; routing to leave_application")
                    return "leave_application"
                break  # Only check the most recent assistant message

    try:
        from agents.intent_registry import INTENTS
        from core.llm.factory import LLMProviderFactory
    except Exception:
        INTENTS = {}
        LLMProviderFactory = None

    # ── Fast keyword routing — runs before embeddings to avoid slow embed calls ──

    # Policy questions: must check BEFORE leave-type keywords to avoid misrouting
    # "how many days of sick leave" has "sick leave" but it's a policy question
    _policy_question_prefixes = ("how many", "how much leave", "what is the", "what are the",
                                 "tell me about the", "explain the", "what leave")
    if any(q.startswith(p) for p in _policy_question_prefixes):
        if any(k in q for k in ("leave", "policy", "days", "balance", "entitlement", "quota", "allowance")):
            return "policy_query"

    # Multi-leave collection: only when the query explicitly asks for 2+ types together
    _explicit_multi = (
        "multiple leave", "sick and casual", "sl and cl", "cl and sl", "cl and pl",
        "pl and sl", "2 sl", "3 cl", "1 pl", "1 sl", "2 cl", "2 pl",
        "sick leave and", "casual leave and", "privilege leave and",
        "sick leave for", "casual leave for",  # catches "sick leave for N days and casual leave"
    )
    # A query is multi-leave if it mentions two or more distinct leave type keywords
    _leave_type_kws = ("sick leave", "casual leave", "privilege leave", "comp off", " sl ", " cl ", " pl ")
    _type_count = sum(1 for kw in _leave_type_kws if kw in f" {q} ")
    if (_type_count >= 2 or any(k in q for k in _explicit_multi)) and any(k in q for k in ("apply", "request", "want", "need", "take")):
        return "leave_collection"

    # ── Comp Off — must run BEFORE single-apply (shares "apply"/"request" keywords) ───────────
    if any(k in q for k in ("approve comp off", "approve comp-off", "reject comp off", "grant comp off")):
        return "comp_off_approve"
    if any(k in q for k in ("comp off", "comp-off", "compensatory off", "compensatory leave",
                            "worked on sunday", "worked on holiday", "worked on weekend",
                            "claim comp", "request comp off", "comp off request",
                            "apply comp off", "need comp off")):
        return "comp_off_request"

    # Single-leave application — includes typed abbreviations with dates/apply keywords
    _single_apply_kws = (
        "apply leave", "apply for leave", "leave from", "leave to",
        "request leave", "take leave",
        "half day", "half-day", "am leave", "pm leave",
        "lop", "loss of pay",
        # Abbreviation + action: "apply cl", "take sl", "request pl", etc.
        "apply cl", "apply sl", "apply pl", "apply co", "apply lop",
        "take cl", "take sl", "take pl", "take co",
        "request cl", "request sl", "request pl", "request co",
        "cl for", "sl for", "pl for", "co for",
        "cl from", "sl from", "pl from", "co from",
        "cl leave", "sl leave", "pl leave",
        "casual leave", "sick leave", "privilege leave", "comp off leave",
    )
    if any(k in q for k in _single_apply_kws):
        return "leave_application"

    # ── Manager leave actions ─────────────────────────────────────────────────
    if any(k in q for k in ("approve leave", "approve the leave", "grant leave", "give approval for leave")):
        return "approve_leave"
    if any(k in q for k in ("reject leave", "reject the leave", "decline leave", "cannot approve")):
        return "reject_leave"
    if any(k in q for k in ("cancel leave", "cancel my leave", "withdraw leave", "cancel the leave", "applied by mistake")):
        return "cancel_leave"

    # ── Re-notify / reminders ──────────────────────────────────────────────────
    if any(k in q for k in ("remind manager", "re-notify", "renotify", "no action on my leave",
                            "nudge manager", "still pending", "remind about leave",
                            "remind my manager", "no response on leave", "follow up on leave")):
        return "renotify_manager"

    # ── Leave status / pending approvals ─────────────────────────────────────
    if any(k in q for k in ("my pending leaves", "my leave status", "leave status", "my approved leaves",
                            "show my leaves", "my leave requests", "list my leaves")):
        return "leave_status"
    if any(k in q for k in ("pending approvals", "pending leaves to approve", "my actionables",
                            "actionables", "awaiting my approval", "leaves to approve")):
        return "pending_approvals"

    if any(k in q for k in ("burnout", "overworked", "stress", "overtime", "fatigue", "exhausted")):
        return "burnout_check"
    if any(k in q for k in ("skill", "roadmap", "upskill", "learn ", "step ",
                              "approve roadmap", "reject roadmap", "resubmit step",
                              "pending roadmap", "roadmap approval")):
        return "skill_roadmap"
    if any(k in q for k in ("review", "performance review", "appraisal", "360", "feedback", "rating", "goal")):
        return "review_summary"
    if any(k in q for k in ("policy", "leave policy", "security policy", "handbook", "rules", "guidelines", "entitlement",
                            "how many leave", "how many days", "leave quota", "annual leave", "yearly leave",
                            "maximum leave", "how much leave")):
        return "policy_query"
    _emp_kws = (
        "who is my manager", "manager's manager", "skip level", "my direct reports",
        "who reports to", "reportee", "reporting", "org chart", "org tree",
        "reporting chain", "who manages", "my peers", "my teammates", "my colleagues",
        "new hires", "recent joiners", "who joined", "largest team", "most reports",
        "list all managers", "list managers", "employees in ", "who is in ",
        "employee id", "emp0", "emp-", "my profile", "my role", "my department",
        "my title", "who am i", "phone number of", "email of", "phone of",
        "contact of", "find employee", "search employee", "who is ", "tell me about ",
        "leave balance", "my balance", "my leaves", "attendance",
    )
    if any(k in q for k in _emp_kws):
        return "employee_query"

    # ── Embedding match — only reached for ambiguous queries ──────────────────
    top_intent, score = _embed_match(q, INTENTS)
    if top_intent and score >= 0.42:
        logger.info("Router embeddings top=%s score=%.3f", top_intent, score)
        return top_intent

    llm_intent, llm_conf = _llm_classify(q, INTENTS, LLMProviderFactory)
    if llm_intent and llm_conf >= 0.5:
        logger.info("Router llm top=%s conf=%.3f", llm_intent, llm_conf)
        return llm_intent

    return "nl_query"


_CACHE: Dict[str, List[float]] = {}
_CACHE_ORDER: List[str] = []
_CACHE_MAX = 256


def _embed_match(query: str, intents: dict) -> Tuple[str | None, float]:
    if not intents:
        return None, 0.0
    try:
        from core.llm.embedding_factory import EmbeddingProviderFactory
    except Exception:
        return None, 0.0
    try:
        provider = EmbeddingProviderFactory.get_provider()
    except Exception:
        return None, 0.0

    def emb(text: str) -> List[float]:
        if text in _CACHE:
            return _CACHE[text]
        vec = provider.embed(text)
        _CACHE[text] = vec
        _CACHE_ORDER.append(text)
        if len(_CACHE_ORDER) > _CACHE_MAX:
            oldest = _CACHE_ORDER.pop(0)
            _CACHE.pop(oldest, None)
        return vec

    qv = emb(query)
    def cos(a: List[float], b: List[float]) -> float:
        s = 0.0
        na = 0.0
        nb = 0.0
        ln = min(len(a), len(b))
        for i in range(ln):
            ai = a[i]
            bi = b[i]
            s += ai * bi
            na += ai * ai
            nb += bi * bi
        d = math.sqrt(na) * math.sqrt(nb) or 1.0
        return s / d

    best_intent = None
    best_score = -1.0
    for name, meta in intents.items():
        examples = meta.get("examples") or []
        if not examples:
            continue
        scores = []
        for ex in examples:
            ev = emb(ex)
            scores.append(cos(qv, ev))
        if not scores:
            continue
        sc = sum(sorted(scores, reverse=True)[:3]) / min(3, len(scores))
        if sc > best_score:
            best_score = sc
            best_intent = name
    return best_intent, float(best_score)


def _llm_classify(query: str, intents: dict, Factory):
    if not Factory or not intents:
        return None, 0.0
    try:
        provider = Factory.get_provider()
    except Exception:
        return None, 0.0
    try:
        labels = list(intents.keys())
        desc = {k: intents[k].get("description", "") for k in labels}
        sys = "You are an intent classifier. Return a strict JSON object with fields: intent, confidence (0..1), entities. intent must be one of: " + ", ".join(labels) + "."
        user = "Descriptions: " + json.dumps(desc, ensure_ascii=False) + "\nQuery: " + query
        msgs = [
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ]
        from core.llm.base import LLMMessage
        lm = [LLMMessage(role=m["role"], content=m["content"]) for m in msgs]
        resp = provider.complete(lm, temperature=0.0)
        data = {}
        try:
            data = json.loads(resp.content)
        except Exception:
            return None, 0.0
        it = data.get("intent")
        cf = float(data.get("confidence") or 0.0)
        if it in intents:
            return it, cf
        return None, 0.0
    except Exception:
        return None, 0.0
