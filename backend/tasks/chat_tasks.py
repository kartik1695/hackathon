import json
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


_ENTITY_EXTRACTION_PROMPT = """\
You are an entity extractor for an HRMS chatbot. Given one conversation turn, extract a JSON object with:
  - "intent": the user's goal (e.g. "direct_reports_query", "manager_query", "leave_balance", "profile_query", "greeting", "policy_query")
  - "entities": list of objects, each with:
      - "name": full name as mentioned (string or null)
      - "employee_id": numeric DB id if present in tool_results (int or null)
      - "employee_code": e.g. "EMP007" if mentioned (string or null)
      - "type": one of "person", "leave_type", "department", "date"
  - "action_taken": one short sentence describing what was looked up or done
  - "focus_employee_id": the primary employee DB id this turn was ABOUT (int or null) — the person the user was asking about, NOT the requester

Return ONLY valid JSON. No prose, no markdown fences.

--- TURN ---
User query: {query}
Intent: {intent}
Tool results summary: {tool_summary}
Assistant reply (first 300 chars): {reply_snippet}
"""


class ExtractTurnEntitiesTask(BaseHRMSTask):
    name = "tasks.chat_tasks.extract_turn_entities"
    max_retries = 1  # entity extraction is best-effort

    def execute(
        self,
        session_id: str,
        user_query: str,
        assistant_reply: str,
        intent: str,
        tool_results: dict,
    ):
        try:
            from core.llm.base import LLMMessage
            from core.llm.factory import LLMProviderFactory
            from apps.ai.memory import ChatMemoryCache
        except ImportError as exc:
            logger.exception("ExtractTurnEntitiesTask imports failed")
            return {"status": "error", "error": str(exc)}

        # Build a compact tool summary (just keys + top-level employee names/ids)
        tool_summary = _compact_tool_summary(tool_results)

        prompt = _ENTITY_EXTRACTION_PROMPT.format(
            query=user_query,
            intent=intent,
            tool_summary=tool_summary,
            reply_snippet=(assistant_reply or "")[:300],
        )

        try:
            provider = LLMProviderFactory.get_provider()
            response = provider.complete(
                [LLMMessage(role="user", content=prompt)],
                temperature=0.0,
            )
            raw = (response.content or "").strip()
            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            entry = json.loads(raw)
        except Exception as exc:
            logger.exception("Entity extraction LLM/parse failed session=%s", session_id)
            return {"status": "error", "error": str(exc)}

        entry["turn_query"] = user_query[:120]  # keep a short reference
        mem = ChatMemoryCache()
        mem.push_entity_entry(session_id, entry)
        logger.info(
            "[ENTITY] extracted session=%s intent=%s focus_id=%s entities=%s",
            session_id[:8], entry.get("intent"), entry.get("focus_employee_id"),
            [e.get("name") for e in (entry.get("entities") or [])],
        )
        return {"status": "ok", "entry": entry}


def _compact_tool_summary(tool_results: dict) -> str:
    """Build a compact human-readable summary of tool results for the extraction prompt."""
    parts = []
    for tool, data in (tool_results or {}).items():
        if not isinstance(data, dict) or "error" in data:
            continue
        # Extract the most useful fields per tool type
        if tool == "get_employee_manager_chain":
            chain = data.get("manager_chain") or []
            names = [f"{e.get('name')} (id={e.get('id')}, level={e.get('level')})" for e in chain]
            parts.append(f"manager_chain: {names}")
        elif tool in ("get_direct_reports", "get_peers"):
            key = "direct_reports" if tool == "get_direct_reports" else "peers"
            reports = data.get(key) or []
            names = [f"{e.get('name')} (id={e.get('id')})" for e in reports[:5]]
            parts.append(f"{tool}: {names}")
        elif tool == "find_employee_by_name":
            results = data.get("results") or []
            names = [f"{e.get('name')} (id={e.get('id')})" for e in results[:3]]
            parts.append(f"name_search: {names}")
        elif tool in ("get_employee_profile", "get_my_profile"):
            parts.append(
                f"{tool}: name={data.get('name')} id={data.get('id')} "
                f"dept={data.get('department')} title={data.get('title')}"
            )
        elif tool == "get_leave_balance":
            balances = data.get("balances") or {}
            parts.append(f"leave_balance: {balances}")
        else:
            parts.append(f"{tool}: (present)")
    return "; ".join(parts) if parts else "none"


extract_turn_entities = app.register_task(ExtractTurnEntitiesTask())

