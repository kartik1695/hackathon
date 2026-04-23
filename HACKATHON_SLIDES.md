# HRMS-AI — Hackathon Evaluation Deck
### Slide Content Brief · 3–4 Slides · Focus: Design Thinking, Features, Specs, Robustness

---

## SLIDE 1 — Design Philosophy: "Conversational-First HRMS"

### The Design Thinking Shift
> **Old HR software:** Forms → Submit → Wait → Email → Approval → Done (5 steps, 3 tools, 1 day)
> **HRMS-AI:** One sentence in chat → Done (1 step, 1 tool, 30 seconds)

### Core Design Principles

| Principle | What it means in practice |
|---|---|
| **Intent over Navigation** | User says "apply sick leave tomorrow" — system routes, fills, validates, confirms |
| **Context Memory** | Every turn remembers who you are, your role, your manager, your balance |
| **Role-Aware UI** | Same chat, different superpowers — employee sees their data; manager sees team + approve/reject CTAs |
| **Zero Context Switch** | Notifications, approvals, roadmaps all surface inside the chat — no tab switching |
| **Graceful Degradation** | If AI fails → UI still works. Chat fails → REST pages still work |

### The "Embedded Chat" Pattern
- Chat is **not a page** — it's a **panel** that lives inside every page of the HRMS
- Manager approves a leave from the notification bubble **without leaving** the dashboard
- Re-notify manager for pending leave with **one tap** — no email, no Slack

---

## SLIDE 2 — Feature Coverage Matrix

### Modules Built (Fully Functional)

| Module | Employee Features | Manager Features |
|---|---|---|
| **Leave Management** | Apply (full/half day), cancel, view balance, history | Approve/Reject team leaves, view all statuses, filter by type/date/name, export CSV |
| **Attendance** | Check-in status, weekly view, raise regularization, apply WFH | Approve/reject reg + WFH, view team attendance, filter + export CSV |
| **Upskilling** | Generate AI roadmap (LLM), submit proof per step, track progress | Approve/reject roadmap, approve/reject each step, view team roadmaps |
| **Notifications** | Real-time WS push, bell counter, re-notify manager, dismiss | Live approve/reject from notification bubble, badge count |
| **AI Chat** | 21 intent types, chart generation, conversation history, context suggestions | All employee intents + team management intents |
| **People Directory** | View org chart, team info, manager chain | Direct reports, team analytics |

### AI Intent Coverage (21 intents routed)
```
Leave: leave_application, leave_status, cancel_leave, approve_leave, reject_leave,
       renotify_manager, pending_approvals, comp_off_request, comp_off_approve, leave_collection

Attendance: regularize_attendance, show_regularizations, approve_regularization,
            apply_wfh, show_wfh_requests, approve_wfh, show_penalties

Upskilling: skill_roadmap

Insights: burnout_check, review_summary, nl_query, employee_query, policy_query
```

### Key Specs
- **44 REST API endpoints** across leaves, attendance, upskilling
- **4 user roles** with RBAC: Employee / Manager / HR / CFO
- **Real-time WebSocket** notifications (Django Channels)
- **6 leave types**: CL, SL, PL, LOP, Comp Off, Half Day
- **Attendance penalty engine**: PL-first, then LOP; payroll lock on last working day
- **Upskilling**: AI-generated phased roadmaps, per-step proof + feedback loop
- **Theming**: 4 themes (Teal, Blue, Amber, Dark) via CSS vars — live switch, zero flash

---

## SLIDE 3 — Technical Architecture & Robustness


### Architecture Patterns → Why Robust

| Pattern | Where | Why it matters |
|---|---|---|
| **Strategy + Factory** | `LLMProviderFactory` | Swap OpenAI→Anthropic→Gemini — zero agent changes. Tested. |
| **Repository Layer** | Every app | Views never touch ORM. AI gets read-only repos. |
| **LangGraph State Machine** | `agents/graph.py` | Each intent = deterministic node sequence. No hallucination from routing. |
| **MCP Tools** | `mcp/tools/*.py` | AI reads live DB data through typed tools — never raw SQL, never hallucinated |
| **Celery Task Idempotency** | `tasks/*.py` | Every task checks "already processed?" before acting — no double notifications |
| **Context-Aware Router** | `agents/router.py` | Short follow-ups (≤5 words) re-use prior intent context — fixes pronoun resolution |

### Robustness Evidence

**Edge cases handled (15/15 test scenarios pass):**
- Insufficient leave balance → rejected with exact deficit
- Weekend-only date range → blocked
- Back-date limit exceeded → blocked
- Half-day counted as 0.5 days exactly
- Thu–Mon span = 3 working days (weekend excluded)
- Double-approve blocked (idempotency)
- Non-manager approve attempt → 403
- Approval deducts balance atomically (single DB write)
- CompOff invalid days → rejected
- CompOff double-approve → blocked

**Memory & Hallucination fixes shipped:**
- Redis turn cache → pronouns resolve against history, not JSON
- Tool result pinning → freshest result always used, never stale
- Entity extraction (async Celery) → `focus_employee_id` tracked across turns
- LLM fabrication guard → if `create_leave_request` absent from tool_results → error, not fake success

---

## SLIDE 4 — Demo Flow: What to Show

### Scenario A — Employee Journey (2 min)
1. Open chat → "What's my leave balance?" → balance card renders
2. "Apply CL tomorrow" → conflict check → confirmation → apply
3. WS push appears on manager's screen simultaneously (show split-screen)
4. "Remind my manager about my leave" → re-notify fires, manager sees bump

### Scenario B — Manager Power (2 min)
1. Manager opens chat → "What are my actionables?" → pending leaves + WFH + regularizations listed
2. Click **Approve leave #34** inline CTA → approved, WS push to employee
3. "Show my team roadmaps" → upskilling cards render with Approve buttons
4. Approve step → employee gets notification

### Scenario C — AI Intelligence (1.5 min)
1. "I want to learn product management" → LLM generates 5-phase roadmap, sends for approval
2. Switch LLM_PROVIDER from openai→anthropic in .env → restart → same query → identical output (provider swap demo)
3. "Show burnout risk in my team" → attendance + overtime data → AI narrative + bar chart renders

### Scenario D — Theme & Design (30 sec)
1. Switch theme Teal → Blue → Amber → Dark — zero flash, instant, every component adapts
2. Show chat, leave page, attendance page — all themed consistently
3. Show filter + export CSV on leave history

---

## Key Differentiators (Repeat in Every Slide)

> ✦ **Conversational-first** — not a chatbot bolted onto an HRMS. The chat IS the HRMS.
> ✦ **Provider-agnostic AI** — OpenAI, Anthropic, Gemini swappable at config level
> ✦ **Real-time everything** — WebSocket notifications, live approve/reject, instant balance updates
> ✦ **Role-aware context** — same interface, completely different experience per role
> ✦ **Production architecture** — Repository pattern, Service layer, Strategy pattern, Celery idempotency — not a prototype, a platform

---

*Generated 2026-04-23 | HRMS-AI Hackathon | Team 3SC*
