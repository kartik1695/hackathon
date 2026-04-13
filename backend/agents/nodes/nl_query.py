import logging

from agents.state import AgentState

logger = logging.getLogger("hrms")


def run(state: AgentState) -> AgentState:
    input_data = state.get("input_data") or {}
    query = input_data.get("query") or input_data.get("text") or ""
    state["input_data"] = {**input_data, "query": query}
    logger.info("NL query normalized len=%s", len(query))
    return state

