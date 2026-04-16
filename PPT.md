# Human Edge (HRMS-AI) — Presentation Notes
> Source material for slides. Problems, LLD, and live examples.

---

## SLIDE A — Problems We Faced & How We Fixed Them

### Problem 1: AI Lost Context Mid-Conversation (Pronoun Confusion)

**What broke:**
User asked: *"What is Kartik's leave balance?"*
Then followed up: *"Can you approve it for him?"*
The AI had no idea who "him" referred to — it hallucinated or picked a random employee.

**Root cause:**
Raw conversation history was passed as one blob. LLM received the current query in isolation, with no structured record of who was discussed in prior turns.

**Fix applied:**
- Every conversation turn stored in Redis at key `chat:turns:{session_id}`
- After each LLM reply, a Celery task (`extract_turn_entities`) runs async and extracts:
  - `focus_employee_id` — the person being discussed
  - key entities: dates, leave types, amounts
- Stored at `chat:entities:{session_id}`
- `_resolve_pronoun_employee_id()` checks this entity log first, then falls back to tool result heuristics
- Result: "him", "her", "they", "his leave" all resolve correctly across turns

---

### Problem 2: Stale Tool Results Leaked Into New Answers

**What broke:**
Turn 1: Manager asked about Kartik → `get_direct_reports` ran, results pinned in Redis.
Turn 2: Manager asked about Abhishek → same tool ran again, but the *old* Kartik result was sent to the LLM because the split logic used key-intersection.
LLM gave Kartik's data as Abhishek's answer.

**Root cause:**
Tool result split logic used key intersection: "if the key is already pinned, it's 'prior'". This failed when the same tool was called for a different subject.

**Fix applied:**
- `mcp_tools.py` stamps `state["_tools_called_this_turn"]` — a set of tool names called in the current turn
- `_build_human_context()` uses this set:
  - `current = tool is in _tools_called_this_turn` → send fresh result
  - `prior = pinned tool NOT in that set` → send historical context
- One version per tool per turn. Always freshest data.

---

### Problem 3: AI Router Was Taking 10+ Seconds

**What broke:**
Every single user message — even "show my leaves" — triggered a full embedding + vector similarity call to decide what intent it was. Embeddings are expensive. Users saw 10-second delays.

**Root cause:**
Intent routing ran embedding on every query without any pre-filter.

**Fix applied:**
- Fast keyword matching runs first (dictionary lookup, <1ms)
- 80% of queries match a keyword pattern (leave, attendance, payroll, burnout, org chart)
- Embeddings called only for truly ambiguous queries
- Result: median routing time dropped from ~10s to ~150ms

---

### Problem 4: Celery Tasks Were Silently Discarded

**What broke:**
Leave approvals triggered, notifications queued — nothing happened. Workers running, RabbitMQ connected, no errors in logs, but every task was silently dropped for 25 hours during development.

**Root cause:**
`app.autodiscover_tasks()` with no args only scans `INSTALLED_APPS` for `tasks.py` files.
The `tasks/` top-level package (containing `leave_tasks.py`, `notification_tasks.py`, etc.) is **not** in `INSTALLED_APPS` → 0 tasks registered → RabbitMQ accepted messages, workers had nothing to execute.

**Fix applied:**
```python
# config/celery.py
app.conf.imports = [
    "tasks.leave_tasks",
    "tasks.burnout_tasks",
    "tasks.notification_tasks",
    "tasks.review_tasks",
    "tasks.forecast_tasks",
]
app.autodiscover_tasks()  # still called for app-level tasks
```
Every task confirmed registered on worker startup via `celery inspect registered`.

---

### Problem 5: Generic AI Responses (No Personalisation)

**What broke:**
LLM responses felt robotic. "The employee has 5 days of Casual Leave remaining." — no name, no context, no role awareness.

**Fix applied:**
- `ChatService._build_agent_state()` builds a `user_profile` dict from the authenticated employee
- Fields: `name`, `first_name`, `role`, `title`, `department`, `manager_name`, `employee_id`
- Injected into both the system prompt and the `[CONTEXT]` blob
- System prompt example: *"You are talking to Kartik (Senior Engineering Manager) in the Technology department — their manager is Rahul Shah."*
- LLM now addresses user by first name, adjusts tone by role (manager = crisp/executive, employee = warm/guided)

---

## SLIDE B — Low Level Design (LLD)

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│   React 18 + TypeScript + Tailwind CSS                          │
│   Role dashboards: Employee | Manager | HR | CFO                │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS + JWT
┌───────────────────────────▼─────────────────────────────────────┐
│                         API LAYER                               │
│   Django 5 + DRF                                                │
│   /api/employees/   /api/leaves/   /api/attendance/             │
│   /api/ai/chat/     /api/ai/query/                              │
│   RBAC: IsEmployee | IsManager | IsHR | IsCFO                   │
└──────┬──────────────────────────────────────────┬───────────────┘
       │ sync (read/write)                         │ .delay() only
┌──────▼───────────────┐                 ┌────────▼───────────────┐
│   SERVICE LAYER      │                 │   CELERY WORKERS        │
│   EmployeeService    │                 │   leave_tasks           │
│   LeaveService       │                 │   notification_tasks    │
│   AttendanceService  │                 │   burnout_tasks         │
│   CompOffService     │                 │   forecast_tasks        │
└──────┬───────────────┘                 └────────┬───────────────┘
       │                                          │
┌──────▼───────────────┐                 ┌────────▼───────────────┐
│   REPOSITORY LAYER   │                 │   MESSAGE BROKER        │
│   ReadRepository     │                 │   RabbitMQ              │
│   WriteRepository    │                 │   (task queue)          │
└──────┬───────────────┘                 └────────────────────────┘
       │
┌──────▼───────────────┐
│   DATABASE LAYER     │
│   PostgreSQL          │
│   + pgvector (RAG)   │
└──────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        AI LAYER                                 │
│                                                                 │
│   ChatService                                                   │
│     ├── _build_agent_state()   → personalised AgentState        │
│     ├── _resolve_pronoun()     → Redis entity lookup            │
│     └── _build_messages()     → history + context + query      │
│                                                                 │
│   LangGraph Agent                                               │
│     ├── router_node            → keyword match → intent         │
│     ├── mcp_tools_node         → calls MCP tools (read-only)    │
│     ├── rag_retrieval_node     → pgvector similarity search     │
│     ├── spof_node              → single-point-of-failure check  │
│     ├── conflict_node          → schedule conflict detection    │
│     └── llm_generate_node     → LLMProviderFactory.get()       │
│                                                                 │
│   MCP Tool Registry                                             │
│     ├── employee_tools.py      → 14 read-only employee tools    │
│     ├── leave_tools.py         → 8 leave data tools             │
│     ├── attendance_tools.py    → attendance + heatmap tools     │
│     └── performance_tools.py  → review + rating tools          │
│                                                                 │
│   Redis                                                         │
│     ├── chat:turns:{sid}       → conversation history           │
│     ├── chat:tools:{sid}       → pinned tool results            │
│     └── chat:entities:{sid}   → extracted person/date context  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Employee Module — LLD

#### Models

```
User (AbstractUser)
  ├── id (PK)
  ├── email (unique, USERNAME_FIELD)
  ├── name
  └── phone_number (unique)

Department
  ├── id (PK)
  ├── name (unique)
  └── code (unique)

Employee
  ├── id (PK)
  ├── user (OneToOne → User)
  ├── employee_id (unique string, e.g. "EMP001")
  ├── role: employee | manager | hr | cfo | admin
  ├── department (FK → Department, nullable)
  ├── manager (FK → self, nullable)  ← self-referential hierarchy
  ├── title
  ├── is_active
  └── joined_on
```

#### Service Layer — EmployeeService

```
EmployeeService
  └── create_employee(validated_data)
        ├── atomic transaction
        ├── UserWriteRepository.create()    → creates User
        ├── DeptReadRepository.get_by_id()  → resolve department
        ├── EmployeeReadRepository.get_by_id() → resolve manager
        └── EmployeeWriteRepository.create()   → creates Employee
```

#### API Endpoints

| Method | URL | Permission | Action |
|--------|-----|-----------|--------|
| GET | `/api/employees/` | IsEmployee | List all employees (paginated, filterable) |
| POST | `/api/employees/` | IsHR | Create new employee |
| GET | `/api/employees/me/` | IsEmployee | Current user's own profile |
| GET | `/api/employees/{id}/` | IsEmployee | Single employee by PK |

#### Query Filters (GET /api/employees/)
- `?department=Engineering` — filter by department name
- `?role=manager` — filter by role
- `?search=kartik` — name search (icontains)
- `?limit=20&offset=0` — pagination

---

### Leave Module — LLD

#### Models

```
LeavePolicy
  ├── leave_type: CL | PL | SL | CO | LOP
  ├── annual_allocation
  ├── accrual_per_month
  ├── requires_balance
  └── allow_backdate_days

LeaveBalance
  ├── employee (OneToOne → Employee)
  ├── casual_remaining    (CL)
  ├── privilege_remaining (PL)
  ├── sick_remaining      (SL)
  └── comp_off_remaining  (CO)
  Methods: get_remaining(type), deduct(type, days), credit(type, days)

LeaveRequest
  ├── employee (FK → Employee)
  ├── leave_type: CL | PL | SL | CO | LOP
  ├── from_date, to_date, days_count
  ├── is_half_day, half_day_session: AM | PM
  ├── status: PENDING | APPROVED | REJECTED | CANCELLED
  ├── approver (FK → User)
  ├── spof_flag        ← AI: single point of failure detected
  ├── conflict_flag    ← AI: team schedule conflict detected
  ├── ai_context_card  ← AI-generated summary for manager
  └── balance_deducted ← idempotency flag

CompOffRequest
  ├── employee (FK → Employee)
  ├── worked_on (date worked on holiday/weekend)
  ├── days_claimed
  └── status: PENDING | APPROVED | REJECTED
```

#### Service Layer — LeaveService

```
LeaveService(employee)
  ├── apply(validated_data, applied_by)
  │     ├── validate: from_date <= to_date
  │     ├── validate: backdate limit per leave type
  │     ├── validate: half-day = single date + AM/PM required
  │     ├── _count_working_days() — exclude weekends
  │     ├── overlap check — no duplicate pending/approved leaves
  │     ├── _validate_balance() — select_for_update, atomic
  │     └── WriteRepository.create()
  │
  ├── approve(leave, approver)
  │     ├── _assert_is_manager() — direct manager or HR/Admin
  │     ├── status: PENDING → APPROVED
  │     └── balance.deduct() — idempotent via balance_deducted flag
  │
  ├── reject(leave, approver, rejection_reason)
  │     └── status: PENDING → REJECTED
  │
  ├── cancel(leave, requester)
  │     ├── only own or direct report's PENDING leave
  │     └── status: PENDING → CANCELLED
  │
  ├── simulate(leave_type, days)
  │     └── returns: current_balance, projected_year_end, is_sufficient
  │
  └── renotify_manager(leave, requester)
        └── dispatch_notification.delay() — async reminder to manager

CompOffService(employee)
  ├── request(worked_on, days_claimed, reason)
  ├── approve(comp_off_req, approver) → credit CO balance
  └── reject(comp_off_req, approver, reason)
```

#### API Endpoints

| Method | URL | Permission | Action |
|--------|-----|-----------|--------|
| GET | `/api/leaves/` | IsEmployee | List own leave requests |
| POST | `/api/leaves/` | IsEmployee | Apply for leave |
| GET | `/api/leaves/{id}/` | IsEmployee | Single leave detail |
| POST | `/api/leaves/{id}/approve/` | IsManager | Approve leave |
| POST | `/api/leaves/{id}/reject/` | IsManager | Reject with reason |
| POST | `/api/leaves/{id}/cancel/` | IsEmployee | Cancel pending leave |
| GET | `/api/leaves/balance/` | IsEmployee | Current leave balance |
| POST | `/api/leaves/simulate/` | IsEmployee | Simulate balance impact |
| GET | `/api/leaves/pending/` | IsManager | All pending for my team |

---

## SLIDE C — Live Examples: What Users Can Do via Chat

### Employee Examples

| User Types | AI Does | Result |
|------------|---------|--------|
| `"How many casual leaves do I have left?"` | Calls `get_leave_balance` MCP tool | *"Kartik, you have 4.5 CL days remaining."* |
| `"Apply sick leave for tomorrow"` | Calls `apply_leave` with SL type, tomorrow's date | Leave created, manager notified via RabbitMQ |
| `"Show me my attendance this week"` | Calls `get_attendance_summary` MCP tool | Tabular summary of check-in/out times |
| `"Will I have enough PL for a 5-day holiday in December?"` | Calls `simulate_leave_balance` | *"Projected balance: 8.5 PL. Yes, sufficient."* |
| `"Who is my manager?"` | Calls `get_my_profile` MCP tool | *"Your manager is Rahul Shah (Engineering Head)."* |
| `"Cancel my leave next Friday"` | Calls `cancel_leave` service | Leave status → CANCELLED |

---

### Manager Examples

| User Types | AI Does | Result |
|------------|---------|--------|
| `"Who on my team is off next week?"` | Calls `get_team_leaves` MCP tool | *"Priya (PL, Mon-Wed), Amit (SL, Fri)"* |
| `"Approve Priya's leave request"` | Resolves Priya from entity context, calls `approve_leave` | Leave approved, balance deducted, Priya notified |
| `"Is anyone a single point of failure if Amit takes 5 days off?"` | Runs SPOF LangGraph node + MCP tools | AI checks Amit's critical dependencies, flags risk |
| `"Show me pending approvals"` | Calls `get_pending_leaves_for_manager` | List of all pending leaves in team |
| `"What is Kartik's attendance this month?"` | `get_attendance_summary` with RBAC manager check | Full monthly attendance for Kartik |
| `"Who joined the team in the last 30 days?"` | Calls `get_new_hires` MCP tool | *"3 new hires: Neha, Rohan, Anjali"* |

---

### HR Examples

| User Types | AI Does | Result |
|------------|---------|--------|
| `"Show company-wide attendance heatmap for March"` | `get_attendance_heatmap` — all departments | Grid of attendance % per day per team |
| `"Which employees have used more than 80% of their sick leave?"` | `search_employees` + `get_leave_balance` loop | Filtered list with balance details |
| `"What is the leave policy for Privilege Leave?"` | RAG retrieval → HR policy documents | Policy text extracted from pgvector store |
| `"Flag anyone at burnout risk in Engineering"` | LangGraph burnout chain → attendance + leave data | Employees with high consecutive leave + low attendance flagged |

---

### CFO Examples

| User Types | AI Does | Result |
|------------|---------|--------|
| `"What is the projected leave liability for Q4?"` | Calls forecast task → `simulate_leave_balance` for all employees | Total days × daily cost estimate |
| `"How many employees are on LOP this month?"` | `get_leave_balance` + filter LOP | Count + employee list |
| `"Show headcount by department"` | `list_departments` MCP tool | Table: dept name, headcount, active count |

---

## SLIDE D — MCP Tool Registry (AI's Read-Only Window Into the DB)

### Why MCP Tools?

> The AI never touches the database directly.
> Every data read goes through an MCP tool.
> Every MCP tool enforces RBAC.
> Every MCP tool returns `{"error": ...}` on failure — never raises an exception.

### Employee Tools (14 tools)

| Tool | What It Returns | Who Can Call |
|------|----------------|-------------|
| `get_employee_profile` | Full profile of one employee | All roles (with RBAC filter) |
| `get_my_profile` | Requester's own profile | All roles |
| `get_direct_reports` | Immediate reports of a manager | Manager, HR, CFO, Admin |
| `get_employee_manager_chain` | Manager hierarchy up to 5 hops | All roles |
| `get_peers` | Colleagues with same manager or in same dept | All roles |
| `get_org_tree` | Recursive org tree under a manager (depth 3) | Manager, HR, Admin |
| `get_department_employees` | All employees in a department | All roles |
| `list_departments` | Departments with headcount | All roles |
| `search_employees` | Filter by role/title/dept/joined_after | All roles |
| `get_largest_teams` | Managers ranked by team size | HR, CFO, Admin |
| `get_new_hires` | Employees joined in last N days | Manager, HR, Admin |
| `get_employees_by_role` | All employees with a given role | HR, CFO, Admin |
| `get_employee_by_emp_id` | Look up by "EMP001" string | All roles |
| `find_employee_by_name` | Fuzzy name/email search | All roles |

### Leave Tools (8 tools)

| Tool | What It Returns |
|------|----------------|
| `get_leave_balance` | CL/PL/SL/CO remaining for an employee |
| `get_leave_requests` | Leave history with filters (status, type, date range) |
| `get_pending_leaves_for_manager` | All pending leaves in manager's team |
| `get_team_leave_calendar` | Who is off when (date range view) |
| `simulate_leave_balance` | Projected balance after N days taken |
| `apply_leave` | Creates a leave request via LeaveService |
| `approve_leave` | Approves via LeaveService (manager only) |
| `cancel_leave` | Cancels via LeaveService |

---

## SLIDE E — Technical Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + TypeScript + Tailwind | Role-based dashboards |
| API | Django 5 + DRF + JWT | Auth, RBAC, all writes |
| AI Orchestration | LangGraph | Intent routing + multi-step agent |
| LLM | OpenAI / Anthropic / Gemini (swappable) | Language generation |
| MCP Tools | Custom Python registry | AI's read-only DB access |
| RAG | pgvector + LangChain | Policy document retrieval |
| Async Queue | RabbitMQ + Celery | Non-blocking background jobs |
| Cache / Memory | Redis | Conversation history + entity context |
| Database | PostgreSQL | All persistent data |
| Container | Docker Compose | Full stack reproducible deploys |

---

## SLIDE F — How We Handle Context Across Conversation Turns

> This is one of the hardest problems in AI chat systems.
> "Who is my manager?" is easy. "What is **his** phone number?" — the AI needs to remember who "his" is.

---

### The Full Flow — Step by Step

#### Turn 1: "Who is my manager?"

```
User: "Who is my manager?"

1. ChatService receives message
   → builds AgentState with:
      - employee_id: 42 (Kartik's DB id)
      - requester_role: "employee"
      - chat_session_id: "sess_abc123"

2. LangGraph router_node
   → keyword match: "my manager" → intent = "employee_query"

3. mcp_tools_node
   → _self_referential_plan() detects "my manager" trigger
   → calls: get_my_profile(employee_id=42)
   → Result stored in state["tool_results"]["get_my_profile"]:
     {
       "employee": {
         "id": 42,
         "name": "Kartik Keswani",
         "manager_id": 15,
         "manager_name": "Rahul Shah",
         "manager_email": "rahul@company.com"
       }
     }

4. llm_generate_node
   → LLM receives: conversation history + tool result + current query
   → Response: "Your manager is Rahul Shah (Engineering Head)."

5. ChatService saves turn to Redis
   → key: chat:turns:sess_abc123
   → value: [{query: "Who is my manager?", response: "Your manager is Rahul Shah...", tools_called: ["get_my_profile"]}]

6. extract_turn_entities.delay() — Celery async task fires
   → Small LLM call extracts:
     {
       "intent": "manager_lookup",
       "focus_employee_id": 15,   ← RAHUL, not Kartik — the person being discussed
       "entities": {"person": "Rahul Shah", "relationship": "manager"}
     }
   → Saved to Redis at: chat:entities:sess_abc123
```

---

#### Turn 2: "What is his phone number?"

```
User: "What is his phone number?"

1. ChatService receives message
   → same session: chat_session_id = "sess_abc123"

2. LangGraph router_node
   → keyword: "phone number" → intent = "employee_query"

3. mcp_tools_node — PRONOUN RESOLUTION
   → query contains "his" → _resolve_pronoun_employee_id() called

   Resolution order tried:
   ┌─────────────────────────────────────────────────────────────┐
   │ Step 1: Check entity log at chat:entities:sess_abc123       │
   │         Most recent entry: focus_employee_id = 15 (Rahul)  │
   │         ✅ MATCH FOUND — resolved to employee id 15        │
   └─────────────────────────────────────────────────────────────┘
   (Steps 2, 3, 4 not needed — entity log resolved it)

   → calls: get_employee_profile(employee_id=15)
   → Result includes: phone_number of Rahul Shah

4. llm_generate_node
   → LLM receives:
     - Prior turn in history: "Your manager is Rahul Shah..."
     - Tool result: Rahul's profile with phone number
     - Current query: "What is his phone number?"
   → Response: "Rahul Shah's phone number is +91-98765-43210."

5. extract_turn_entities.delay() fires again
   → focus_employee_id: 15 (still Rahul)
   → Stored back in entity log
```

---

#### Turn 3: "Does he have any pending leave approvals?"

```
User: "Does he have any pending leave approvals?"

1. "he" → _resolve_pronoun_employee_id()
   → entity log: focus_employee_id = 15 (Rahul)
   → resolved to Rahul Shah

2. calls: get_pending_leaves_for_manager(manager_employee_id=15)

3. Response: "Rahul has 3 pending leave approvals from his team."

entity log updated: focus_employee_id = 15
```

---

#### What if the subject changes?

```
User (Turn 4): "What about Priya's leave balance?"

→ No pronoun — direct name
→ find_employee_by_name("Priya") → employee_id = 33

extract_turn_entities runs → focus_employee_id = 33 (Priya)

User (Turn 5): "Can she take 5 more days?"

→ "she" → _resolve_pronoun_employee_id()
→ entity log most recent: focus_employee_id = 33 (Priya) ✅

Response: "Priya currently has 4.5 PL days remaining.
           If she takes 5 more days, her projected year-end balance will be -0.5.
           She may not have enough — suggest using LOP for 0.5 days."
```

---

### Architecture Diagram — Context Memory System

```
                     USER SENDS MESSAGE
                            │
                            ▼
              ┌─────────────────────────┐
              │      ChatService        │
              │  reads: chat:turns      │ ← conversation history
              │  reads: chat:entities   │ ← who was discussed
              │  reads: chat:tools      │ ← pinned tool results
              └──────────┬──────────────┘
                         │
                         ▼
              ┌─────────────────────────┐
              │    LangGraph Agent      │
              │   mcp_tools_node        │
              │                         │
              │  _resolve_pronoun()     │
              │    1. entity log        │ ← most reliable (async extracted)
              │    2. manager chain     │ ← fallback for hierarchy queries
              │    3. name search result│ ← fallback for single match
              │    4. direct reports   │ ← fallback for team queries
              └──────────┬──────────────┘
                         │ calls MCP tool with resolved employee_id
                         ▼
              ┌─────────────────────────┐
              │    MCP Tool Layer       │
              │  get_employee_profile   │
              │  get_leave_balance      │
              │  etc.                   │
              └──────────┬──────────────┘
                         │
                         ▼
              ┌─────────────────────────┐
              │   llm_generate_node     │
              │                         │
              │  _build_messages():     │
              │   [system prompt]       │ ← who the user is (personalised)
              │   [history turns]       │ ← prior Q&A
              │   [CONTEXT blob]        │ ← current tool results
              │   [current query]       │ ← plain text, not JSON
              └──────────┬──────────────┘
                         │ LLM response
                         ▼
              ┌─────────────────────────┐
              │   Post-turn tasks       │
              │   (async, non-blocking) │
              │                         │
              │  extract_turn_entities  │ ← Celery task
              │    → focus_employee_id  │
              │    → entities dict      │
              │    → stored in Redis    │
              │      chat:entities:{id} │
              └─────────────────────────┘
```

---

### Why Not Just Pass All History to the LLM?

| Approach | Problem |
|----------|---------|
| Pass raw full history | LLM invents referents for pronouns when context is ambiguous |
| Pass only current query | Pronoun has no antecedent — LLM guesses wrong |
| Our approach: structured entity log | Pronoun resolved deterministically before LLM call |

Key insight: **Pronoun resolution happens in Python code, not in the LLM prompt.**
The LLM never has to "figure out" who "him" is — we tell it explicitly.

---

### Redis Keys Used for Context

| Key | TTL | Content |
|-----|-----|---------|
| `chat:turns:{session_id}` | 24h | List of `{query, response, tools_called}` per turn |
| `chat:tools:{session_id}` | 24h | Pinned tool results — latest result per tool name |
| `chat:entities:{session_id}` | 24h | List of `{focus_employee_id, entities, turn_query}` per turn |

All three are read at the start of every turn.
All three are written at the end of every turn (tools + turns sync, entities async via Celery).

---

*End of PPT.md — use this as source material for slides or speaker notes.*
