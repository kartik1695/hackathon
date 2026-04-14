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
from apps.ai.memory import ChatMemoryCache
from tasks.chat_tasks import extract_turn_entities, summarize_chat_session

logger = logging.getLogger("hrms")


class ChatService:
    """Orchestrates a single chat turn for any requester role."""

    def __init__(
        self,
        context_service: ContextService | None = None,
        memory_cache: ChatMemoryCache | None = None,
    ):
        self._ctx = context_service or ContextService()
        self._mem = memory_cache or ChatMemoryCache()

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
        session_id_str = str(session.id)

        # Persist user message to DB
        self._ctx.add_user_message(session, message)

        # Build context: Redis cache (fast) merged with DB summary (durable)
        db_context    = self._ctx.build_context(session, query=message)
        redis_history = self._mem.build_history_messages(session_id_str, last_n=8)
        pinned_tools  = self._mem.get_pinned_tool_results(session_id_str)

        _G, _B, _R = "\033[32m", "\033[1m", "\033[0m"
        db_msgs = db_context.get("messages") or []
        db_summary = db_context.get("summary") or ""
        redis_history_dump = "\n".join(
            f"    [{i+1}] {m.get('role','?').upper()}: {m.get('content','')}"
            for i, m in enumerate(redis_history)
        ) or "    (empty)"
        logger.info(
            f"{_G}{_B}[MEMORY] CONTEXT ASSEMBLED{_R}{_G}  session={session_id_str[:8]}\n"
            f"  query           : {message}\n"
            f"  redis_history   : {len(redis_history)} messages\n"
            f"{redis_history_dump}\n"
            f"  db_messages     : {len(db_msgs)} messages (semantic+recent from DB)\n"
            f"  db_summary      : {'yes — ' + db_summary if db_summary else 'none'}\n"
            f"  pinned_tools    : {list(pinned_tools.keys()) or 'none'}{_R}"
        )

        agent_state = self._build_agent_state(
            employee=employee,
            employee_id=employee_id,
            user=user,
            message=message,
            session=session,
            chat_context=db_context,
            collection_state=collection_state,
            redis_history=redis_history,
            pinned_tool_results=pinned_tools,
        )

        result = run_agent(agent_state)
        reply  = (result.get("llm_response") or result.get("manager_context") or "").strip()

        if reply:
            # Persist assistant message to DB
            self._ctx.add_assistant_message(
                session,
                reply=reply,
                intent=str(result.get("intent") or ""),
                tool_snapshot=result.get("tool_results") or {},
                retrieved_docs=result.get("retrieved_docs") or [],
            )
            # Push completed turn to Redis memory cache (both query + reply + tool results)
            self._mem.push_turn(
                session_id_str,
                user_query=message,
                assistant_reply=reply,
                intent=str(result.get("intent") or ""),
                tool_results=result.get("tool_results") or {},
            )

        # Async: extract intent + entities from this turn for pronoun resolution in future turns
        if reply:
            try:
                extract_turn_entities.delay(
                    session_id_str,
                    message,
                    reply,
                    str(result.get("intent") or ""),
                    result.get("tool_results") or {},
                )
            except Exception:
                logger.exception("Failed to queue extract_turn_entities for session %s", session_id_str)

        if self._ctx.should_summarize(session):
            try:
                summarize_chat_session.delay(session_id_str)
            except Exception:
                logger.exception("Failed to queue summarize_chat_session for session %s", session_id_str)

        result["_session_id"] = session_id_str
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
        redis_history: list[dict] | None = None,
        pinned_tool_results: dict | None = None,
    ) -> dict:
        """
        Construct the full LangGraph AgentState from the request + session context.

        chat_history is the merged view:
          - redis_history: fast Redis cache of recent turns (structured, reliable)
          - chat_context messages: DB-backed recent + semantic messages (fallback / older turns)
        Deduplication: Redis turns are preferred; DB messages fill gaps for older context.

        pinned_tool_results: tool data fetched in the last 2 turns, injected so the
        LLM does not hallucinate facts it already looked up.
        """
        # Merge history: Redis turns are authoritative for recency;
        # DB messages provide older semantic matches not in the Redis window.
        redis_ids = {m.get("content", "") for m in (redis_history or [])}
        db_messages = [
            m for m in (chat_context.get("messages") or [])
            if m.get("content", "") not in redis_ids
        ]
        # Final history: older DB messages first, then Redis recent turns
        merged_history = db_messages + (redis_history or [])

        # Build a lightweight profile snapshot so the LLM can personalise every response.
        try:
            manager_name = employee.manager.user.name if employee.manager_id else None
        except Exception:
            manager_name = None
        try:
            dept_name = employee.department.name if employee.department_id else None
        except Exception:
            dept_name = None
        user_profile = {
            "name":          getattr(user, "name", None) or "",
            "first_name":    (getattr(user, "name", None) or "").split()[0] if getattr(user, "name", None) else "",
            "employee_id":   employee.employee_id,
            "role":          employee.role,
            "title":         employee.title or "",
            "department":    dept_name or "",
            "manager_name":  manager_name or "",
        }

        return {
            # ── routing ────────────────────────────────────────────────────────
            "intent": "",  # router node derives this from the message

            # ── requester identity ─────────────────────────────────────────────
            "employee_id":    employee_id,
            "requester_id":   user.id,
            "requester_role": employee.role,
            "user_profile":   user_profile,

            # ── current user message + leave-collection continuity ─────────────
            "input_data": {
                "query":             message,
                "collection_stage":  collection_state.get("collection_stage"),
                "collecting_index":  collection_state.get("collecting_index", 0),
                "leave_items":       collection_state.get("leave_items", []),
                "policy_violations": collection_state.get("policy_violations", []),
            },

            # ── session & conversation context ────────────────────────────────
            "chat_session_id":    str(session.id),
            "chat_summary":       chat_context.get("summary") or "",
            "chat_history":       merged_history,

            # ── pinned tool results from previous turns (Strategy D) ──────────
            # Pre-seeded into tool_results so the MCP node can skip re-fetching;
            # current turn's tools will overwrite these for the same keys.
            # Also stored separately so llm_generate can label them as "prior turn".
            "tool_results":           pinned_tool_results or {},
            "_pinned_tool_results":   pinned_tool_results or {},

            # ── agent working fields (nodes populate these) ───────────────────
            "retrieved_docs":    [],
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
