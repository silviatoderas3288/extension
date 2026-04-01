---
name: code-organization
description: File structure, naming conventions, module boundaries, and architectural patterns for React + Node.js TypeScript projects. Use when scaffolding a new project, creating new files, refactoring tangled code, or deciding where a new piece of logic belongs. Covers feature-based structure, layered backend architecture, barrel exports, and dependency direction rules.
---

## Core Philosophy

**Organize by feature, not by type.**

The instinct to group all components together, all services together, and all hooks together feels clean — until you touch a feature and realize its code is scattered across six directories. Feature-based organization keeps everything a feature needs close together, making it easier to understand, delete, or move.

Two questions to ask before creating or placing a file:

1. **Who owns this?** If it belongs to one feature, it lives in that feature's folder. If it belongs to no feature — if it's genuinely shared — it lives in a shared layer.
2. **What direction do dependencies flow?** Dependencies should always point inward: UI → hooks → services → utilities. Nothing in a lower layer should import from a higher one.

---

## Frontend Structure

```
src/
├── features/                        # One folder per product feature
│   ├── jobs/
│   │   ├── components/
│   │   │   ├── JobCard.tsx
│   │   │   ├── JobGrid.tsx
│   │   │   └── JobFilters.tsx
│   │   ├── hooks/
│   │   │   ├── useJobs.ts           # Fetches + manages job list state
│   │   │   └── useJobFilters.ts     # Filter state + URL sync
│   │   ├── api/
│   │   │   └── jobsApi.ts           # All /api/jobs fetch calls
│   │   ├── types.ts                 # Job, JobFilter, JobSortOrder
│   │   ├── utils.ts                 # formatSalaryRange(), isExpired()
│   │   └── index.ts                 # Public API of this feature
│   └── auth/
│       ├── components/
│       │   ├── LoginForm.tsx
│       │   └── ProtectedRoute.tsx
│       ├── hooks/
│       │   └── useAuth.ts
│       ├── api/
│       │   └── authApi.ts
│       ├── types.ts
│       └── index.ts
│
├── components/                      # Shared, reusable UI primitives only
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx
│   │   └── index.ts
│   ├── Input/
│   ├── Modal/
│   └── index.ts
│
├── hooks/                           # Shared hooks used by multiple features
│   ├── useDebounce.ts
│   ├── useIntersectionObserver.ts
│   └── useLocalStorage.ts
│
├── lib/                             # Third-party client setup (one file per lib)
│   ├── queryClient.ts               # React Query client config
│   ├── axios.ts                     # Axios instance with interceptors
│   └── analytics.ts                 # Analytics init + typed event helpers
│
├── utils/                           # Pure, framework-agnostic utility functions
│   ├── formatters.ts                # formatDate(), formatCurrency()
│   ├── validators.ts                # isEmail(), isSlug()
│   └── cn.ts                        # classnames/tailwind-merge helper
│
├── types/                           # Global TypeScript types and API contracts
│   ├── api.ts                       # ApiResponse<T>, PaginatedResponse<T>
│   └── common.ts                    # ID, Timestamp, Nullable<T>
│
├── styles/
│   └── globals.css                  # CSS custom properties + resets only
│
├── pages/ (or app/ for Next.js)     # Routing layer — thin wrappers only
│   ├── JobsPage.tsx
│   └── JobDetailPage.tsx
│
├── App.tsx
└── main.tsx
```

### What goes where

| Code | Location |
|---|---|
| Fetches for one feature | `features/{name}/api/` |
| State for one feature | `features/{name}/hooks/` |
| Components used by one feature | `features/{name}/components/` |
| Component used by 2+ features | `components/` |
| Hook used by 2+ features | `hooks/` |
| Third-party SDK setup | `lib/` |
| Pure helper function | `utils/` |
| Page/route component | `pages/` or `app/` |

When in doubt, start in the feature folder. Move to shared only when a second feature actually needs it — not speculatively.

---

## Backend Structure

```
src/
├── features/                        # Mirror frontend's feature split
│   ├── jobs/
│   │   ├── jobs.router.ts           # Express router — route definitions only
│   │   ├── jobs.controller.ts       # Request/response handling
│   │   ├── jobs.service.ts          # Business logic, DB queries
│   │   ├── jobs.schema.ts           # Zod schemas for validation
│   │   ├── jobs.types.ts            # TypeScript interfaces
│   │   └── jobs.test.ts             # Integration tests for this feature
│   └── auth/
│       ├── auth.router.ts
│       ├── auth.controller.ts
│       ├── auth.service.ts
│       ├── auth.schema.ts
│       └── auth.types.ts
│
├── db/                              # Database layer
│   ├── schema/                      # Drizzle table definitions
│   │   ├── jobs.ts
│   │   └── users.ts
│   ├── migrations/                  # Drizzle Kit generated migrations
│   ├── pool.ts                      # pg.Pool setup
│   └── index.ts                     # db client export
│
├── middleware/
│   ├── authenticate.ts              # JWT / session validation
│   ├── validate.ts                  # Zod middleware factory
│   ├── errorHandler.ts              # Global error handler
│   └── requestLogger.ts
│
├── lib/                             # Third-party client setup
│   ├── redis.ts
│   └── s3.ts
│
├── utils/
│   ├── errors.ts                    # AppError, NotFoundError, ConflictError
│   ├── asyncHandler.ts              # Wraps async route handlers
│   └── pagination.ts                # parseCursor(), buildCursorResponse()
│
├── config/
│   └── env.ts                       # Validate + export process.env
│
├── app.ts                           # Express app setup, middleware mounting
└── server.ts                        # HTTP server, port binding, graceful shutdown
```

### The four backend layers (and what each one owns)

```
Request
   ↓
Router          — route definitions, middleware attachment, nothing else
   ↓
Controller      — parse req, call service, format res, handle HTTP errors
   ↓
Service         — business logic, DB queries, external API calls
   ↓
DB / External   — pool queries, ORM, third-party SDKs
```

Each layer talks only to the layer directly below it. A router never calls a DB. A service never touches `req` or `res`. Violating this makes code hard to test and hard to reason about.

```ts
// ✅ router.ts — route definition only
router.get('/:id', authenticate, jobsController.getById);

// ✅ controller.ts — HTTP concerns only
async getById(req: Request, res: Response) {
  const job = await jobsService.getById(req.params.id);
  if (!job) throw new NotFoundError('Job not found');
  res.json({ data: job });
}

// ✅ service.ts — business logic only, no req/res
async getById(id: string): Promise<Job | null> {
  return db.query.jobs.findFirst({ where: eq(jobs.id, id) });
}
```

---

## Dependency Direction Rules

This is the most important rule in architecture. **Dependencies point inward.**

```
pages / routes
      ↓
  components / controllers
      ↓
   hooks / services
      ↓
  api calls / db queries
      ↓
    utils / types
```

Anything can import from layers below it. Nothing imports from layers above it.

```ts
// ❌ Service importing from a controller — wrong direction
import { formatJobResponse } from '../jobs.controller';

// ❌ Utility importing from a feature — wrong direction
import { Job } from '../features/jobs/types';

// ✅ Feature importing from shared utils — correct
import { formatCurrency } from '@/utils/formatters';

// ✅ Hook importing from feature's API layer — correct
import { jobsApi } from '../api/jobsApi';
```

If you find yourself needing to import upward, you've found a boundary violation. Either extract the shared logic to a lower layer, or restructure.

---

## Naming Conventions

### Files

| What | Convention | Example |
|---|---|---|
| React component | `PascalCase.tsx` | `JobCard.tsx` |
| Hook | `camelCase.ts`, prefix `use` | `useJobFilters.ts` |
| Utility / helper | `camelCase.ts` | `formatters.ts` |
| Feature API module | `camelCase.ts` | `jobsApi.ts` |
| Backend router | `{feature}.router.ts` | `jobs.router.ts` |
| Backend service | `{feature}.service.ts` | `jobs.service.ts` |
| Type definitions | `{feature}.types.ts` | `jobs.types.ts` |
| Test file | Co-located, `.test.ts(x)` | `JobCard.test.tsx` |

### Variables and functions

```ts
// camelCase for variables and functions
const jobCount = 0;
function getUserById(id: string) { ... }

// PascalCase for types, interfaces, classes, React components
type JobListing = { ... }
interface ApiResponse<T> { ... }
class JobValidator { ... }
function JobCard({ job }: Props) { ... }

// SCREAMING_SNAKE_CASE for module-level constants
const MAX_PAGE_SIZE = 100;
const DEFAULT_LOCATION = 'NYC';

// Boolean variables: prefix with is, has, can, should
const isLoading = true;
const hasNextPage = false;
const canApply = user.verified;

// Event handlers: prefix with handle (not on)
function handleSubmit() { ... }    // ✅
function onSubmit() { ... }        // ❌ — "on" is for prop names
<Button onClick={handleSubmit} />  // ✅ — "on" is correct for props
```

### Be specific with names

```ts
// ❌ Too generic
const data = await fetch('/api/jobs');
function getUser() { ... }
const list = jobs.filter(...);

// ✅ Specific
const jobsResponse = await fetch('/api/jobs');
function getUserById(id: string) { ... }
const activeJobs = jobs.filter(j => j.isActive);
```

---

## Barrel Exports (and When to Skip Them)

Barrel files (`index.ts`) let you define a public API for a module and simplify imports.

```ts
// features/jobs/index.ts — explicit public API
export { JobCard } from './components/JobCard';
export { JobGrid } from './components/JobGrid';
export { useJobs } from './hooks/useJobs';
export type { Job, JobFilter } from './types';
// Note: jobsApi is NOT exported — it's an internal detail

// Consuming code
import { JobCard, useJobs } from '@/features/jobs';
// instead of:
import { JobCard } from '@/features/jobs/components/JobCard';
import { useJobs } from '@/features/jobs/hooks/useJobs';
```

### When barrels cause problems

Barrel files can break tree-shaking and slow down builds in large projects if they re-export everything indiscriminately. Rules to follow:

- **Feature `index.ts`**: export only what other features need. Internal components don't need to be exported.
- **Shared `components/index.ts`**: fine to export all primitives — they're meant to be used everywhere.
- **Don't create barrels for single-file modules** — a barrel for a file that only exports one thing adds noise.
- If your bundler supports it, use `"sideEffects": false` in `package.json` to help tree-shaking work through barrels.

---

## Where Does This Function Go?

The most common question in day-to-day development.

**Is it pure (no side effects, no imports beyond types)?**
→ `utils/`

**Does it make a network request?**
→ `features/{name}/api/` if it belongs to one feature, `lib/` if it's a configured client

**Does it touch React state or lifecycle?**
→ Custom hook in `features/{name}/hooks/` or shared `hooks/`

**Does it contain business rules (validation, eligibility, pricing logic)?**
→ `features/{name}/service.ts` on the backend, or a non-hook module in the feature folder on the frontend

**Does it format data for display?**
→ `utils/formatters.ts` if generic, or `features/{name}/utils.ts` if domain-specific

**Is it a React component?**
→ `features/{name}/components/` if it belongs to one feature, `components/` if it's a shared primitive

**The rule**: put it at the **lowest layer it needs**. If it only needs types, it's a util. Reach for a higher layer only when you actually need what that layer provides.

---

## Code Smell Reference

These are signals that a file or module needs to be restructured — not rules to follow mechanically.

| Signal | What it usually means |
|---|---|
| File exceeds ~300 lines | It's doing more than one thing — find the seam and split |
| Function exceeds ~40 lines | It has multiple responsibilities — extract helpers |
| Function takes 4+ parameters | Group into an options object; consider if it's doing too much |
| A component imports from another feature directly | Missing abstraction; go through the feature's `index.ts` or lift to shared |
| A service imports `req` or `res` | Logic leaked into the wrong layer |
| A utility imports from a feature | Dependency going the wrong direction |
| The same logic exists in 2+ places | Extract to a shared utility — but wait for the third copy before abstracting |
| A file is named `helpers.ts`, `misc.ts`, or `utils2.ts` | It's a junk drawer; every function in it needs a real home |
| You need to read 5+ files to understand one feature | The feature is too spread out; consider co-location |

**On the "don't repeat yourself" instinct**: resist abstracting after seeing something twice. Two copies of similar code is fine. Three copies is the signal to extract. Premature abstraction creates the wrong abstraction, which is harder to fix than duplication.

---

## Comments: The One Rule

**Comment the why, never the what.**

The code shows what's happening. A good comment explains why it's happening this way — the constraint, the tradeoff, the non-obvious context.

```ts
// ❌ Explains what (the code already says this)
// Filter out inactive jobs
const activeJobs = jobs.filter(j => j.isActive);

// ✅ Explains why
// Inactive jobs are returned by the API for audit purposes but should
// never appear in search results — filter here rather than in the query
// because the API response is cached and used for other views too.
const activeJobs = jobs.filter(j => j.isActive);

// ✅ Documents a non-obvious constraint
// Use ST_DWithin instead of ST_Distance here — ST_Distance computes
// the exact distance for every row before filtering, which is O(n).
// ST_DWithin uses the spatial index and is orders of magnitude faster.
const nearby = await db.execute(sql`
  SELECT * FROM job_listings
  WHERE ST_DWithin(location, ${point}, ${radiusMeters})
`);

// ✅ Explains a deliberate tradeoff
// Intentionally not awaiting — we want the analytics event to fire
// without blocking the response. Failures here are logged but non-fatal.
trackEvent('job_applied', { jobId }).catch(logger.error);
```

If you find yourself writing a comment to explain what a block of code does, that's a sign the code needs a better name or needs to be extracted into a named function.