"""
Chat repositories — data access layer for the ai app.

Each class has exactly one responsibility:
    ChatSessionRepository  : CRUD for ChatSession
    ChatMessageRepository  : CRUD for ChatMessage
    ChatSummaryRepository  : read access for ChatSummary

Following the project's ISP rule, write and read operations are kept in a single
class per model (the models are small and always used together), but agents receive
only the read methods they need via the public interface.
"""
from __future__ import annotations


class ChatSessionRepository:
    """Data access for ChatSession — no business logic."""

    def get_active(self, session_id: str, user_id: int):
        """Return an active session owned by `user_id`, or None."""
        from apps.ai.models import ChatSession
        return (
            ChatSession.objects
            .filter(id=session_id, user_id=user_id, is_active=True)
            .first()
        )

    def create(self, *, user_id: int, employee_id: int) -> object:
        """Create and return a new session."""
        from apps.ai.models import ChatSession
        return ChatSession.objects.create(
            user_id=user_id,
            employee_id=employee_id,  # Django resolves this to the FK column
            title="",
        )


class ChatMessageRepository:
    """Data access for ChatMessage — no business logic."""

    def create(
        self,
        *,
        session,
        role: str,
        content: str,
        intent: str = "",
        tool_snapshot: dict | None = None,
        retrieved_docs: list | None = None,
        embedding: list[float],
    ) -> object:
        from apps.ai.models import ChatMessage
        return ChatMessage.objects.create(
            session=session,
            role=role,
            content=content,
            intent=intent,
            tool_snapshot=tool_snapshot or {},
            retrieved_docs=retrieved_docs or [],
            embedding=embedding,
        )

    def get_recent(self, session, *, limit: int) -> list:
        """Return the last `limit` messages in chronological order."""
        from apps.ai.models import ChatMessage
        rows = list(
            ChatMessage.objects.filter(session=session)
            .order_by("-id")[:limit]
        )
        rows.reverse()
        return rows

    def get_semantic(
        self,
        session,
        *,
        query_vector: list[float],
        lookback: int = 500,
        exclude_ids: list[int] | None = None,
        limit: int = 6,
    ) -> list:
        """
        Return up to `limit` messages semantically closest to `query_vector`,
        drawn from the last `lookback` rows, excluding `exclude_ids`.
        Returns [] if pgvector is unavailable or any error occurs.
        """
        from apps.ai.models import ChatMessage
        try:
            from pgvector.django import CosineDistance

            latest_id = (
                ChatMessage.objects.filter(session=session)
                .order_by("-id")
                .values_list("id", flat=True)
                .first()
            ) or 0
            lookback_start = max(0, int(latest_id) - lookback)

            qs = (
                ChatMessage.objects.filter(
                    session=session,
                    id__gte=lookback_start,
                    role__in=[ChatMessage.ROLE_USER, ChatMessage.ROLE_ASSISTANT],
                )
                .annotate(distance=CosineDistance("embedding", query_vector))
                .order_by("distance", "-id")
            )
            if exclude_ids:
                qs = qs.exclude(id__in=exclude_ids)
            return list(qs[:limit])

        except Exception:
            return []

    def count_after(self, session, after_id: int) -> int:
        """Count messages created after `after_id`."""
        from apps.ai.models import ChatMessage
        return ChatMessage.objects.filter(session=session, id__gt=after_id).count()

    def get_unsummarised(self, session, *, after_id: int, limit: int) -> list:
        """Return up to `limit` user/assistant messages with id > `after_id`."""
        from apps.ai.models import ChatMessage
        return list(
            ChatMessage.objects.filter(
                session=session,
                id__gt=after_id,
                role__in=[ChatMessage.ROLE_USER, ChatMessage.ROLE_ASSISTANT],
            ).order_by("id")[:limit]
        )


class ChatSummaryRepository:
    """Data access for ChatSummary — no business logic."""

    def get_latest(self, session):
        """Return the most recent summary for `session`, or None."""
        from apps.ai.models import ChatSummary
        return (
            ChatSummary.objects.filter(session=session).order_by("-id").first()
        )

    def create(
        self,
        *,
        session,
        start_message_id: int,
        end_message_id: int,
        summary: str,
        embedding: list[float],
    ) -> object:
        from apps.ai.models import ChatSummary
        return ChatSummary.objects.create(
            session=session,
            start_message_id=start_message_id,
            end_message_id=end_message_id,
            summary=summary,
            embedding=embedding,
        )
