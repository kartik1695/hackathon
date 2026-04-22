"""
AI chat view — single endpoint for all chat interactions.

Responsibility (SRP): validate the HTTP request, delegate to ChatService, return the response.
All orchestration logic lives in ChatService (apps/ai/services.py).
"""
import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai.repositories import ChatSessionRepository, ChatMessageRepository
from apps.ai.services import ChatService
from core.permissions import IsEmployee
from core.utils import error_response

logger = logging.getLogger("hrms")

# Leave-collection fields the client must echo back each turn to continue a multi-step flow.
_LEAVE_COLLECTION_FIELDS = {
    "leave_items", "collection_stage", "collecting_index", "policy_violations",
}


class ChatView(APIView):
    """
    POST /api/ai/chat/

    Request body
    ------------
    message          str   (required) — the user's text; "query" is accepted as an alias
    session_id       str   (optional) — omit on the first turn; echo back on subsequent turns
    employee_id      int   (optional) — defaults to the authenticated user's employee id
                                        managers/HR may query on behalf of another employee
    collection_stage str   (optional) — leave-collection continuity; echo from previous response
    collecting_index int   (optional) — same as above
    leave_items      list  (optional) — same as above
    policy_violations list (optional) — same as above

    Response body
    -------------
    reply            str  — the assistant's message
    session_id       str  — use this in subsequent turns
    collection_stage str  — present only during an active leave-collection flow
    collecting_index int  — same as above
    leave_items      list — same as above
    policy_violations list — same as above
    """

    permission_classes = [IsEmployee]

    def post(self, request):
        employee = getattr(request.user, "employee", None)
        if not employee:
            return Response(
                error_response("Employee profile not found", "EMPLOYEE_NOT_FOUND"),
                status=status.HTTP_404_NOT_FOUND,
            )

        message, error = self._parse_message(request.data)
        if error:
            return error

        employee_id, error = self._parse_employee_id(request.data, employee)
        if error:
            return error

        if not self._requester_may_query(employee, employee_id):
            return Response(
                error_response("Forbidden", "FORBIDDEN"),
                status=status.HTTP_403_FORBIDDEN,
            )

        result = ChatService().handle(
            user=request.user,
            employee=employee,
            employee_id=employee_id,
            message=message,
            session_id=request.data.get("session_id"),
            collection_state=self._extract_collection_state(request.data),
        )

        if result.get("error"):
            logger.warning(
                "AI agent error intent=%s requester_id=%s error=%s",
                result.get("intent"), request.user.id, result["error"],
            )
            return Response(
                {
                    **error_response("AI processing failed", "AI_ERROR"),
                    "session_id": result.get("_session_id", ""),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        logger.info(
            "Chat complete intent=%s requester_id=%s employee_id=%s",
            result.get("intent"), request.user.id, employee_id,
        )

        reply = (result.get("llm_response") or result.get("manager_context") or "").strip()
        return Response(
            {
                "reply":      reply,
                "session_id": result.get("_session_id", ""),
                "tool_results": result.get("tool_results", {}),
                **self._leave_collection_fields(result),
            },
            status=status.HTTP_200_OK,
        )

    # ── Request parsing helpers ──────────────────────────────────────────────

    @staticmethod
    def _parse_message(data: dict) -> tuple[str, Response | None]:
        """Return (message, None) or ('', error_response)."""
        message = str(data.get("message") or data.get("query") or "").strip()
        if not message:
            return "", Response(
                error_response("message is required", "INVALID_INPUT"),
                status=status.HTTP_400_BAD_REQUEST,
            )
        return message, None

    @staticmethod
    def _parse_employee_id(data: dict, employee) -> tuple[int, Response | None]:
        """Return (employee_id, None) or (0, error_response)."""
        raw = data.get("employee_id") or employee.id
        try:
            return int(raw), None
        except (TypeError, ValueError):
            return 0, Response(
                error_response("Invalid employee_id", "INVALID_INPUT"),
                status=status.HTTP_400_BAD_REQUEST,
            )

    @staticmethod
    def _requester_may_query(employee, employee_id: int) -> bool:
        """Employees may only query themselves; elevated roles may query anyone."""
        return employee_id == employee.id or employee.role in ("manager", "hr", "cfo", "admin")

    @staticmethod
    def _extract_collection_state(data: dict) -> dict:
        """Pull leave-collection continuity fields out of the request body."""
        return {
            "collection_stage":  data.get("collection_stage"),
            "collecting_index":  int(data.get("collecting_index") or 0),
            "leave_items":       data.get("leave_items") or [],
            "policy_violations": data.get("policy_violations") or [],
        }

    @staticmethod
    def _leave_collection_fields(result: dict) -> dict:
        """Extract only the leave-collection fields from the agent result."""
        return {k: result[k] for k in _LEAVE_COLLECTION_FIELDS if k in result}


class ChatSessionListView(APIView):
    """
    GET /api/ai/sessions/
    Returns the authenticated user's most recent chat sessions.
    """
    permission_classes = [IsEmployee]

    def get(self, request):
        sessions = ChatSessionRepository().list_for_user(request.user.id, limit=20)
        data = [
            {
                "session_id": str(s.id),
                "title": s.title or "",
                "last_active_at": s.last_active_at.isoformat(),
                "created_at": s.created_at.isoformat(),
            }
            for s in sessions
        ]
        return Response({"sessions": data}, status=status.HTTP_200_OK)


class ChatSessionMessagesView(APIView):
    """
    GET /api/ai/sessions/<session_id>/messages/
    Returns all user/assistant messages for a session owned by the requester.
    """
    permission_classes = [IsEmployee]

    def get(self, request, session_id):
        session = ChatSessionRepository().get_active(session_id, request.user.id)
        if not session:
            return Response(
                error_response("Session not found", "SESSION_NOT_FOUND"),
                status=status.HTTP_404_NOT_FOUND,
            )
        messages = ChatMessageRepository().get_recent(session, limit=200)
        data = [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "tool_results": m.tool_snapshot,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
            if m.role in ("user", "assistant")
        ]
        return Response({"messages": data, "session_id": str(session.id)}, status=status.HTTP_200_OK)
