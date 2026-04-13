from typing import Optional, TypedDict


class AgentState(TypedDict):
    intent: str
    employee_id: int
    requester_id: int
    requester_role: str
    input_data: dict
    chat_session_id: Optional[str]
    chat_summary: Optional[str]
    chat_history: list[dict]
    retrieved_docs: list[str]
    tool_results: dict
    llm_response: Optional[str]
    spof_flag: bool
    conflict_detected: bool
    conflict_summary: Optional[str]
    manager_context: Optional[str]
    burnout_score: Optional[float]
    burnout_signals: Optional[dict]
    error: Optional[str]
    # Multi-type leave collection state (persisted across chat turns via input_data)
    leave_items: list[dict]          # [{type, days, from_date, to_date, reason, status, violations, applied_leave_id}]
    collection_stage: Optional[str]  # collecting_details | checking_policy | awaiting_confirmation | applying | done
    collecting_index: int            # index of leave item currently being collected
    policy_violations: list[dict]    # [{leave_type, rule, severity, message}]
