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

    q = str(input_data.get("query") or "").lower()
    if not q:
        return "nl_query"

    try:
        from agents.intent_registry import INTENTS
        from core.llm.factory import LLMProviderFactory
    except Exception:
        INTENTS = {}
        LLMProviderFactory = None

    top_intent, score = _embed_match(q, INTENTS)
    if top_intent and score >= 0.42:
        logger.info("Router embeddings top=%s score=%.3f", top_intent, score)
        return top_intent

    llm_intent, llm_conf = _llm_classify(q, INTENTS, LLMProviderFactory)
    if llm_intent and llm_conf >= 0.5:
        logger.info("Router llm top=%s conf=%.3f", llm_intent, llm_conf)
        return llm_intent

    # Keyword fallbacks
    _multi_leave_kws = ("sl", "cl", "el", "pl", "multiple leave", "sick and casual", "2 sl", "3 cl", "1 pl")
    if any(k in q for k in _multi_leave_kws) and any(k in q for k in ("apply", "request", "want", "need", "take")):
        return "leave_collection"
    if any(k in q for k in ("apply leave", "apply for leave", "leave from", "leave to", "leave days", "request leave")):
        return "leave_application"
    if any(k in q for k in ("policy", "leave policy", "security policy", "handbook", "rules", "guidelines")):
        return "policy_query"

    # Employee directory / org structure keyword fallbacks
    _emp_kws = (
        "who is my manager", "who is in my team", "my direct reports", "who reports to",
        "org chart", "org tree", "reporting chain", "who manages", "my peers",
        "my teammates", "my colleagues", "new hires", "recent joiners", "who joined",
        "largest team", "most reports", "list all managers", "list managers",
        "employees in ", "who is in ", "employee id", "emp0", "emp-",
        "my profile", "my role", "my department", "my title", "who am i",
        "phone number of", "email of", "phone of", "contact of",
        "find employee", "search employee",
    )
    if any(k in q for k in _emp_kws):
        return "employee_query"

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
