"""
ChatMemoryCache — Redis-backed structured turn cache.

Strategy: B + D
  B) Each turn stored as {user_query, assistant_reply, intent} in Redis list.
     Fast reads, no DB hit on every request.
  D) Tool results from the last 2 turns pinned in Redis.
     LLM sees the actual data it previously answered from → eliminates fact hallucination.

TTL: 2 hours (sessions expire if idle).
Max turns kept in Redis: 12 (beyond that, DB + summary handles it).
"""
from __future__ import annotations

import json
import logging

from core.cache.keys import CacheKeys

logger = logging.getLogger("hrms")

_MAX_TURNS = 12       # max turns kept in Redis per session
_TTL = 60 * 60 * 2   # 2-hour TTL — refreshed on every write
_TOOL_TURNS = 2       # how many recent turns of tool results to pin

# ANSI green for terminal debug output
_G  = "\033[32m"
_B  = "\033[1m"       # bold
_R  = "\033[0m"       # reset


def _green(msg: str) -> str:
    return f"{_G}{_B}[MEMORY]{_R}{_G} {msg}{_R}"


class ChatMemoryCache:
    """
    Redis-backed structured turn cache. One instance per request is fine —
    the underlying RedisBackend is stateless after __init__.
    """

    def __init__(self):
        from core.cache.redis_backend import RedisBackend
        self._cache = RedisBackend()

    # ── Write ────────────────────────────────────────────────────────────────

    def push_turn(
        self,
        session_id: str,
        *,
        user_query: str,
        assistant_reply: str,
        intent: str = "",
        tool_results: dict | None = None,
    ) -> None:
        """Append one completed turn to the Redis list."""
        turn = {
            "user":      (user_query or "").strip(),
            "assistant": (assistant_reply or "").strip(),
            "intent":    intent or "",
        }
        turns_key = CacheKeys.chat_turns(session_id)
        try:
            existing = self._cache.get(turns_key) or []
            existing.append(turn)
            if len(existing) > _MAX_TURNS:
                existing = existing[-_MAX_TURNS:]
            self._cache.set(turns_key, existing, _TTL)

            logger.info(_green(
                f"WRITE turns  session={session_id[:8]}  "
                f"total_turns={len(existing)}  intent={intent}\n"
                f"  user:      {turn['user']}\n"
                f"  assistant: {turn['assistant']}"
            ))
        except Exception:
            logger.exception("ChatMemoryCache.push_turn failed session=%s", session_id)

        if tool_results:
            self._push_tool_snapshot(session_id, tool_results)

    def _push_tool_snapshot(self, session_id: str, tool_results: dict) -> None:
        tools_key = CacheKeys.chat_tool_results(session_id)
        try:
            existing = self._cache.get(tools_key) or []
            compact = {
                k: v for k, v in tool_results.items()
                if isinstance(v, dict) and "error" not in v
            }
            if compact:
                existing.append(compact)
                if len(existing) > _TOOL_TURNS:
                    existing = existing[-_TOOL_TURNS:]
                self._cache.set(tools_key, existing, _TTL)

                tool_keys = list(compact.keys())
                logger.info(_green(
                    f"WRITE tools  session={session_id[:8]}  "
                    f"snapshots={len(existing)}  tools={tool_keys}"
                ))
        except Exception:
            logger.exception("ChatMemoryCache._push_tool_snapshot failed session=%s", session_id)

    # ── Read ─────────────────────────────────────────────────────────────────

    def get_turns(self, session_id: str, last_n: int = 8) -> list[dict]:
        """Return the last `last_n` turns as list of {user, assistant, intent}."""
        try:
            turns = self._cache.get(CacheKeys.chat_turns(session_id)) or []
            result = turns[-last_n:] if len(turns) > last_n else turns

            logger.info(_green(
                f"READ  turns  session={session_id[:8]}  "
                f"in_redis={len(turns)}  returning={len(result)}"
            ))
            for i, t in enumerate(result):
                logger.info(_green(
                    f"\n{'─'*60}\n"
                    f"  TURN [{i+1}/{len(result)}]  intent={t.get('intent','?')}\n"
                    f"  USER:      {t.get('user','')}\n"
                    f"  ASSISTANT: {t.get('assistant','')}\n"
                    f"{'─'*60}"
                ))
            return result
        except Exception:
            logger.exception("ChatMemoryCache.get_turns failed session=%s", session_id)
            return []

    def get_pinned_tool_results(self, session_id: str) -> dict:
        """Return merged tool results from the last _TOOL_TURNS turns."""
        try:
            snapshots = self._cache.get(CacheKeys.chat_tool_results(session_id)) or []
            merged: dict = {}
            for snapshot in snapshots:
                if isinstance(snapshot, dict):
                    merged.update(snapshot)

            logger.info(_green(
                f"READ  tools  session={session_id[:8]}  "
                f"snapshots={len(snapshots)}  merged_keys={list(merged.keys())}\n"
                f"{json.dumps(merged, indent=2, default=str)}"
            ))
            return merged
        except Exception:
            logger.exception("ChatMemoryCache.get_pinned_tool_results failed session=%s", session_id)
            return {}

    def build_history_messages(self, session_id: str, last_n: int = 8) -> list[dict]:
        """Return turns as flat [{role, content}] for the LLM message chain."""
        turns = self.get_turns(session_id, last_n=last_n)
        messages = []
        for t in turns:
            if t.get("user"):
                messages.append({"role": "user",      "content": t["user"]})
            if t.get("assistant"):
                messages.append({"role": "assistant", "content": t["assistant"]})
        return messages

    # ── Entity log ───────────────────────────────────────────────────────────

    def push_entity_entry(self, session_id: str, entry: dict) -> None:
        """Append one turn's entity extraction result to the entity log."""
        key = CacheKeys.chat_entity_log(session_id)
        try:
            existing = self._cache.get(key) or []
            existing.append(entry)
            if len(existing) > _MAX_TURNS:
                existing = existing[-_MAX_TURNS:]
            self._cache.set(key, existing, _TTL)
            logger.info(_green(
                f"WRITE entities  session={session_id[:8]}  "
                f"total={len(existing)}  entry={entry}"
            ))
        except Exception:
            logger.exception("ChatMemoryCache.push_entity_entry failed session=%s", session_id)

    def get_entity_log(self, session_id: str, last_n: int = 8) -> list[dict]:
        """Return the last N entity-log entries for this session."""
        key = CacheKeys.chat_entity_log(session_id)
        try:
            entries = self._cache.get(key) or []
            result = entries[-last_n:] if len(entries) > last_n else entries
            logger.info(_green(
                f"READ  entities  session={session_id[:8]}  "
                f"in_redis={len(entries)}  returning={len(result)}\n"
                + "\n".join(f"    [{i+1}] {e}" for i, e in enumerate(result))
            ))
            return result
        except Exception:
            logger.exception("ChatMemoryCache.get_entity_log failed session=%s", session_id)
            return []

    def invalidate(self, session_id: str) -> None:
        """Clear all memory for a session."""
        try:
            self._cache.delete(CacheKeys.chat_turns(session_id))
            self._cache.delete(CacheKeys.chat_tool_results(session_id))
            self._cache.delete(CacheKeys.chat_entity_log(session_id))
            logger.info(_green(f"INVALIDATE   session={session_id[:8]}"))
        except Exception:
            logger.exception("ChatMemoryCache.invalidate failed session=%s", session_id)
