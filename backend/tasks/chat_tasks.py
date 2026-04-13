import logging

from config.celery import app
from core.tasks.base import BaseHRMSTask

logger = logging.getLogger("hrms")


class SummarizeChatSessionTask(BaseHRMSTask):
    name = "tasks.chat_tasks.summarize_chat_session"

    def execute(self, session_id: str):
        try:
            from apps.ai.models import ChatSession
            from apps.ai.context import ContextService
        except ImportError as exc:
            logger.exception("Chat imports failed")
            return {"status": "error", "error": str(exc)}

        session = ChatSession.objects.filter(id=session_id, is_active=True).first()
        if not session:
            return {"status": "not_found"}

        svc = ContextService()
        s = svc.summarize_window(session)
        if not s:
            return {"status": "noop"}
        logger.info("Chat summarized session_id=%s summary_id=%s", session_id, s.id)
        return {"status": "ok", "summary_id": s.id}


summarize_chat_session = app.register_task(SummarizeChatSessionTask())

