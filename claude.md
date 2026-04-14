# CLAUDE.md — HRMS-AI

> Read fully before writing code. Follow exactly. No improvising.

---

## 0. Identity & Stack

Senior Django backend engineer building HRMS-AI (AI-powered HR system) for Employee/Manager/HR/CFO roles.

**Stack:** Python 3.12 + Django 5 + DRF | RabbitMQ + Celery + Beat | LangChain + LangGraph | pgvector | Redis | JWT | React 18 + TS + Tailwind | Docker Compose

**Four golden rules:**
1. Django owns all writes. AI never touches DB directly.
2. Every AI action is async via RabbitMQ + Celery. Never block HTTP.
3. MCP tools are the ONLY way AI reads live data.
4. Open for extension, closed for modification (OCP).

---

## 1. Architecture Patterns

| Pattern | Where Used | Purpose |
|---------|-----------|---------|
| Strategy | `core/llm/` — `BaseLLMProvider` + `LLMProviderFactory` | Swap OpenAI/Anthropic/Gemini with zero agent changes |
| Repository | Every app — `BaseReadRepository` / `BaseWriteRepository` | Agents get read-only repos; services get write repos |
| Service Layer | Every app — `XxxService` | Views stay thin; business logic testable |
| Template Method | `core/tasks/base.py` — `BaseHRMSTask` | All tasks get logging + retry for free |
| Observer | `apps/*/signals.py` — Django signals → `.delay()` only | Loose coupling between domain events and async |
| Factory | `LLMProviderFactory`, `NotificationDispatcher` | Extension without modification |
| Decorator | `core/decorators.py` — `@rate_limit` | Wraps views cleanly |

**Flow:** View → Service → Repository → ORM. Never skip layers.

---

## 2. Project Structure

```
backend/
├── config/settings/{base,development,local,production}.py
├── config/{celery,urls,asgi}.py
├── core/
│   ├── llm/{base,factory,openai_provider,anthropic_provider,gemini_provider}.py
│   ├── cache/{base,redis_backend,keys}.py      # ALL redis keys in keys.py
│   ├── repositories/base.py
│   ├── notifications/{base,dispatcher,handlers/}.py
│   ├── tasks/base.py                            # BaseHRMSTask
│   ├── permissions.py                           # IsEmployee/IsManager/IsHR/IsCFO
│   └── decorators.py
├── apps/{employees,attendance,leaves,payroll,performance,notifications}/
│   └── {models,serializers,views,services,repositories,signals,urls}.py
├── agents/{state,graph,router}.py
│   └── nodes/{burnout,spof,conflict,nl_query,rag_retrieval,mcp_tools,llm_generate}.py
├── mcp/{registry,rbac}.py + tools/{leave,attendance,employee,performance}_tools.py
├── tasks/{leave,burnout,review,forecast,notification}_tasks.py
├── rag/{ingest,retrieval}.py + documents/*.txt
└── management/commands/{create_pgvector_extension,ingest_rag_docs,seed_demo_data}.py
```

---

## 3. Key Implementations

### LLM Provider (Strategy + Factory)
```python
# core/llm/base.py
class BaseLLMProvider(ABC):
    @abstractmethod
    def complete(self, messages: List[LLMMessage], temperature=0.3) -> LLMResponse: ...
    @abstractmethod
    def embed(self, text: str) -> List[float]: ...

# core/llm/factory.py
class LLMProviderFactory:
    _REGISTRY = {"openai": OpenAIProvider, "anthropic": AnthropicProvider, "gemini": GeminiProvider}

    @staticmethod
    def get_provider(name=None) -> BaseLLMProvider:
        name = name or config("LLM_PROVIDER", default="openai")
        return _REGISTRY[name](model=config("LLM_MODEL"), api_key=config(f"{name.upper()}_API_KEY"))

    @staticmethod
    def register(name, cls): _REGISTRY[name] = cls  # extension point
```

### Service Layer
```python
class LeaveService:
    def __init__(self, employee, read_repo=None, write_repo=None):
        self.read_repo = read_repo or LeaveRequestReadRepository()
        self.write_repo = write_repo or LeaveRequestWriteRepository()

    def apply(self, validated_data): ...    # validates balance, creates, signals fire task
    def approve(self, leave, approver): ... # checks manager relationship
    def simulate(self, leave_type, days, target_month) -> dict: ...
```

### Celery Task Base
```python
class BaseHRMSTask(Task):
    abstract = True; max_retries = 3; default_retry_delay = 60

    def run(self, *args, **kwargs):
        try:
            return self.execute(*args, **kwargs)
        except Exception as exc:
            logger.exception("[TASK FAILED] %s", exc); raise self.retry(exc=exc)

    def execute(self, *args, **kwargs): raise NotImplementedError
```

### RBAC Permissions
```python
class IsEmployee(BasePermission):
    def has_permission(self, r, v): return hasattr(r.user, 'employee') and r.user.employee.is_active

class IsManager(BasePermission):
    def has_permission(self, r, v): return r.user.employee.role in ('manager','hr','cfo','admin')

class IsHR(BasePermission):
    def has_permission(self, r, v): return r.user.employee.role in ('hr','admin')

class IsCFO(BasePermission):
    def has_permission(self, r, v): return r.user.employee.role in ('cfo','hr','admin')
```

---

## 4. LangGraph Agent

### State (agents/state.py)
```python
class AgentState(TypedDict):
    intent: str; employee_id: int; requester_id: int; requester_role: str
    input_data: dict; retrieved_docs: List[str]; tool_results: dict
    llm_response: Optional[str]; spof_flag: bool; conflict_detected: bool
    conflict_summary: Optional[str]; manager_context: Optional[str]
    burnout_score: Optional[float]; burnout_signals: Optional[dict]; error: Optional[str]
```

### Graph Routing
```
router_node:
  "leave_application" → spof → conflict → rag → mcp → llm → END
  "burnout_check"     → mcp → rag → llm → END
  "review_summary"    → mcp → rag → llm → END
  "nl_query"          → mcp → llm → END
```

### LLM Node (always use factory, never ChatOpenAI directly)
```python
def run(state: AgentState) -> AgentState:
    provider = LLMProviderFactory.get_provider()   # DIP — not ChatOpenAI()
    response = provider.complete(_build_messages(state))
    state["llm_response"] = response.content
    return state
```

---

## 5. Docker & Data Persistence

- Named bind-mount volumes for postgres/redis/rabbitmq → data survives `docker volume prune`
- `docker-compose.yml` — full stack (web + celery + beat + channels + postgres + redis + rabbitmq + frontend)
- `docker-compose.local.yml` — infra only (postgres + redis + rabbitmq); Django runs natively
- Data dirs: `mkdir -p data/{postgres,redis,rabbitmq,media}` → add `data/` to `.gitignore`

---

## 6. Settings Split

| File | Used When |
|------|-----------|
| `config/settings/base.py` | Common — DB via DATABASE_URL, celery, jwt, cors |
| `config/settings/development.py` | Full Docker stack |
| `config/settings/local.py` | Native Django, adds debug_toolbar + SQL logging, CORS_ALLOW_ALL_ORIGINS |

---

## 7. Build Phases

**Complete each fully before the next.**

| Phase | Goal | Done When |
|-------|------|-----------|
| 1 | Foundation — Docker + models + auth | `make run` and `make up` both work |
| 2 | Core API — all endpoints, RBAC, services | All endpoints correct status codes |
| 3 | Async — Celery pipeline, Redis caching, signals | Worker logs show task processing |
| 4 | AI — LangGraph + MCP + RAG | Multi-provider swap works; leave → ai_context_card |
| 5 | Frontend — React 18 + TS + Tailwind, 4 role dashboards | All role UIs functional |
| 6 | Demo — seed data, 5 scenarios end-to-end | Zero 500 errors across all scenarios |

---

## 8. Coding Standards (Non-Negotiable)

1. **No ORM in views** — views → services → repositories → ORM
2. **No `ChatOpenAI()` in agent nodes** — always `LLMProviderFactory.get_provider()`
3. **No Redis keys inline** — always via `CacheKeys.*`
4. **Signals only call `.delay()`** — never contain business logic
5. **MCP tools return `{"error": "..."}` on failure** — never raise
6. **Every task is idempotent** — safe to call twice
7. **Every model has `__str__`**
8. **All env vars via `python-decouple`** — never `os.environ.get`
9. **Consistent error format:** `{"error": "...", "code": "SNAKE_CASE", "details": {}}`
10. **No `except Exception` without `logger.exception(...)`**
11. **`/api/ai/query/` is the only synchronous AI call** — all others via `.delay()`
12. **Phase 4 test:** set `LLM_PROVIDER=anthropic` → agents must work unchanged

---

## 9. Key Env Vars (.env.example)

```bash
DJANGO_SETTINGS_MODULE=config.settings.development
DATABASE_URL=postgresql://hrms:hrms_secret@postgres:5432/hrms
REDIS_URL=redis://redis:6379/0
RABBITMQ_URL=amqp://hrms:hrms_secret@rabbitmq:5672//
LLM_PROVIDER=openai          # openai | anthropic | gemini
LLM_MODEL=gpt-4o
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=60
INTERNAL_API_TOKEN=change-this
```

Local dev (`.env.local`): change hosts to `localhost`, set `DJANGO_SETTINGS_MODULE=config.settings.local`.

---

*Start with Phase 1. Build `core/` first — it is the foundation for everything.*

---

## 10. Lessons Learned

### Chat Memory & Hallucination
- **Failed:** Raw `chat_history` alone + current query in one blob → LLM invents referents for pronouns.
- **Fixed:** Strategy B (Redis turn cache at `chat:turns:{session_id}`) + Strategy D (tool result pinning at `chat:tools:{session_id}`). In `_build_messages`, inject history turns first, then `[CONTEXT]` blob, then current query as plain text — pronouns resolve against history, not JSON.

### Tool Result Split Bug
- **Failed:** Splitting current vs prior tools by key-intersection — if `get_direct_reports` was pinned (Turn 1, Kartik) and re-called (Turn 2, Abhishek), the fresh result was excluded and stale one sent to LLM.
- **Fixed:** `mcp_tools.py` stamps `state["_tools_called_this_turn"]`. `_build_human_context` uses that set: `current = k in tools_called_this_turn`, `prior = pinned keys NOT in that set`. One version per tool, always freshest.

### Pronoun Resolution
- **Failed:** Scanning `tool_results` heuristically ("pick highest manager_chain level") broke on multi-hop queries and when tools weren't re-called.
- **Fixed:** After each turn, `extract_turn_entities.delay()` (Celery, async) runs a small LLM call to extract `focus_employee_id` + entities, stored at `chat:entities:{session_id}`. `_resolve_pronoun_employee_id()` checks entity log first (most recent `focus_employee_id`), then falls back to tool_results heuristics.

### Things That Were Rejected — Do Not Re-introduce
- **Fast LLM provider** (`get_fast_provider()`): use only `LLMProviderFactory.get_provider()` everywhere.
- **New env variables** for model tuning: only change values of existing vars.
- **Redis as Celery broker**: RabbitMQ is the only broker.

### Operational Rules
- Every `.delay()` in a service must be wrapped in `try/except` — broker errors must never cause HTTP 500s.
- Docker restart loop: placeholder `DJANGO_SECRET_KEY` is rejected at startup — always use a real key.
- Homebrew RabbitMQ on `localhost:5672` conflicts with Docker's — run `brew services stop rabbitmq` for local dev.
- Router was 10.4s because embed ran on every request — move keyword matching before embed calls.
- All Redis keys via `CacheKeys.*`. Debug memory logs use ANSI green `\033[32m` with `[MEMORY]` prefix.
