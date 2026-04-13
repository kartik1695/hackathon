import logging

from agents.state import AgentState

logger = logging.getLogger("hrms")


def run(state: AgentState) -> AgentState:
    input_data = state.get("input_data") or {}
    query = input_data.get("query") or _build_query(state)
    try:
        from rag.retrieval import retrieve
    except ImportError as exc:
        logger.exception("RAG retrieval import failed")
        state["retrieved_docs"] = []
        state["error"] = str(exc)
        return state
    policy_name = input_data.get("policy_document")
    # Always fetch policy docs for leave collection so the policy_checker node has them
    use_policy_retrieval = (
        policy_name
        or state.get("intent") in ("policy_query", "leave_collection")
        or (state.get("intent") == "leave_application")
    )
    if use_policy_retrieval:
        try:
            from rag.policy_retrieval import retrieve as policy_retrieve
            name = str(policy_name).strip().lower() if policy_name else None
            docs = policy_retrieve(query, document_name=name, k=5)
        except Exception as exc:
            logger.exception("Policy RAG retrieval failed")
            docs = retrieve(state.get("intent", "nl_query"), query, k=3)
    else:
        docs = retrieve(state.get("intent", "nl_query"), query, k=3)
    state["retrieved_docs"] = docs
    logger.info("RAG node complete intent=%s docs=%s", state.get("intent"), len(docs))
    return state


def _build_query(state: AgentState) -> str:
    parts: list[str] = []
    input_data = state.get("input_data") or {}
    for key in ("leave_type", "from_date", "to_date", "days_count", "question"):
        val = input_data.get(key)
        if val:
            parts.append(f"{key}={val}")
    if state.get("spof_flag"):
        parts.append("spof risk team coverage")
    if state.get("conflict_detected"):
        parts.append("leave conflict overlap")
    # For multi-type leave collection, include all requested leave types
    leave_items = state.get("leave_items") or []
    if leave_items:
        types = " ".join({item.get("type", "") for item in leave_items if item.get("type")})
        parts.append(f"leave policy rules eligibility {types} consecutive days balance")
    if not parts:
        parts.append("leave policy rules eligibility")
    return " ".join(parts)
