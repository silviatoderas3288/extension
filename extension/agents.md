# Agent Coordination

> This file tells agents who does what, how to hand off between agents,
> and how to split up a feature without stepping on each other.

---

## Agent Roster

| Agent | Owns | Skills |
|-------|------|--------|
| **PlanAgent** | Breaking features into tasks, writing `tasks/todo.md`, flagging ambiguity | — |
| **UIAgent** | React components, pages, layout, styling | design-system, code-organization |
| **APIAgent** | Express routes, controllers, services, middleware | api-conventions, error-security-patterns, code-organization |
| **DatabaseAgent** | Schema, migrations, queries, indexes | postgres, error-security-patterns |
| **AuthAgent** | Login, JWT, sessions, permissions | error-security-patterns |
| **TestAgent** | All test files (unit, integration, E2E) | testing-patterns |
| **RefactorAgent** | Cleaning up, restructuring, reducing duplication | code-organization, testing-patterns |
| **IntegrationAgent** | Wiring agents together, verifying end-to-end | all |

---

## How to Spawn an Agent

In Claude Code, use `Task` tool calls to spin up subagents. Each subagent gets:
1. A single focused task (one concern only)
2. The relevant skill files to read first
3. The files it is allowed to touch
4. A clear deliverable — what does "done" look like?

```
Task: "You are DatabaseAgent. Read skills/postgres.md first.
       Create the migration for the job_listings table with the schema below.
       Write to: migrations/0001_create_job_listings.ts
       Done when: migration runs without error and schema matches spec."
```

---

## Standard Feature Build Order

For any new feature, always build in this order. Never skip ahead.

```
1. PlanAgent     → writes tasks/todo.md, identifies unknowns
       ↓
2. DatabaseAgent → schema + migration (if needed)
       ↓
3. APIAgent      → route → controller → service
       ↓
4. UIAgent       → components → hooks → wire to API
       ↓
5. TestAgent     → unit tests for logic, integration tests for routes + UI
       ↓
6. IntegrationAgent → smoke test the full flow end-to-end
```

**Do not start step N+1 until step N is verified working.**
If UIAgent starts before APIAgent finishes, you're mocking against an API contract that may change.

---

## Handoff Protocol

When one agent hands off to another, it must leave a handoff note in `tasks/todo.md`:

```markdown
## ✅ DatabaseAgent — Done
- Created `job_listings` table (migration: 0001_create_job_listings.ts)
- Indexes: location, created_at, composite (location, is_active)
- Exported types: JobListing, NewJobListing from src/db/schema/jobListings.ts

## → APIAgent — Pick up here
- Build: GET /api/jobs (list with filters), GET /api/jobs/:id, POST /api/jobs
- Zod schemas needed: jobQuerySchema, createJobSchema
- FK: job_listings.company_id → companies.id (already exists)
- Error to handle: 23505 unique violation on slug column
```

This prevents the next agent from re-discovering context the previous one already established.

---

## File Ownership

Agents should only write to files in their domain. If an agent needs to touch
another agent's files, it flags it first rather than just editing.

| Directory / File | Owner |
|---|---|
| `src/features/*/components/` | UIAgent |
| `src/features/*/hooks/` | UIAgent |
| `src/features/*/api/` | UIAgent (client-side fetching) |
| `src/features/*/router.ts` | APIAgent |
| `src/features/*/controller.ts` | APIAgent |
| `src/features/*/service.ts` | APIAgent |
| `src/features/*/schema.ts` | APIAgent |
| `src/db/schema/` | DatabaseAgent |
| `migrations/` | DatabaseAgent |
| `src/middleware/authenticate.ts` | AuthAgent |
| `src/middleware/validate.ts` | APIAgent |
| `tests/` | TestAgent |
| `*.test.ts`, `*.test.tsx` | TestAgent |
| `tasks/todo.md` | All agents (append only) |
| `tasks/lessons.md` | All agents (append only) |

---

## Parallelism Rules

Some agents can run in parallel. Some cannot.

```
✅ Can run in parallel:
   - UIAgent + APIAgent (if API contract is agreed upfront)
   - TestAgent (unit tests) + UIAgent
   - Multiple UIAgents on different features

❌ Must be sequential:
   - DatabaseAgent must finish before APIAgent
   - APIAgent must finish before UIAgent wires to real API
   - All agents must finish before IntegrationAgent
```

If running UIAgent and APIAgent in parallel, agree on the response shape first
and write it to `tasks/api-contract.md` before either agent starts.

---

## When an Agent Gets Stuck

If an agent hits unexpected complexity or an ambiguous requirement:

1. **Stop** — don't thrash or make assumptions that affect other agents
2. **Write the blocker** to `tasks/todo.md` under a `## 🚧 Blocked` section
3. **Surface it** — flag to the user immediately with:
   - What was expected
   - What was found instead
   - Two options to resolve it (if possible)
4. **Do not continue** to the next step until unblocked

Thrashing silently is the most expensive thing an agent can do.

---

## Verification Checklist (IntegrationAgent)

Before marking a feature complete:

- [ ] Migration ran cleanly on a fresh DB
- [ ] All API routes return the correct shape (`{ data }` or `{ error }`)
- [ ] Validation rejects bad input with 400 + `VALIDATION_ERROR`
- [ ] Auth middleware blocks unauthenticated requests with 401
- [ ] UI displays loading, error, and empty states — not just the happy path
- [ ] Unit tests pass for all service-layer logic
- [ ] Integration tests cover happy path + at least one error path per route
- [ ] No `console.log` left in production code
- [ ] No hardcoded secrets or URLs
