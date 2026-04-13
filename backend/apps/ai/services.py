"""
Chat service — single responsibility: orchestrate one chat turn.

Flow:
    1. Restore or create the chat session
    2. Persist the incoming user message
    3. Retrieve conversation context (recent + semantic)
    4. Build the LangGraph agent state
    5. Run the agent
    6. Persist the assistant reply
    7. Trigger async summarisation if the session is long enough
    8. Return the agent result so the view can build the HTTP response
"""
import logging

from agents.graph import run_agent
from apps.ai.context import ContextService
from tasks.chat_tasks import summarize_chat_session

logger = logging.getLogger("hrms")


class ChatService:
    """Orchestrates a single chat turn for any requester role."""

    def __init__(self, context_service: ContextService | None = None):
        self._ctx = context_service or ContextService()

    # ──────────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────────

    def handle(
        self,
        *,
        user,
        employee,
        employee_id: int,
        message: str,
        session_id: str | None,
        collection_state: dict,
    ) -> dict:
        """
        Execute one chat turn and return the raw agent result dict.

        Args:
            user:             Django auth user making the request
            employee:         The Employee profile of that user
            employee_id:      The employee the query is *about* (may differ for managers/HR)
            message:          The user's text
            session_id:       UUID of an existing session (None → create a new one)
            collection_state: Leave-collection continuity fields echoed back by the client
                              (collection_stage, collecting_index, leave_items, policy_violations)

        Returns:
            The agent result dict (internal fields still present — view strips them).
        """
        session = self._ctx.get_or_create_session(user, employee_id, session_id=session_id)
        self._ctx.add_user_message(session, message)

        chat_context = self._ctx.build_context(session, query=message)
        agent_state  = self._build_agent_state(
            employee=employee,
            employee_id=employee_id,
            user=user,
            message=message,
            session=session,
            chat_context=chat_context,
            collection_state=collection_state,
        )

        result = run_agent(agent_state)
        reply  = (result.get("llm_response") or result.get("manager_context") or "").strip()

        if reply:
            self._ctx.add_assistant_message(
                session,
                reply=reply,
                intent=str(result.get("intent") or ""),
                tool_snapshot=result.get("tool_results") or {},
                retrieved_docs=result.get("retrieved_docs") or [],
            )

        if self._ctx.should_summarize(session):
            try:
                summarize_chat_session.delay(str(session.id))
            except Exception:
                logger.exception("Failed to queue summarize_chat_session for session %s", session.id)

        result["_session_id"] = str(session.id)
        return result

    # ──────────────────────────────────────────────────────────────────────────
    # Private helpers
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _build_agent_state(
        *,
        employee,
        employee_id: int,
        user,
        message: str,
        session,
        chat_context: dict,
        collection_state: dict,
    ) -> dict:
        """Construct the full LangGraph AgentState from the request + session context."""
        return {
            # ── routing ────────────────────────────────────────────────────────
            "intent": "",  # router node derives this from the message

            # ── requester identity ─────────────────────────────────────────────
            "employee_id":    employee_id,
            "requester_id":   user.id,
            "requester_role": employee.role,

            # ── current user message + leave-collection continuity ─────────────
            "input_data": {
                "query":             message,
                "collection_stage":  collection_state.get("collection_stage"),
                "collecting_index":  collection_state.get("collecting_index", 0),
                "leave_items":       collection_state.get("leave_items", []),
                "policy_violations": collection_state.get("policy_violations", []),
            },

            # ── session & conversation context ────────────────────────────────
            "chat_session_id": str(session.id),
            "chat_summary":    chat_context.get("summary") or "",
            "chat_history":    chat_context.get("messages") or [],

            # ── agent working fields (nodes populate these) ───────────────────
            "retrieved_docs":    [],
            "tool_results":      {},
            "llm_response":      None,
            "spof_flag":         False,
            "conflict_detected": False,
            "conflict_summary":  None,
            "manager_context":   None,
            "burnout_score":     None,
            "burnout_signals":   None,
            "error":             None,

            # ── leave-collection continuity (top-level for node convenience) ──
            "leave_items":        collection_state.get("leave_items", []),
            "collection_stage":   collection_state.get("collection_stage"),
            "collecting_index":   collection_state.get("collecting_index", 0),
            "policy_violations":  collection_state.get("policy_violations", []),
        }
