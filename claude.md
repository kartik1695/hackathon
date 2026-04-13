# CLAUDE.md — HRMS-AI Project Build Instructions

> **READ THIS FILE COMPLETELY BEFORE WRITING A SINGLE LINE OF CODE.**
> This is the single source of truth. Every folder, model, pattern, and decision is here.
> Follow it exactly. Do not improvise. Do not skip phases. Do not add dependencies
> that are not listed here without a documented reason.

---

## 0. Identity, Product, and Core Principles

You are a **senior Django backend engineer and software architect**.
You build production-grade, extensible systems that other engineers can maintain and extend.
You apply SOLID principles and design patterns not as ceremony but because they reduce future pain.

**Product:** HRMS-AI — AI-powered Human Resource Management System.
**Serves:** Employee, Manager, HR/HRBP, CFO.
**Non-negotiable tech:**
- Backend: Python 3.12 + Django 5 + Django REST Framework
- Queue: RabbitMQ + Celery + Celery Beat
- AI: LangChain + LangGraph (multi-agent, multi-provider)
- Vector DB: pgvector (PostgreSQL extension)
- Cache: Redis
- Auth: JWT (djangorestframework-simplejwt)
- Frontend: React 18 + TypeScript + TailwindCSS
- Infra: Docker Compose (Postgres + Redis data persisted to named volumes)

**The four golden rules — repeat these to yourself before every architectural decision:**
1. **Django owns all writes. AI never touches the DB directly.**
2. **Every AI action is async via RabbitMQ + Celery. Never block HTTP.**
3. **MCP tools are the ONLY way the AI reads live data.**
4. **Code must be open for extension, closed for modification (Open/Closed Principle).**

---

## 1. SOLID Principles — Applied Concretely

These are not abstract. Every section below references them. Here is exactly what they mean
for this project.

### S — Single Responsibility Principle
Every class/module does exactly one thing:
- Views: validate input + delegate to service. Nothing else.
- Services: orchestrate business logic. Never touch HTTP request/response.
- Repositories: data access only. Never contain business rules.
- Agents: transform AgentState. Never write to DB.
- Tasks: coordinate service/agent calls. Never contain business logic inline.

```
# WRONG — view doing too much
class LeaveApplyView(APIView):
    def post(self, request):
        leave = LeaveRequest.objects.create(...)   # ← DB access in view
        balance = LeaveBalance.objects.get(...)    # ← business logic in view
        if balance.casual_remaining < days:        # ← validation in view
            ...

# RIGHT — view delegates everything
class LeaveApplyView(APIView):
    def post(self, request):
        serializer = LeaveApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = LeaveService(request.user.employee).apply(serializer.validated_data)
        return Response(result)
```

### O — Open/Closed Principle
Every extension point in the system must be addable without modifying existing code:
- Adding a new LLM provider: add a new class, register it. No existing code changes.
- Adding a new MCP tool: add a new function, register it. No existing code changes.
- Adding a new notification channel: add a new handler, register it. No existing code changes.
- Adding a new agent node: add a new node function, add an edge. No existing code changes.

### L — Liskov Substitution Principle
Implementations must be swappable through their interface:
- Any `BaseLLMProvider` subclass must be droppable in wherever `BaseLLMProvider` is used.
- Any `BaseCacheBackend` subclass must behave identically to any other.
- Any `BaseNotificationHandler` must be callable without the caller knowing the type.

### I — Interface Segregation Principle
Do not force classes to implement methods they don't need:
- `LeaveReadRepository` and `LeaveWriteRepository` are separate — agents only get read access.
- `NotificationHandler` is split: `EmailHandler`, `SlackHandler`, `InAppHandler` — each handles exactly what it supports.

### D — Dependency Inversion Principle
High-level modules depend on abstractions, not concretions:
- `LeaveService` depends on `LeaveRepositoryInterface`, not `LeaveRequest.objects`
- `BurnoutAgent` depends on `LLMProviderInterface`, not `ChatOpenAI` directly
- `ReviewTask` depends on `ReviewServiceInterface`, not ReviewCycle model directly

---

## 2. Design Patterns — Where Each One Is Used

**You must implement these patterns exactly as described. Do not skip them.**

### 2.1 Strategy Pattern — LLM Provider Selection

Used in: `core/llm/` — allows swapping between OpenAI, Anthropic, Gemini without changing agents.

```python
# core/llm/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List

@dataclass
class LLMMessage:
    role: str    # "system" | "user" | "assistant"
    content: str

@dataclass
class LLMResponse:
    content: str
    model: str
    provider: str
    tokens_used: int

class BaseLLMProvider(ABC):
    """Strategy interface — all LLM providers must implement this contract."""

    @abstractmethod
    def complete(self, messages: List[LLMMessage], temperature: float = 0.3) -> LLMResponse:
        """Generate a completion. Synchronous."""
        ...

    @abstractmethod
    def embed(self, text: str) -> List[float]:
        """Generate embeddings. Returns 1536-dim vector."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str: ...

    @property
    @abstractmethod
    def model_name(self) -> str: ...
```

```python
# core/llm/openai_provider.py
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from .base import BaseLLMProvider, LLMMessage, LLMResponse

class OpenAIProvider(BaseLLMProvider):
    def __init__(self, model: str = "gpt-4o", api_key: str = None):
        self._model = model
        self._client = ChatOpenAI(model=model, api_key=api_key)
        self._embedder = OpenAIEmbeddings(model="text-embedding-3-small", api_key=api_key)

    def complete(self, messages: List[LLMMessage], temperature: float = 0.3) -> LLMResponse:
        lc_messages = [{"role": m.role, "content": m.content} for m in messages]
        self._client.temperature = temperature
        response = self._client.invoke(lc_messages)
        return LLMResponse(
            content=response.content,
            model=self._model,
            provider="openai",
            tokens_used=response.usage_metadata.get("total_tokens", 0) if hasattr(response, "usage_metadata") else 0,
        )

    def embed(self, text: str) -> List[float]:
        return self._embedder.embed_query(text)

    @property
    def provider_name(self) -> str: return "openai"

    @property
    def model_name(self) -> str: return self._model
```

```python
# core/llm/anthropic_provider.py
from langchain_anthropic import ChatAnthropic
from langchain_openai import OpenAIEmbeddings  # Anthropic has no embedding model; use OpenAI
from .base import BaseLLMProvider, LLMMessage, LLMResponse

class AnthropicProvider(BaseLLMProvider):
    def __init__(self, model: str = "claude-sonnet-4-6", api_key: str = None,
                 openai_api_key: str = None):
        self._model = model
        self._client = ChatAnthropic(model=model, api_key=api_key)
        # Embeddings: Anthropic has no native embedding model — delegate to OpenAI
        self._embedder = OpenAIEmbeddings(model="text-embedding-3-small", api_key=openai_api_key)

    def complete(self, messages: List[LLMMessage], temperature: float = 0.3) -> LLMResponse:
        lc_messages = [{"role": m.role, "content": m.content} for m in messages]
        self._client.temperature = temperature
        response = self._client.invoke(lc_messages)
        return LLMResponse(
            content=response.content,
            model=self._model,
            provider="anthropic",
            tokens_used=response.usage_metadata.get("total_tokens", 0) if hasattr(response, "usage_metadata") else 0,
        )

    def embed(self, text: str) -> List[float]:
        return self._embedder.embed_query(text)

    @property
    def provider_name(self) -> str: return "anthropic"

    @property
    def model_name(self) -> str: return self._model
```

```python
# core/llm/gemini_provider.py  ← stub, implement in Phase 4 extension
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import OpenAIEmbeddings
from .base import BaseLLMProvider, LLMMessage, LLMResponse

class GeminiProvider(BaseLLMProvider):
    def __init__(self, model: str = "gemini-1.5-pro", api_key: str = None,
                 openai_api_key: str = None):
        self._model = model
        self._client = ChatGoogleGenerativeAI(model=model, google_api_key=api_key)
        self._embedder = OpenAIEmbeddings(model="text-embedding-3-small", api_key=openai_api_key)

    def complete(self, messages: List[LLMMessage], temperature: float = 0.3) -> LLMResponse:
        lc_messages = [{"role": m.role, "content": m.content} for m in messages]
        response = self._client.invoke(lc_messages)
        return LLMResponse(content=response.content, model=self._model, provider="gemini", tokens_used=0)

    def embed(self, text: str) -> List[float]:
        return self._embedder.embed_query(text)

    @property
    def provider_name(self) -> str: return "gemini"

    @property
    def model_name(self) -> str: return self._model
```

```python
# core/llm/factory.py  ← Factory Pattern for LLM provider instantiation
from decouple import config
from .base import BaseLLMProvider
from .openai_provider import OpenAIProvider
from .anthropic_provider import AnthropicProvider
from .gemini_provider import GeminiProvider

_REGISTRY: dict[str, type[BaseLLMProvider]] = {
    "openai":    OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini":    GeminiProvider,
}

class LLMProviderFactory:
    """
    Factory Pattern.
    Returns configured provider based on LLM_PROVIDER env var.
    To add a new provider: add to _REGISTRY. Nothing else changes.
    """

    @staticmethod
    def get_provider(provider_name: str | None = None) -> BaseLLMProvider:
        name = provider_name or config("LLM_PROVIDER", default="openai")
        if name not in _REGISTRY:
            raise ValueError(f"Unknown LLM provider '{name}'. "
                             f"Available: {list(_REGISTRY.keys())}")
        cls = _REGISTRY[name]
        kwargs = {
            "model":    config("LLM_MODEL", default="gpt-4o"),
            "api_key":  config(f"{name.upper()}_API_KEY", default=None),
        }
        if name != "openai":
            kwargs["openai_api_key"] = config("OPENAI_API_KEY", default=None)
        return cls(**{k: v for k, v in kwargs.items() if v is not None})

    @staticmethod
    def register(name: str, cls: type[BaseLLMProvider]) -> None:
        """Extension point — register a new provider without modifying factory."""
        _REGISTRY[name] = cls
```

### 2.2 Repository Pattern — Data Access Abstraction

Used in: Every service layer. Keeps business logic testable without a real database.

```python
# core/repositories/base.py
from abc import ABC, abstractmethod
from typing import TypeVar, Generic, Optional, List
T = TypeVar('T')

class BaseReadRepository(ABC, Generic[T]):
    @abstractmethod
    def get_by_id(self, id: int) -> Optional[T]: ...

    @abstractmethod
    def list(self, **filters) -> List[T]: ...

class BaseWriteRepository(ABC, Generic[T]):
    @abstractmethod
    def create(self, **kwargs) -> T: ...

    @abstractmethod
    def update(self, instance: T, **kwargs) -> T: ...

    @abstractmethod
    def delete(self, instance: T) -> None: ...
```

```python
# apps/leaves/repositories.py
from core.repositories.base import BaseReadRepository, BaseWriteRepository
from .models import LeaveRequest, LeaveBalance

class LeaveRequestReadRepository(BaseReadRepository[LeaveRequest]):
    def get_by_id(self, id: int) -> LeaveRequest | None:
        return LeaveRequest.objects.select_related('employee', 'approver').filter(pk=id).first()

    def list(self, **filters) -> list[LeaveRequest]:
        return list(LeaveRequest.objects.filter(**filters).select_related('employee'))

    def get_team_calendar(self, manager_id: int, from_date, to_date) -> list[LeaveRequest]:
        return list(LeaveRequest.objects.filter(
            employee__manager_id=manager_id,
            status='APPROVED',
            from_date__lte=to_date,
            to_date__gte=from_date,
        ).select_related('employee__user'))

class LeaveRequestWriteRepository(BaseWriteRepository[LeaveRequest]):
    def create(self, **kwargs) -> LeaveRequest:
        return LeaveRequest.objects.create(**kwargs)

    def update(self, instance: LeaveRequest, **kwargs) -> LeaveRequest:
        for key, value in kwargs.items():
            setattr(instance, key, value)
        instance.save(update_fields=list(kwargs.keys()) + ['updated_at'])
        return instance

    def delete(self, instance: LeaveRequest) -> None:
        instance.delete()
```

### 2.3 Service Layer Pattern — Business Logic Isolation

Used in: Every app. Views call services. Tasks call services. Agents never call services directly.

```python
# apps/leaves/services.py
import logging
from datetime import date
from .repositories import LeaveRequestReadRepository, LeaveRequestWriteRepository
from .models import LeaveBalance, LeaveRequest
from tasks.leave_tasks import process_leave_application

logger = logging.getLogger(__name__)

class LeaveService:
    """
    Single Responsibility: orchestrates leave business logic.
    Depends on repositories (not models directly) — DIP.
    """

    def __init__(
        self,
        employee,
        read_repo: LeaveRequestReadRepository | None = None,
        write_repo: LeaveRequestWriteRepository | None = None,
    ):
        self.employee = employee
        self.read_repo = read_repo or LeaveRequestReadRepository()
        self.write_repo = write_repo or LeaveRequestWriteRepository()

    def apply(self, validated_data: dict) -> LeaveRequest:
        self._validate_balance(validated_data['leave_type'], validated_data['days_count'])
        leave = self.write_repo.create(employee=self.employee, **validated_data)
        # Signal fires task — service does not know about Celery
        logger.info("Leave %s created for employee %s", leave.pk, self.employee.employee_id)
        return leave

    def approve(self, leave: LeaveRequest, approver) -> LeaveRequest:
        if leave.employee.manager_id != approver.id:
            raise PermissionError("You are not this employee's manager")
        leave = self.write_repo.update(leave, status='APPROVED', approver=approver)
        return leave

    def simulate(self, leave_type: str, days: int, target_month: int) -> dict:
        balance = LeaveBalance.objects.get(employee=self.employee)
        field_map = {'CL': 'casual_remaining', 'EL': 'earned_remaining', 'SL': 'sick_remaining'}
        accrual = {'CL': 0.83, 'EL': 1.25, 'SL': 0.83}
        current = float(getattr(balance, field_map.get(leave_type, 'casual_remaining'), 0))
        months_left = 12 - date.today().month
        projected = current + (accrual.get(leave_type, 0) * months_left) - days
        return {
            'leave_type': leave_type,
            'current_balance': current,
            'days_requested': days,
            'projected_year_end': round(projected, 2),
            'is_sufficient': projected >= 0,
        }

    def _validate_balance(self, leave_type: str, days: float) -> None:
        balance = LeaveBalance.objects.get(employee=self.employee)
        field_map = {'CL': 'casual_remaining', 'EL': 'earned_remaining', 'SL': 'sick_remaining'}
        remaining = float(getattr(balance, field_map.get(leave_type, 'casual_remaining'), 0))
        if remaining < days:
            raise ValueError(f"Insufficient {leave_type} balance. Available: {remaining}, Requested: {days}")
```

### 2.4 Observer Pattern — Django Signals as Event Bus

Used in: All `signals.py` files. Signals are the internal event bus between the service layer
and Celery. They are thin — they only call `.delay()`. Never put logic in signals.

```python
# apps/leaves/signals.py
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import LeaveRequest

logger = logging.getLogger(__name__)

@receiver(post_save, sender=LeaveRequest)
def on_leave_request_saved(sender, instance: LeaveRequest, created: bool, **kwargs):
    """Observer: reacts to LeaveRequest changes and fires async tasks."""
    if created and instance.status == 'PENDING':
        from tasks.leave_tasks import process_leave_application
        process_leave_application.delay(instance.pk)
        logger.debug("Queued process_leave_application for leave %s", instance.pk)

    elif not created and instance.status == 'APPROVED':
        from tasks.leave_tasks import process_leave_approval
        process_leave_approval.delay(instance.pk)
        logger.debug("Queued process_leave_approval for leave %s", instance.pk)
```

### 2.5 Factory Pattern — LLM + Notification + Cache

Already shown for LLM (Section 2.1). Apply the same pattern to notifications and cache:

```python
# core/notifications/base.py
from abc import ABC, abstractmethod

class BaseNotificationHandler(ABC):
    """Interface Segregation: each handler implements only what it supports."""

    @abstractmethod
    def send(self, recipient_email: str, subject: str, body: str, metadata: dict) -> bool:
        """Returns True on success, False on failure. Never raises."""
        ...

    @property
    @abstractmethod
    def channel_name(self) -> str: ...
```

```python
# core/notifications/handlers/email_handler.py
# core/notifications/handlers/slack_handler.py
# core/notifications/handlers/inapp_handler.py
# — implement each as a separate class implementing BaseNotificationHandler

# core/notifications/dispatcher.py
class NotificationDispatcher:
    """
    Open/Closed: add a new channel by registering a new handler.
    Existing dispatcher code never changes.
    """
    def __init__(self):
        self._handlers: list[BaseNotificationHandler] = []

    def register(self, handler: BaseNotificationHandler) -> None:
        self._handlers.append(handler)

    def dispatch(self, channels: list[str], recipient: str, subject: str,
                 body: str, metadata: dict = None) -> dict[str, bool]:
        results = {}
        for handler in self._handlers:
            if handler.channel_name in channels:
                results[handler.channel_name] = handler.send(
                    recipient, subject, body, metadata or {}
                )
        return results
```

### 2.6 Cache Abstraction — Open/Closed for Cache Backend

Do not scatter `redis.get()` / `redis.set()` across the codebase.
Use a cache service that can be swapped or extended.

```python
# core/cache/base.py
from abc import ABC, abstractmethod
from typing import Any, Optional

class BaseCacheBackend(ABC):
    @abstractmethod
    def get(self, key: str) -> Optional[Any]: ...

    @abstractmethod
    def set(self, key: str, value: Any, ttl_seconds: int) -> None: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...
```

```python
# core/cache/redis_backend.py
import json
import redis as redis_lib
from decouple import config
from .base import BaseCacheBackend

class RedisBackend(BaseCacheBackend):
    def __init__(self):
        self._client = redis_lib.from_url(config("REDIS_URL", default="redis://localhost:6379/0"))

    def get(self, key: str):
        val = self._client.get(key)
        return json.loads(val) if val else None

    def set(self, key: str, value, ttl_seconds: int) -> None:
        self._client.setex(key, ttl_seconds, json.dumps(value))

    def delete(self, key: str) -> None:
        self._client.delete(key)

    def exists(self, key: str) -> bool:
        return bool(self._client.exists(key))
```

```python
# core/cache/keys.py  — ALL Redis keys defined here. Never define keys inline elsewhere.
class CacheKeys:
    @staticmethod
    def burnout_score(employee_id: int) -> str:
        return f"burnout:{employee_id}"

    @staticmethod
    def rate_limit(user_id: int, endpoint: str) -> str:
        return f"rate:{user_id}:{endpoint}"

    @staticmethod
    def leave_forecast(dept_id: int, year_month: str) -> str:
        return f"forecast:{dept_id}:{year_month}"

    @staticmethod
    def headcount_snapshot(date_str: str) -> str:
        return f"headcount:{date_str}"

    @staticmethod
    def cfo_weekly_report(date_str: str) -> str:
        return f"cfo_report:{date_str}"
```

### 2.7 Template Method Pattern — Celery Task Base Class

Used in: All Celery tasks. Enforces consistent logging, error handling, and retry logic.

```python
# core/tasks/base.py
import logging
from celery import Task
from django.db import transaction

logger = logging.getLogger(__name__)

class BaseHRMSTask(Task):
    """
    Template Method: defines the skeleton algorithm for all tasks.
    Subclasses override execute() only — not run().
    """
    abstract = True
    max_retries = 3
    default_retry_delay = 60  # seconds

    def run(self, *args, **kwargs):
        task_name = self.__class__.__name__
        logger.info("[TASK START] %s | args=%s kwargs=%s", task_name, args, kwargs)
        try:
            result = self.execute(*args, **kwargs)
            logger.info("[TASK DONE] %s", task_name)
            return result
        except Exception as exc:
            logger.exception("[TASK FAILED] %s | error=%s", task_name, exc)
            raise self.retry(exc=exc)

    def execute(self, *args, **kwargs):
        raise NotImplementedError("Subclasses must implement execute()")
```

### 2.8 Decorator Pattern — API Rate Limiting + RBAC Check

```python
# core/decorators.py
import functools
from rest_framework.response import Response
from rest_framework import status
from core.cache.redis_backend import RedisBackend
from core.cache.keys import CacheKeys

_cache = RedisBackend()

def rate_limit(max_requests: int = 30, window_seconds: int = 60):
    """Decorator Pattern: wraps any view method with rate limiting logic."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(self, request, *args, **kwargs):
            key = CacheKeys.rate_limit(request.user.id, func.__name__)
            count = _cache.get(key) or 0
            if count >= max_requests:
                return Response(
                    {"error": "Rate limit exceeded", "code": "RATE_LIMIT_EXCEEDED"},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )
            _cache.set(key, count + 1, window_seconds)
            return func(self, request, *args, **kwargs)
        return wrapper
    return decorator
```

---

## 3. Project Structure (Create This Exactly)

```
hrms/
├── CLAUDE.md
├── README.md
├── docker-compose.yml               ← Docker services with NAMED VOLUMES
├── docker-compose.override.yml      ← local dev port overrides
├── docker-compose.local.yml         ← runs ONLY postgres+redis; Django runs natively
├── .env.example
├── .env                             ← never commit
├── .env.local                       ← for local (no-docker) dev
├── Makefile
│
├── backend/
│   ├── Dockerfile
│   ├── requirements/
│   │   ├── base.txt
│   │   ├── development.txt
│   │   └── production.txt
│   ├── manage.py
│   │
│   ├── config/
│   │   ├── __init__.py
│   │   ├── settings/
│   │   │   ├── __init__.py
│   │   │   ├── base.py
│   │   │   ├── development.py       ← DJANGO_SETTINGS_MODULE for full docker
│   │   │   ├── local.py             ← DJANGO_SETTINGS_MODULE for local (no docker)
│   │   │   └── production.py
│   │   ├── urls.py
│   │   ├── celery.py
│   │   └── asgi.py
│   │
│   ├── core/                        ← shared infrastructure (no business logic)
│   │   ├── __init__.py
│   │   ├── permissions.py           ← 4 RBAC permission classes
│   │   ├── pagination.py
│   │   ├── exceptions.py
│   │   ├── utils.py
│   │   ├── decorators.py            ← rate_limit + require_role decorators
│   │   ├── repositories/
│   │   │   ├── __init__.py
│   │   │   └── base.py              ← BaseReadRepository, BaseWriteRepository
│   │   ├── llm/
│   │   │   ├── __init__.py
│   │   │   ├── base.py              ← BaseLLMProvider, LLMMessage, LLMResponse
│   │   │   ├── factory.py           ← LLMProviderFactory
│   │   │   ├── openai_provider.py
│   │   │   ├── anthropic_provider.py
│   │   │   └── gemini_provider.py
│   │   ├── cache/
│   │   │   ├── __init__.py
│   │   │   ├── base.py              ← BaseCacheBackend
│   │   │   ├── redis_backend.py
│   │   │   └── keys.py              ← CacheKeys (all key strings defined here)
│   │   ├── notifications/
│   │   │   ├── __init__.py
│   │   │   ├── base.py              ← BaseNotificationHandler
│   │   │   ├── dispatcher.py        ← NotificationDispatcher
│   │   │   └── handlers/
│   │   │       ├── __init__.py
│   │   │       ├── email_handler.py
│   │   │       ├── slack_handler.py
│   │   │       └── inapp_handler.py
│   │   └── tasks/
│   │       ├── __init__.py
│   │       └── base.py              ← BaseHRMSTask (Template Method)
│   │
│   ├── apps/
│   │   ├── employees/
│   │   │   ├── models.py
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── services.py          ← EmployeeService
│   │   │   ├── repositories.py      ← EmployeeReadRepo, EmployeeWriteRepo
│   │   │   ├── urls.py
│   │   │   ├── permissions.py
│   │   │   ├── signals.py
│   │   │   └── tests/
│   │   │       ├── test_models.py
│   │   │       ├── test_services.py
│   │   │       └── test_api.py
│   │   │
│   │   ├── attendance/
│   │   │   ├── models.py
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── services.py          ← AttendanceService
│   │   │   ├── repositories.py
│   │   │   ├── urls.py
│   │   │   ├── signals.py
│   │   │   └── tests/
│   │   │
│   │   ├── leaves/
│   │   │   ├── models.py
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── services.py          ← LeaveService (shown in Section 2.3)
│   │   │   ├── repositories.py      ← (shown in Section 2.2)
│   │   │   ├── urls.py
│   │   │   ├── signals.py
│   │   │   └── tests/
│   │   │
│   │   ├── payroll/
│   │   │   ├── models.py
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── services.py
│   │   │   └── urls.py
│   │   │
│   │   ├── performance/
│   │   │   ├── models.py
│   │   │   ├── serializers.py
│   │   │   ├── views.py
│   │   │   ├── services.py          ← ReviewService
│   │   │   ├── repositories.py
│   │   │   └── urls.py
│   │   │
│   │   └── notifications/
│   │       ├── models.py
│   │       ├── tasks.py
│   │       └── channels.py          ← Django Channels consumers
│   │
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── state.py
│   │   ├── graph.py
│   │   ├── router.py
│   │   └── nodes/
│   │       ├── burnout.py
│   │       ├── spof.py
│   │       ├── conflict.py
│   │       ├── nl_query.py
│   │       ├── rag_retrieval.py
│   │       ├── mcp_tools.py
│   │       └── llm_generate.py
│   │
│   ├── mcp/
│   │   ├── __init__.py
│   │   ├── registry.py
│   │   ├── rbac.py
│   │   └── tools/
│   │       ├── leave_tools.py
│   │       ├── attendance_tools.py
│   │       ├── employee_tools.py
│   │       └── performance_tools.py
│   │
│   ├── tasks/
│   │   ├── leave_tasks.py
│   │   ├── burnout_tasks.py
│   │   ├── review_tasks.py
│   │   ├── forecast_tasks.py
│   │   └── notification_tasks.py
│   │
│   ├── rag/
│   │   ├── ingest.py
│   │   ├── retrieval.py
│   │   └── documents/
│   │       ├── leave_policy.txt
│   │       ├── attendance_rules.txt
│   │       ├── performance_rubric.txt
│   │       └── employee_handbook.txt
│   │
│   └── management/
│       └── commands/
│           ├── create_pgvector_extension.py
│           ├── ingest_rag_docs.py
│           └── seed_demo_data.py
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.js
    ├── vite.config.ts
    └── src/
        ├── api/
        ├── components/
        ├── pages/
        │   ├── employee/
        │   ├── manager/
        │   ├── hr/
        │   └── cfo/
        ├── stores/
        └── types/
```

---

## 4. Data Models (Implement Exactly — Same As Before)

*(Models are unchanged from original CLAUDE.md Section 2 — Employee, AttendanceLog,
AttendanceAnomaly, LeavePolicy, LeaveBalance, LeaveRequest, Goal, ReviewCycle,
BurnoutScore, RAGDocument. Implement all of them as specified.)*

Every model must:
- Have `__str__` returning a meaningful string
- Have `created_at = models.DateTimeField(auto_now_add=True)` unless stated otherwise
- Have `class Meta` with `ordering` defined
- Be registered in the app's `admin.py`

---

## 5. RBAC Permissions (core/permissions.py)

```python
from rest_framework.permissions import BasePermission

class IsEmployee(BasePermission):
    def has_permission(self, request, view):
        return hasattr(request.user, 'employee') and request.user.employee.is_active

class IsManager(BasePermission):
    def has_permission(self, request, view):
        return (hasattr(request.user, 'employee') and
                request.user.employee.role in ('manager', 'hr', 'cfo', 'admin'))

class IsHR(BasePermission):
    def has_permission(self, request, view):
        return (hasattr(request.user, 'employee') and
                request.user.employee.role in ('hr', 'admin'))

class IsCFO(BasePermission):
    def has_permission(self, request, view):
        return (hasattr(request.user, 'employee') and
                request.user.employee.role in ('cfo', 'hr', 'admin'))
```

---

## 6. API Endpoints (All Required)

*(Same as original CLAUDE.md Section 4 — auth, employees, attendance, leaves,
performance, ai, internal endpoints. Implement all of them.)*

---

## 7. LangGraph Agent (agents/)

### agents/state.py
```python
from typing import TypedDict, Optional, List

class AgentState(TypedDict):
    intent: str
    employee_id: int
    requester_id: int
    requester_role: str
    input_data: dict
    retrieved_docs: List[str]
    tool_results: dict
    llm_response: Optional[str]
    spof_flag: bool
    conflict_detected: bool
    conflict_summary: Optional[str]
    manager_context: Optional[str]
    burnout_score: Optional[float]
    burnout_signals: Optional[dict]
    error: Optional[str]
```

### agents/graph.py — exact routing
```
Entry: router_node
  ├─ "leave_application"  → spof_node → conflict_node → rag_node → mcp_node → llm_node → END
  ├─ "burnout_check"      → mcp_node → rag_node → llm_node → END
  ├─ "review_summary"     → mcp_node → rag_node → llm_node → END
  └─ "nl_query"           → mcp_node → llm_node → END
```

### agents/nodes/llm_generate.py — uses LLMProviderFactory (DIP)
```python
from core.llm.factory import LLMProviderFactory
from core.llm.base import LLMMessage
from agents.state import AgentState

def run(state: AgentState) -> AgentState:
    # DIP: depends on abstraction, not concrete LLM class
    provider = LLMProviderFactory.get_provider()
    messages = _build_messages(state)
    response = provider.complete(messages, temperature=0.3)
    state["llm_response"] = response.content
    state["manager_context"] = response.content
    return state

def _build_messages(state: AgentState) -> list[LLMMessage]:
    system = _get_system_prompt(state["intent"])
    human  = _build_human_context(state)
    return [LLMMessage(role="system", content=system), LLMMessage(role="user", content=human)]
```

### MCP Tools — RBAC enforced, no exceptions
*(Same 9 tools as original Section 6 — implement all. Each checks requester_role first.)*

---

## 8. Docker Compose — Data Persistence

**CRITICAL: All persistent data must survive `docker-compose down` and `docker-compose up`.**
Use **named volumes** for both PostgreSQL and Redis. Never use bind mounts for data.
Never use anonymous volumes. The volumes section must be at the bottom of docker-compose.yml.

```yaml
# docker-compose.yml
version: '3.9'

services:
  web:
    build: ./backend
    command: gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 4 --timeout 120
    volumes:
      - ./backend:/app                    # code mount for hot reload
      - media_files:/app/media            # uploaded files persist
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    env_file: .env
    restart: unless-stopped

  celery_worker_default:
    build: ./backend
    command: celery -A config worker -Q leave,notifications -c 4 --loglevel=info
    volumes:
      - ./backend:/app
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    env_file: .env
    restart: unless-stopped

  celery_worker_ai:
    build: ./backend
    command: celery -A config worker -Q ai_heavy,analytics -c 2 --loglevel=info
    volumes:
      - ./backend:/app
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    env_file: .env
    restart: unless-stopped

  celery_beat:
    build: ./backend
    command: celery -A config beat --scheduler django_celery_beat.schedulers:DatabaseScheduler --loglevel=info
    volumes:
      - ./backend:/app
    depends_on:
      postgres:
        condition: service_healthy
    env_file: .env
    restart: unless-stopped

  channels:
    build: ./backend
    command: daphne -b 0.0.0.0 -p 8001 config.asgi:application
    volumes:
      - ./backend:/app
    ports:
      - "8001:8001"
    depends_on:
      redis:
        condition: service_healthy
    env_file: .env
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: hrms
      POSTGRES_USER: hrms
      POSTGRES_PASSWORD: hrms_secret
    volumes:
      - pgdata:/var/lib/postgresql/data    # ← named volume, persists after docker-compose down
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hrms -d hrms"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: >
      redis-server
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --appendfilename appendonly.aof
      --appendfsync everysec
    volumes:
      - redis_data:/data                   # ← named volume, RDB + AOF both persist
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  rabbitmq:
    image: rabbitmq:3.13-management
    environment:
      RABBITMQ_DEFAULT_USER: hrms
      RABBITMQ_DEFAULT_PASS: hrms_secret
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq    # ← named volume, queued messages persist
    ports:
      - "5672:5672"
      - "15672:15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 15s
      timeout: 10s
      retries: 5
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      VITE_API_URL: http://localhost:8000
    depends_on:
      - web

# ── Named volumes — all data persists across docker-compose down/up ────────────
volumes:
  pgdata:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./data/postgres             # maps to ./data/postgres on host

  redis_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./data/redis                # maps to ./data/redis on host

  rabbitmq_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./data/rabbitmq             # maps to ./data/rabbitmq on host

  media_files:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./data/media                # uploaded files
```

**After writing docker-compose.yml, create the data directories:**
```bash
mkdir -p data/postgres data/redis data/rabbitmq data/media
echo "data/" >> .gitignore               # NEVER commit data directories
```

**Why bind-mount named volumes instead of pure named volumes:**
Pure Docker named volumes (`pgdata:`) vanish when you run `docker volume prune`.
Bind-mount volumes (`device: ./data/postgres`) store data on your host filesystem at `./data/`.
You can see it, back it up, and it survives any Docker cleanup command.

---

## 9. Local Development (Django Without Docker)

**The Django app must run locally without Docker. Only PostgreSQL and Redis run in Docker.**
This is critical for fast development iteration — no rebuilding containers to test code changes.

### 9.1 Local Docker Compose (only infrastructure)

```yaml
# docker-compose.local.yml
# Run with: docker-compose -f docker-compose.local.yml up -d
# This starts ONLY postgres, redis, and rabbitmq. Django runs natively.

version: '3.9'

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: hrms_local
      POSTGRES_USER: hrms
      POSTGRES_PASSWORD: hrms_secret
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hrms -d hrms_local"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --appendfsync everysec
    volumes:
      - ./data/redis:/data
    ports:
      - "6379:6379"

  rabbitmq:
    image: rabbitmq:3.13-management
    environment:
      RABBITMQ_DEFAULT_USER: hrms
      RABBITMQ_DEFAULT_PASS: hrms_secret
    volumes:
      - ./data/rabbitmq:/var/lib/rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"

volumes: {}
```

### 9.2 Local Environment File (.env.local)

```bash
# .env.local — used when Django runs natively (not in Docker)
DJANGO_SETTINGS_MODULE=config.settings.local
DJANGO_SECRET_KEY=local-dev-secret-not-for-production
DJANGO_DEBUG=True

# Point to localhost — Docker ports are exposed to host
DATABASE_URL=postgresql://hrms:hrms_secret@localhost:5432/hrms_local
REDIS_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/1
RABBITMQ_URL=amqp://hrms:hrms_secret@localhost:5672//

# AI keys — same as docker .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
EMBEDDING_MODEL=text-embedding-3-small

INTERNAL_API_TOKEN=local-internal-token
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=60
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7
```

### 9.3 Local Settings (config/settings/local.py)

```python
from .base import *

DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0']

# No whitenoise needed locally — Django serves static files in DEBUG mode
INSTALLED_APPS += ['debug_toolbar']
MIDDLEWARE = ['debug_toolbar.middleware.DebugToolbarMiddleware'] + MIDDLEWARE
INTERNAL_IPS = ['127.0.0.1']

# Looser CORS for local frontend dev
CORS_ALLOW_ALL_ORIGINS = True

# Log SQL queries to console during local dev
LOGGING = {
    'version': 1,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'loggers': {
        'django.db.backends': {'handlers': ['console'], 'level': 'DEBUG', 'propagate': False},
        'hrms': {'handlers': ['console'], 'level': 'DEBUG'},
    },
}
```

### 9.4 Makefile — Both Modes Supported

```makefile
# Makefile

# ── Docker (full stack) ─────────────────────────────────────────────────────
build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f web

celery-logs:
	docker-compose logs -f celery_worker_default celery_worker_ai

beat-logs:
	docker-compose logs -f celery_beat

migrate-docker:
	docker-compose exec web python manage.py migrate

shell-docker:
	docker-compose exec web python manage.py shell

seed-docker:
	docker-compose exec web python manage.py seed_demo_data

ingest-docker:
	docker-compose exec web python manage.py ingest_rag_docs

test-docker:
	docker-compose exec web pytest

# ── Local dev (only infra in Docker, Django native) ─────────────────────────
infra-up:
	docker-compose -f docker-compose.local.yml up -d

infra-down:
	docker-compose -f docker-compose.local.yml down

install:
	cd backend && pip install -r requirements/development.txt

migrate:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local python manage.py migrate

run:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local python manage.py runserver 0.0.0.0:8000

worker:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local celery -A config worker -Q leave,notifications,ai_heavy,analytics -c 4 --loglevel=info

beat:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local celery -A config beat --loglevel=info

shell:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local python manage.py shell

test:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local pytest

seed:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local python manage.py seed_demo_data

ingest:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local python manage.py ingest_rag_docs

# ── Shared ───────────────────────────────────────────────────────────────────
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true
	find . -name "*.pyc" -delete 2>/dev/null; true

pgvector:
	cd backend && DJANGO_SETTINGS_MODULE=config.settings.local python manage.py create_pgvector_extension

.PHONY: build up down logs migrate run worker beat shell test seed ingest clean \
        infra-up infra-down install pgvector celery-logs beat-logs
```

### 9.5 Local Setup Instructions (for README.md)

When writing README.md, include this exact local setup flow:

```bash
# 1. Clone and enter the project
git clone <repo> && cd hrms

# 2. Create data directories (host-mounted volumes)
mkdir -p data/postgres data/redis data/rabbitmq data/media
echo "data/" >> .gitignore

# 3. Copy and fill in environment files
cp .env.example .env
cp .env.example .env.local
# Edit .env.local: set DJANGO_SETTINGS_MODULE=config.settings.local
# Edit .env.local: set DATABASE_URL to use localhost:5432
# Edit both: set OPENAI_API_KEY and ANTHROPIC_API_KEY

# 4. Start infrastructure (postgres, redis, rabbitmq) in Docker
make infra-up

# 5. Install Python dependencies locally
make install

# 6. Enable pgvector extension
make pgvector

# 7. Run migrations
make migrate

# 8. Ingest RAG documents
make ingest

# 9. Seed demo data
make seed

# 10. Run Django (terminal 1)
make run

# 11. Run Celery worker (terminal 2)
make worker

# 12. Run Celery beat (terminal 3)
make beat

# 13. Open http://localhost:8000/api/docs/ — Swagger UI
```

---

## 10. Environment Variables (.env.example)

```bash
# Django
DJANGO_SECRET_KEY=change-me-in-production
DJANGO_DEBUG=True
DJANGO_SETTINGS_MODULE=config.settings.development
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

# Database — change host to 'localhost' in .env.local
DATABASE_URL=postgresql://hrms:hrms_secret@postgres:5432/hrms

# Redis — change host to 'localhost' in .env.local
REDIS_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1

# RabbitMQ — change host to 'localhost' in .env.local
RABBITMQ_URL=amqp://hrms:hrms_secret@rabbitmq:5672//

# AI — multi-provider support
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...              # optional, for Gemini
LLM_PROVIDER=openai                 # openai | anthropic | gemini
LLM_MODEL=gpt-4o
EMBEDDING_MODEL=text-embedding-3-small

# JWT
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=60
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7

# Internal service auth (for /api/internal/ endpoints)
INTERNAL_API_TOKEN=change-this-in-production

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=noreply@yourcompany.com
EMAIL_HOST_PASSWORD=app-password

# Slack (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

---



## 13. Build Phases

**Complete each phase fully before moving to the next.**

---

### PHASE 1 — Foundation

**Goal: Docker + local dev both work. Models migrated. Auth working. No business logic yet.**

- [ ] Create all directories including `data/postgres`, `data/redis`, `data/rabbitmq`, `data/media`
- [ ] Add `data/` to `.gitignore`
- [ ] Write `docker-compose.yml` exactly as in Section 8 (with named bind-mount volumes)
- [ ] Write `docker-compose.local.yml` exactly as in Section 9.1
- [ ] Write `.env.example` and `.env.local` as in Sections 10 and 9.2
- [ ] Write `Makefile` exactly as in Section 9.4
- [ ] Write `requirements/base.txt` and `requirements/development.txt` as in Section 11
- [ ] Write backend Dockerfile (Python 3.12-slim, non-root user, installs requirements)
- [ ] Write `config/settings/base.py` — database via DATABASE_URL, celery, redis, cors, jwt, staticfiles
- [ ] Write `config/settings/development.py` — extends base, debug=True
- [ ] Write `config/settings/local.py` — extends base, adds debug_toolbar, SQL logging
- [ ] Write `config/celery.py` — task routes, beat schedule, autodiscover
- [ ] Write `config/urls.py` — all app urls + swagger
- [ ] Implement `core/llm/` — all 4 files: base, factory, openai_provider, anthropic_provider
- [ ] Implement `core/cache/` — base, redis_backend, keys
- [ ] Implement `core/repositories/base.py`
- [ ] Implement `core/notifications/` — base, dispatcher, 3 handlers
- [ ] Implement `core/tasks/base.py` — BaseHRMSTask with Template Method
- [ ] Implement `core/permissions.py` — 4 RBAC classes
- [ ] Implement `core/decorators.py` — rate_limit decorator
- [ ] Implement ALL models from Section 4 (original Section 2)
- [ ] Create management command `create_pgvector_extension`
- [ ] Run migrations both ways: `make migrate` (local) and `make migrate-docker` (docker)
- [ ] **Verification (local):** `make infra-up && make migrate && make run` → Django starts, /admin/ works
- [ ] **Verification (docker):** `make up` → all containers healthy, no errors in logs

---

### PHASE 2 — Core API

**Goal: All REST endpoints. RBAC enforced. Service layer used. No AI.**

- [ ] Implement `apps/leaves/repositories.py` — read + write repos as in Section 2.2
- [ ] Implement `apps/leaves/services.py` — LeaveService as in Section 2.3
- [ ] Implement `apps/leaves/signals.py` — Observer as in Section 2.4
- [ ] Repeat repository + service + signal pattern for: employees, attendance, performance
- [ ] Views call services only — never ORM directly in views
- [ ] Implement all endpoints from Section 6 (original Section 4)
- [ ] Implement auth endpoints using simplejwt
- [ ] Implement leave balance simulation in LeaveService
- [ ] Write factory-based NotificationDispatcher registration in `config/apps.py` or `notifications/apps.py`
- [ ] Write tests for: LeaveService (unit, no DB), Employee API (integration), Attendance check-in
- [ ] Configure drf-spectacular at /api/docs/
- [ ] **Verification:** All endpoints return correct codes. Wrong role → 403. Swagger complete.

---

### PHASE 3 — Async Workers + Events

**Goal: RabbitMQ/Celery pipeline working. Events flow. Stubs acceptable for AI calls.**

- [ ] Implement all tasks as `BaseHRMSTask` subclasses
- [ ] Implement Redis caching in tasks using `RedisBackend` and `CacheKeys`
- [ ] Configure Celery Beat schedule — exact schedule from original Section 5
- [ ] Implement `notifications/models.py` for in-app notifications
- [ ] Implement `NotificationDispatcher` and register all 3 handlers
- [ ] **Verification:** `make worker` + apply leave → worker logs processing. Redis has burnout keys.

---

### PHASE 4 — AI Layer

**Goal: LangGraph agents + MCP + RAG producing real output via LLMProviderFactory.**

- [ ] Write all 4 RAG policy documents in `rag/documents/`
- [ ] Implement `rag/ingest.py` — chunks, embeds via `LLMProviderFactory.get_provider().embed()`, stores
- [ ] Implement `rag/retrieval.py` — pgvector cosine search
- [ ] Implement `agents/state.py` as in Section 7
- [ ] Implement ALL agent nodes — each is a pure function `(state) -> state`
- [ ] All nodes that call LLM use `LLMProviderFactory.get_provider()` — never `ChatOpenAI()` directly
- [ ] Implement `agents/graph.py` with exact routing from Section 7
- [ ] Implement all 9 MCP tools with RBAC from original Section 6
- [ ] Wire agents into Celery tasks — replace stubs
- [ ] Implement `/api/ai/query/` synchronous endpoint
- [ ] `make ingest` — runs ingest_rag_docs management command
- [ ] **Test multi-provider:** Set `LLM_PROVIDER=anthropic` → same agents produce output. Set back to `openai`. Both should work without any agent code changes.
- [ ] **Verification:** Leave applied → ai_context_card populated. Review opened → ai_draft populated. NL query → structured answer.

---

### PHASE 5 — Frontend

**Goal: Working React UI for all 4 roles.**

- [ ] Scaffold React 18 + TypeScript + Vite + TailwindCSS
- [ ] Axios with JWT interceptor (auto-refresh on 401)
- [ ] React Router with role-based route guards
- [ ] Zustand stores: authStore, employeeStore, leaveStore, notificationStore
- [ ] All 4 role dashboards with role-specific views
- [ ] AI Chat Panel — calls `/api/ai/query/`, displays structured answer
- [ ] Leave Calendar, Burnout Heatmap (recharts)
- [ ] WebSocket notification bell via Django Channels

---

### PHASE 6 — Demo Prep

**Goal: Seed data. All 5 demo scenarios work end-to-end.**

- [ ] `management/commands/seed_demo_data.py` — creates 1 HR, 2 Managers, 6 Employees, 1 CFO, 90 days attendance, leaves in various states, 2 open reviews, 1 SPOF employee with CRITICAL burnout
- [ ] Run both `make seed` (local) and `make seed-docker` (docker) — both must work
- [ ] Demo scenario A: Employee applies leave → manager gets AI context card
- [ ] Demo scenario B: HR burnout dashboard → CRITICAL employee visible
- [ ] Demo scenario C: Manager opens review → AI draft ready
- [ ] Demo scenario D: HR NL query → ranked at-risk list
- [ ] Demo scenario E: CFO dashboard → headcount + forecast
- [ ] Final verification: run all 5 scenarios. Zero 500 errors.

---

## 14. Coding Standards (Non-Negotiable)

1. **SRP in every file** — if a file is doing two things, split it
2. **DIP everywhere** — depend on abstractions; concrete classes only in factories and registrations
3. **No ORM in views** — views → services → repositories → ORM
4. **No `ChatOpenAI()` in agent nodes** — always `LLMProviderFactory.get_provider()`
5. **No Redis keys inline** — always via `CacheKeys.*` methods
6. **No `except Exception` without logging** — always `logger.exception("context")`
7. **Never call AI synchronously in a view** — always `.delay()` (NL query exception)
8. **Every Celery task is idempotent** — safe to call twice with the same args
9. **Every model has `__str__`** — no exceptions
10. **Every API returns consistent error format:**
    ```json
    {"error": "human readable message", "code": "SNAKE_CASE_CODE", "details": {}}
    ```
11. **Signals only call `.delay()`** — never contain business logic
12. **MCP tools return `{"error": "..."}` on failure** — never raise exceptions
13. **All env vars via `python-decouple`** — never `os.environ.get`
14. **Open/Closed at every extension point** — adding a feature must never require modifying existing working code

---

## 15. What Claude Must Do When Reading This File

1. Read this entire file before writing any code.
2. Start with Phase 1. Build `core/` infrastructure first — it is the foundation for everything else.
3. Implement the Strategy Pattern for LLM providers in Phase 1 — it is used in Phase 4.
4. Create `data/` directories and `.gitignore` them immediately.
5. Test BOTH `make run` (local) and `make up` (docker) in Phase 1 before proceeding.
6. Every new service class must inject its repositories — never instantiate ORM inside the service.
7. Every new task must subclass `BaseHRMSTask` and override `execute()`, not `run()`.
8. Before Phase 4, change `LLM_PROVIDER` to `anthropic` in `.env` and verify the factory returns an Anthropic provider. This validates the Strategy Pattern is working.
9. The `/api/ai/query/` endpoint is the one synchronous AI call. All other AI calls use Celery.
10. After Phase 6 seed, the burnout dashboard must show at least one CRITICAL employee. Adjust seed data signals if needed.

---

## 16. Quick Reference — All Decisions and Why

| Decision | Pattern Used | Why |
|----------|-------------|-----|
| `BaseLLMProvider` + `LLMProviderFactory` | Strategy + Factory | Swap OpenAI/Anthropic/Gemini with zero agent code changes. OCP. |
| `BaseReadRepository` / `BaseWriteRepository` | Repository + ISP | Agents get read-only repos. Services get write repos. Testable without DB. |
| `LeaveService`, `ReviewService` etc. | Service Layer + SRP | Views stay thin. Business logic is testable in isolation. |
| `BaseHRMSTask` | Template Method | All tasks get logging, retry, error handling for free. |
| `NotificationDispatcher` + handlers | Strategy + OCP | Add Slack/Teams/SMS without changing dispatcher. |
| `BaseCacheBackend` + `RedisBackend` | Strategy | Cache backend swappable. `CacheKeys` centralises all key strings. |
| Django signals → `.delay()` only | Observer | Loose coupling between domain events and async processing. |
| Bind-mount named volumes | Docker best practice | Data survives `docker volume prune`. Visible on host for backup. |
| `docker-compose.local.yml` | Dev experience | Fast iteration without container rebuilds. Django hot reload native. |
| `config/settings/local.py` | Settings split | Different DB host, SQL logging, relaxed CORS for local dev. |
| RabbitMQ over Redis queue | Reliability | Persistent messages, DLQ, per-queue routing. Data survives restart. |
| pgvector over external vector DB | Simplicity | One DB. No extra service. `data/postgres` survives `docker-compose down`. |

---

*End of CLAUDE.md — Begin with Phase 1. Build `core/` first.*
