"""
ContextService — manages chat sessions, message persistence, and context retrieval.

Responsibilities (SRP — one per method group):
    Session management  : get_or_create_session
    Message persistence : add_user_message, add_assistant_message
    Context retrieval   : build_context  (recent + semantic)
    Summarisation gate  : should_summarize, summarize_window

Dependencies are injected (DIP) — this class never imports ORM models directly
or calls the embedding provider directly. Both concerns are owned by repositories
and ChatEmbedder respectively.
"""
from __future__ import annotations

import logging

from apps.ai.repositories import (
    ChatMessageRepository,
    ChatSessionRepository,
    ChatSummaryRepository,
)
from apps.ai.retrieval import ChatEmbedder

logger = logging.getLogger("hrms")

_DEFAULT_RECENT_MESSAGES   = 10   # pairs → up to 20 rows fetched
_DEFAULT_SEMANTIC_MESSAGES = 6
_DEFAULT_SUMMARIZE_AFTER   = 20   # new messages before triggering summarisation
_DEFAULT_SUMMARY_WINDOW    = 40   # messages included in one summary


class ContextService:
    """
    Orchestrates conversation context for a chat session.

    All data access is delegated to repositories.
    All embedding work is delegated to ChatEmbedder.
    This class contains zero ORM calls and zero embedding logic.
    """

    def __init__(
        self,
        session_repo:  ChatSessionRepository  | None = None,
        message_repo:  ChatMessageRepository  | None = None,
        summary_repo:  ChatSummaryRepository  | None = None,
        embedder:      ChatEmbedder           | None = None,
    ):
        self._sessions  = session_repo  or ChatSessionRepository()
        self._messages  = message_repo  or ChatMessageRepository()
        self._summaries = summary_repo  or ChatSummaryRepository()
        self._embedder  = embedder      or ChatEmbedder()

    # ── Session ──────────────────────────────────────────────────────────────

    def get_or_create_session(self, user, employee_id: int, session_id=None):
        """Return the requested active session, or create a fresh one."""
        if session_id:
            session = self._sessions.get_active(str(session_id), user.id)
            if session:
                return session
        return self._sessions.create(user_id=user.id, employee_id=employee_id)

    # ── Message persistence ──────────────────────────────────────────────────

    def add_user_message(self, session, content: str):
        """Embed and persist a user turn."""
        return self._persist_message(session, role="user", content=content)

    def add_assistant_message(
        self,
        session,
        *,
        reply: str,
        intent: str = "",
        tool_snapshot: dict | None = None,
        retrieved_docs: list | None = None,
    ):
        """Embed and persist an assistant turn with optional structured metadata."""
        return self._persist_message(
            session,
            role="assistant",
            content=reply,
            intent=intent,
            tool_snapshot=tool_snapshot,
            retrieved_docs=retrieved_docs,
        )

    # ── Context retrieval ────────────────────────────────────────────────────

    def build_context(
        self,
        session,
        query: str,
        max_recent:   int = _DEFAULT_RECENT_MESSAGES,
        max_semantic: int = _DEFAULT_SEMANTIC_MESSAGES,
    ) -> dict:
        """
        Build the conversation context dict to inject into the agent state.

        Strategy:
            1. Most-recent `max_recent` message pairs (always included)
            2. Up to `max_semantic` semantically similar messages from the last
               500 rows (never duplicates from step 1)
            3. Latest summary text (if one exists)

        Returns:
            {
                "session_id": str,
                "summary":    str,
                "messages":   [{"role", "content", "created_at"}, ...]
            }
        """
        latest_summary  = self._summaries.get_latest(session)
        recent_messages = self._messages.get_recent(session, limit=max_recent * 2)
        semantic_messages = self._fetch_semantic_messages(
            session, query, recent_messages, max_semantic
        )

        serialised = [
            {"role": m.role, "content": m.content, "created_at": m.created_at}
            for m in recent_messages + semantic_messages
        ]

        return {
            "session_id": str(session.id),
            "summary":    latest_summary.summary if latest_summary else "",
            "messages":   serialised,
        }

    # ── Summarisation ────────────────────────────────────────────────────────

    def should_summarize(
        self, session, min_new_messages: int = _DEFAULT_SUMMARIZE_AFTER
    ) -> bool:
        """Return True when enough new messages have accumulated since the last summary."""
        last_summary = self._summaries.get_latest(session)
        last_end_id  = last_summary.end_message_id if last_summary else 0
        new_count    = self._messages.count_after(session, after_id=last_end_id)
        return new_count >= min_new_messages

    def summarize_window(self, session, max_messages: int = _DEFAULT_SUMMARY_WINDOW):
        """
        Summarise the next unsummarised message window.

        Tries an LLM-generated summary first; falls back to an extractive summary
        if the LLM is unavailable.

        Returns the new ChatSummary, or None if there is nothing to summarise.
        """
        last_summary = self._summaries.get_latest(session)
        last_end_id  = last_summary.end_message_id if last_summary else 0

        messages = self._messages.get_unsummarised(
            session, after_id=last_end_id, limit=max_messages
        )
        if not messages:
            return None

        summary_text = _llm_summary(messages) or _extractive_summary(messages)
        embedding    = self._embedder.embed(summary_text or "summary")

        return self._summaries.create(
            session=session,
            start_message_id=messages[0].id,
            end_message_id=messages[-1].id,
            summary=summary_text,
            embedding=embedding,
        )

    # ── Private helpers ──────────────────────────────────────────────────────

    def _persist_message(
        self,
        session,
        *,
        role: str,
        content: str,
        intent: str = "",
        tool_snapshot: dict | None = None,
        retrieved_docs: list | None = None,
    ):
        content = (content or "").strip()
        if not content:
            return None

        return self._messages.create(
            session=session,
            role=role,
            content=content,
            intent=intent,
            tool_snapshot=tool_snapshot,
            retrieved_docs=retrieved_docs,
            embedding=self._embedder.embed(content),
        )

    def _fetch_semantic_messages(
        self, session, query: str, recent_messages: list, max_semantic: int
    ) -> list:
        """Delegate semantic search to the message repository."""
        query_vector = self._embedder.embed(query)
        exclude_ids  = [m.id for m in recent_messages]
        return self._messages.get_semantic(
            session,
            query_vector=query_vector,
            exclude_ids=exclude_ids,
            limit=max_semantic,
        )


# ---------------------------------------------------------------------------
# Module-level pure functions (no state, no IO — safe to unit-test directly)
# ---------------------------------------------------------------------------

def _llm_summary(messages: list) -> str:
    """
    Ask the configured LLM to summarise a list of ChatMessage objects.
    Returns '' if the LLM is unavailable or raises.
    """
    try:
        from core.llm.base import LLMMessage
        from core.llm.factory import LLMProviderFactory

        transcript = "\n".join(f"{m.role}: {m.content}" for m in messages)
        system_prompt = (
            "Summarize this HRMS chat conversation briefly. "
            "Keep only stable facts, preferences, and open tasks. "
            "Do not invent information."
        )
        provider = LLMProviderFactory.get_provider()
        response = provider.complete(
            [
                LLMMessage(role="system", content=system_prompt),
                LLMMessage(role="user",   content=transcript),
            ],
            temperature=0.0,
        )
        return (response.content or "").strip()

    except Exception:
        logger.warning("LLM summary unavailable — falling back to extractive summary")
        return ""


def _extractive_summary(messages: list) -> str:
    """
    Lightweight fallback: extract the last user request and the last assistant reply.
    Used when the LLM is unavailable.
    """
    last_user      = ""
    last_assistant = ""

    for m in reversed(messages):
        role = getattr(m, "role", "")
        if not last_user and role == "user":
            last_user = m.content
        if not last_assistant and role == "assistant":
            last_assistant = m.content
        if last_user and last_assistant:
            break

    parts = []
    if last_user:
        parts.append(f"Last user request: {last_user}")
    if last_assistant:
        parts.append(f"Last assistant response: {last_assistant}")
    return "\n".join(parts).strip()
