import functools
import logging

from rest_framework import status
from rest_framework.response import Response

from core.cache.keys import CacheKeys
from core.cache.redis_backend import RedisBackend

logger = logging.getLogger("hrms")
_cache = RedisBackend()


def rate_limit(max_requests: int = 30, window_seconds: int = 60):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(self, request, *args, **kwargs):
            key = CacheKeys.rate_limit(request.user.id, func.__name__)
            count = _cache.get(key) or 0
            if count >= max_requests:
                logger.info("Rate limit exceeded user_id=%s endpoint=%s", request.user.id, func.__name__)
                return Response(
                    {"error": "Rate limit exceeded", "code": "RATE_LIMIT_EXCEEDED", "details": {}},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            _cache.set(key, count + 1, window_seconds)
            return func(self, request, *args, **kwargs)

        return wrapper

    return decorator


def require_role(allowed_roles: list[str]):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(self, request, *args, **kwargs):
            role = getattr(getattr(request.user, "employee", None), "role", None)
            if role not in allowed_roles:
                logger.info("RBAC denied user_id=%s role=%s allowed=%s", request.user.id, role, allowed_roles)
                return Response(
                    {"error": "Forbidden", "code": "FORBIDDEN", "details": {"allowed_roles": allowed_roles}},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return func(self, request, *args, **kwargs)

        return wrapper

    return decorator
