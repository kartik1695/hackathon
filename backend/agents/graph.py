import logging

from agents.state import AgentState
from agents.router import route

logger = logging.getLogger("hrms")

_LEAVE_FLOW = [
    "agents.nodes.mcp_tools",
    "agents.nodes.spof",
    "agents.nodes.conflict",
    "agents.nodes.rag_retrieval",
    "agents.nodes.llm_generate",
]

# Multi-turn leave collection: parse → fetch context → check policy → apply → respond
_LEAVE_COLLECTION_FLOW = [
    "agents.nodes.leave_collector",   # parse intent / advance collection stage
    "agents.nodes.mcp_tools",         # fetch balance + profile; apply batch when stage=applying
    "agents.nodes.rag_retrieval",     # retrieve policy docs (always useful)
    "agents.nodes.policy_checker",    # validate policy+balance when stage=checking_policy
    "agents.nodes.spof",              # SPOF risk (only meaningful when applying)
    "agents.nodes.conflict",          # conflict detection (only meaningful when applying)
    "agents.nodes.llm_generate",      # generate next question / confirmation / summary
]

_BURNOUT_FLOW = [
    "agents.nodes.mcp_tools",
    "agents.nodes.rag_retrieval",
    "agents.nodes.llm_generate",
]

_REVIEW_FLOW = [
    "agents.nodes.mcp_tools",
    "agents.nodes.rag_retrieval",
    "agents.nodes.llm_generate",
]

_NL_FLOW = [
    "agents.nodes.nl_query",
    "agents.nodes.mcp_tools",
    "agents.nodes.llm_generate",
]

_POLICY_FLOW = [
    "agents.nodes.rag_retrieval",
    "agents.nodes.llm_generate",
]

# Employee directory / org queries — MCP tools + LLM synthesis
_EMPLOYEE_FLOW = [
    "agents.nodes.nl_query",
    "agents.nodes.mcp_tools",
    "agents.nodes.llm_generate",
]

def run_leave_agent(state: AgentState) -> AgentState:
    state = {**state, "intent": "leave_application"}
    return run_agent(state)


def run_agent(state: AgentState) -> AgentState:
    state = _normalize_state(state)
    intent = route(state)
    state["intent"] = intent
    logger.info("Agent start intent=%s employee_id=%s requester_id=%s", intent, state.get("employee_id"), state.get("requester_id"))

    flow = _get_flow(intent)
    for mod_name in flow:
        state = _run_node(mod_name, state)
        if state.get("error"):
            logger.info("Agent early-stop intent=%s node=%s error=%s", intent, mod_name, state.get("error"))
            break

    logger.info(
        "Agent done intent=%s spof=%s conflict=%s burnout=%s",
        intent,
        state.get("spof_flag"),
        state.get("conflict_detected"),
        state.get("burnout_score"),
    )
    return state


def _get_flow(intent: str) -> list[str]:
    if intent == "leave_collection":
        return _LEAVE_COLLECTION_FLOW
    if intent == "leave_application":
        return _LEAVE_FLOW
    if intent == "burnout_check":
        return _BURNOUT_FLOW
    if intent == "review_summary":
        return _REVIEW_FLOW
    if intent == "policy_query":
        return _POLICY_FLOW
    if intent == "employee_query":
        return _EMPLOYEE_FLOW
    return _NL_FLOW


def _run_node(module_path: str, state: AgentState) -> AgentState:
    try:
        module = __import__(module_path, fromlist=["run"])
        fn = getattr(module, "run")
    except Exception as exc:
        logger.exception("Agent node import failed node=%s", module_path)
        state["error"] = str(exc)
        return state

    try:
        return fn(state)
    except Exception as exc:
        logger.exception("Agent node failed node=%s", module_path)
        state["error"] = str(exc)
        return state


def _normalize_state(state: AgentState) -> AgentState:
    input_data = state.get("input_data") or {}
    defaults: dict = {
        "intent": state.get("intent") or "",
        "employee_id": state.get("employee_id") or 0,
        "requester_id": state.get("requester_id") or 0,
        "requester_role": state.get("requester_role") or "",
        "input_data": input_data,
        "chat_session_id": state.get("chat_session_id"),
        "chat_summary": state.get("chat_summary") or "",
        "chat_history": state.get("chat_history") or [],
        "retrieved_docs": state.get("retrieved_docs") or [],
        "tool_results": state.get("tool_results") or {},
        "llm_response": state.get("llm_response"),
        "spof_flag": bool(state.get("spof_flag") or False),
        "conflict_detected": bool(state.get("conflict_detected") or False),
        "conflict_summary": state.get("conflict_summary"),
        "manager_context": state.get("manager_context"),
        "burnout_score": state.get("burnout_score"),
        "burnout_signals": state.get("burnout_signals"),
        "error": state.get("error"),
        # Multi-type leave collection (restored from input_data when not in state)
        "leave_items": state.get("leave_items") or input_data.get("leave_items") or [],
        "collection_stage": state.get("collection_stage") or input_data.get("collection_stage"),
        "collecting_index": int(state.get("collecting_index") or input_data.get("collecting_index") or 0),
        "policy_violations": state.get("policy_violations") or input_data.get("policy_violations") or [],
    }
    return defaults
