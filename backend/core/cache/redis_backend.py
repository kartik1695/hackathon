import json
import logging
from typing import Any, Optional

from django.conf import settings

from .base import BaseCacheBackend

logger = logging.getLogger("hrms")


class RedisBackend(BaseCacheBackend):
    def __init__(self):
        try:
            import redis as redis_lib
        except ImportError as exc:
            logger.exception("Redis library not installed")
            raise exc

        self._client = redis_lib.from_url(getattr(settings, "REDIS_URL", "redis://localhost:6379/0"))

    def get(self, key: str) -> Optional[Any]:
        val = self._client.get(key)
        return json.loads(val) if val else None

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        self._client.setex(key, ttl_seconds, json.dumps(value))

    def delete(self, key: str) -> None:
        self._client.delete(key)

    def exists(self, key: str) -> bool:
        return bool(self._client.exists(key))
