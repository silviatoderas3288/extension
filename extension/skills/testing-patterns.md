---
name: testing-patterns
description: Unit, integration, and E2E testing patterns for React + Node.js projects. Use when writing tests, debugging test failures, setting up a test suite from scratch, or verifying that a feature works correctly. Covers Vitest, React Testing Library, MSW, and Playwright.
---

## Core Philosophy

**Test behavior, not implementation.**

The goal is a test suite that gives you confidence to refactor without rewriting tests. If your tests break when you rename an internal function or change a CSS class, they're testing the wrong thing.

Two failure modes to avoid:
- **Over-mocking**: Tests pass but the real integration is broken
- **Over-testing internals**: Tests break on every refactor even when behavior is unchanged

The acid test for any test: *would this catch a real bug a user would notice?*

---

## Stack Assumptions

| Layer | Tool |
|-------|------|
| Test runner | Vitest |
| Component tests | React Testing Library (RTL) |
| API mocking | MSW (Mock Service Worker) |
| E2E | Playwright |
| Assertions | Vitest's built-in `expect` (Chai-based) |

> **Note**: Vitest and Jest are API-compatible for most cases, but don't mix them. If you're in a Jest project, replace `vi.*` with `jest.*` throughout — everything else applies.

---

## The Test Pyramid (and When to Break It)

```
         E2E          ← few, slow, highest confidence
        ───────
     Integration      ← moderate, catches wiring bugs
    ─────────────
        Unit          ← many, fast, catches logic bugs
   ─────────────────
```

A rough target for most apps: **60% unit / 30% integration / 10% E2E**.

These ratios shift depending on your architecture:
- **API-heavy frontend?** Lean on integration tests with MSW. Unit tests on pure logic only.
- **Complex business logic?** More unit tests.
- **CRUD-heavy app?** Integration tests carry most of the weight. E2E covers the happy path.

Don't treat the ratios as a rule — treat them as a starting heuristic.

---

## Unit Tests

Unit tests cover **pure functions and isolated logic**. If you're rendering a component or hitting a database, it's not a unit test.

### Pattern

```ts
// src/utils/formatCurrency.ts
export function formatCurrency(amount: number, currency = 'USD'): string {
  if (amount < 0) throw new Error('Amount must be non-negative');
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

// src/utils/formatCurrency.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency } from './formatCurrency';

describe('formatCurrency', () => {
  it('formats a whole number in USD', () => {
    expect(formatCurrency(1000)).toBe('$1,000.00');
  });

  it('formats a decimal amount correctly', () => {
    expect(formatCurrency(9.99)).toBe('$9.99');
  });

  it('formats in a different currency when specified', () => {
    expect(formatCurrency(50, 'EUR')).toBe('€50.00');
  });

  it('throws for negative amounts', () => {
    expect(() => formatCurrency(-1)).toThrow('Amount must be non-negative');
  });

  it('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });
});
```

### What makes this good
- Each test covers one behavior, named clearly
- Edge cases (zero, negative, non-default arg) are explicit
- No mocks needed — the function is pure

---

## Component Unit Tests (React Testing Library)

Test components the way a user interacts with them. **Query by role and label, not by class or test ID.**

### RTL Query Priority (follow this order)

1. `getByRole` — most resilient, accessible-first
2. `getByLabelText` — great for form fields
3. `getByPlaceholderText` — acceptable for inputs without labels
4. `getByText` — for non-interactive elements
5. `getByTestId` — last resort only

```tsx
// src/components/PasswordInput.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordInput } from './PasswordInput';

describe('PasswordInput', () => {
  it('masks input by default', () => {
    render(<PasswordInput label="Password" />);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('reveals password when toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<PasswordInput label="Password" />);

    await user.click(screen.getByRole('button', { name: /show password/i }));

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });

  it('calls onChange with the typed value', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<PasswordInput label="Password" onChange={handleChange} />);

    await user.type(screen.getByLabelText('Password'), 'hunter2');

    expect(handleChange).toHaveBeenLastCalledWith('hunter2');
  });

  it('is disabled when the disabled prop is set', () => {
    render(<PasswordInput label="Password" disabled />);
    expect(screen.getByLabelText('Password')).toBeDisabled();
  });
});
```

### What makes this good
- Uses `userEvent.setup()` (not `userEvent.type()` directly — that's the v13 API)
- Queries by label and role, not class or testId
- Tests behavior a user would notice, not implementation details

---

## Integration Tests with MSW

MSW intercepts requests at the network level — no mocking of modules, no brittle `axios.get` spies. Your component code runs exactly as it does in production; only the server response is controlled.

### Setup

```ts
// src/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

// vitest.setup.ts
import { beforeAll, afterAll, afterEach } from 'vitest';
import { server } from './src/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

> Setting `onUnhandledRequest: 'error'` is important — it catches accidental unmocked requests that would otherwise silently return nothing.

### Handlers

```ts
// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw';
import { jobsFixture } from './fixtures/jobs';

export const handlers = [
  http.get('/api/jobs', () => {
    return HttpResponse.json({ data: jobsFixture });
  }),

  http.post('/api/jobs/:id/apply', ({ params }) => {
    return HttpResponse.json({ jobId: params.id, status: 'applied' });
  }),
];
```

### Integration Test

```tsx
// src/features/JobBoard/JobBoard.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { JobBoard } from './JobBoard';

describe('JobBoard', () => {
  it('fetches and displays jobs on mount', async () => {
    render(<JobBoard />);

    // Loading state appears immediately
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Jobs appear after fetch resolves
    await screen.findByText('Senior Backend Engineer');
    expect(screen.getByText('Frontend Developer')).toBeInTheDocument();
  });

  it('shows an error state when the request fails', async () => {
    server.use(
      http.get('/api/jobs', () => HttpResponse.error())
    );

    render(<JobBoard />);

    await screen.findByText(/failed to load jobs/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows empty state when no jobs are returned', async () => {
    server.use(
      http.get('/api/jobs', () => HttpResponse.json({ data: [] }))
    );

    render(<JobBoard />);

    await screen.findByText(/no jobs found/i);
  });

  it('applies to a job and shows confirmation', async () => {
    const user = userEvent.setup();
    render(<JobBoard />);

    const applyBtn = await screen.findByRole('button', { name: /apply to senior backend engineer/i });
    await user.click(applyBtn);

    await screen.findByText(/application submitted/i);
    // Button should now be disabled to prevent double-submit
    expect(applyBtn).toBeDisabled();
  });
});
```

### What makes this good
- No module mocks — MSW intercepts at the network layer
- Per-test overrides with `server.use()` for error cases
- Tests the full component tree including data fetching hooks
- `screen.findBy*` (async) for elements that appear after data loads

---

## Backend Integration Tests

Test your routes end-to-end against a real (test) database. Don't mock the ORM or the DB driver — that defeats the purpose.

```ts
// tests/integration/jobs.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { db } from '../../src/db';
import { jobs } from '../../src/db/schema';

describe('GET /api/jobs', () => {
  beforeAll(async () => {
    await db.delete(jobs); // clean slate
  });

  beforeEach(async () => {
    await db.insert(jobs).values([
      { id: '1', title: 'Backend Engineer', location: 'NYC', salary: 180000 },
      { id: '2', title: 'Frontend Engineer', location: 'SF', salary: 160000 },
      { id: '3', title: 'Data Scientist', location: 'NYC', salary: 170000 },
    ]);
  });

  afterEach(async () => {
    await db.delete(jobs);
  });

  afterAll(async () => {
    await db.end();
  });

  it('returns all jobs', async () => {
    const res = await request(app).get('/api/jobs').expect(200);
    expect(res.body.data).toHaveLength(3);
  });

  it('filters by location', async () => {
    const res = await request(app).get('/api/jobs?location=NYC').expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((j: any) => j.location === 'NYC')).toBe(true);
  });

  it('returns 400 for an invalid limit', async () => {
    const res = await request(app).get('/api/jobs?limit=abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when limit exceeds maximum', async () => {
    const res = await request(app).get('/api/jobs?limit=500').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

### What makes this good
- `beforeEach` / `afterEach` keeps tests isolated — order doesn't matter
- Hits real SQL; catches constraint violations, index issues, pagination bugs
- Tests both happy path and validation error paths
- `db.delete()` before inserting prevents stale data from a failed run

---

## E2E Tests (Playwright)

E2E tests cover **critical user journeys** only. They're slow, occasionally flaky, and expensive to maintain — use them where they earn their keep.

Good candidates:
- Signup / login flow
- Checkout / payment flow
- Any flow involving multiple page navigations

```ts
// tests/e2e/apply-to-job.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Job application flow', () => {
  test.beforeEach(async ({ page }) => {
    // Seed test data via API, not via UI — it's faster
    await page.request.post('/api/test/seed', { data: { scenario: 'jobs' } });
    await page.goto('/jobs');
  });

  test('user can apply to a job', async ({ page }) => {
    await expect(page.getByTestId('job-card')).toHaveCount(3);

    // Open the first job
    await page.getByRole('link', { name: 'Senior Backend Engineer' }).click();
    await expect(page).toHaveURL(/\/jobs\/\d+/);

    // Apply
    await page.getByRole('button', { name: 'Apply' }).click();

    // Confirm success
    await expect(page.getByText('Application submitted')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  test('shows error when application fails', async ({ page }) => {
    await page.route('**/api/jobs/*/apply', route =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) })
    );

    await page.getByRole('link', { name: 'Senior Backend Engineer' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();

    await expect(page.getByText(/something went wrong/i)).toBeVisible();
  });
});
```

### Playwright tips
- Use `getByRole` and `getByText` — not CSS selectors
- Seed data via API endpoints, not UI flows (faster and more reliable)
- `page.route()` for simulating server errors in E2E
- Keep E2E tests to happy path + one major failure path per flow
- Run E2E in CI against a staging environment, not localhost

---

## What to Test at Each Level (Quick Reference)

| Thing you're testing | Level |
|---|---|
| Pure function / utility | Unit |
| React component rendering and interaction | Component (unit) |
| Component that fetches data | Integration (MSW) |
| Multiple components working together | Integration (MSW) |
| API route (request → DB → response) | Backend integration |
| Full user flow across pages | E2E |
| 3rd-party SDK behavior | Don't test — trust it |

---

## Test Data: Fixtures vs. Factories

**Fixtures** (static objects) are fine for simple cases:
```ts
// tests/fixtures/jobs.ts
export const jobsFixture = [
  { id: '1', title: 'Backend Engineer', location: 'NYC' },
  { id: '2', title: 'Frontend Engineer', location: 'SF' },
];
```

**Factories** are better when tests need variation:
```ts
// tests/factories/job.ts
let counter = 0;

export function createJob(overrides: Partial<Job> = {}): Job {
  counter++;
  return {
    id: String(counter),
    title: `Job ${counter}`,
    location: 'NYC',
    salary: 100000,
    postedAt: new Date().toISOString(),
    ...overrides,
  };
}

// In tests:
const remoteJob = createJob({ location: 'Remote' });
const highPayingJob = createJob({ salary: 300000 });
```

Factories prevent test coupling — tests don't share the same objects and mutate each other's state.

---

## File Structure

```
src/
├── components/
│   └── PasswordInput/
│       ├── PasswordInput.tsx
│       └── PasswordInput.test.tsx    ← co-locate component tests
├── utils/
│   └── formatCurrency.test.ts        ← co-locate unit tests

tests/
├── integration/                      ← backend route tests (need DB)
│   └── jobs.test.ts
├── e2e/                              ← Playwright
│   └── apply-to-job.spec.ts
├── fixtures/
│   └── jobs.ts
├── factories/
│   └── job.ts
└── mocks/
    ├── server.ts                     ← MSW server setup
    └── handlers.ts                   ← default MSW handlers
```

Co-locating component and unit tests with source files makes them easier to find and harder to ignore.

---

## Debugging Failing Tests

1. **Run the single failing test**: `vitest run src/components/PasswordInput.test.tsx`
2. **Use `screen.debug()`** to print the current DOM in an RTL test
3. **Check your MSW handler** — log the intercepted request to confirm it's being hit: `http.get('/api/jobs', ({ request }) => { console.log(request.url); ... })`
4. **Check `onUnhandledRequest: 'error'`** — if MSW is erroring on an unexpected request, your component is making a call you didn't account for
5. **For async failures**, use `findBy*` instead of `getBy*` — `getBy` is synchronous and will throw before the element renders
6. **For Playwright flakiness**, use `expect(locator).toBeVisible()` instead of `.isVisible()` — the former has automatic retry logic built in

---

## Anti-Patterns to Avoid

❌ **Testing that `setState` was called** — test the rendered output instead  
❌ **`getByClassName` or `getByTestId` as first choice** — means your markup isn't accessible  
❌ **Mocking the module you're testing** — you're no longer testing the real code  
❌ **Sharing mutable test data across tests** — causes order-dependent failures  
❌ **E2E tests for every edge case** — that's integration test territory; E2E is for journeys  
❌ **Asserting on implementation details** (`wrapper.instance()`, internal state) — these break on every refactor  
❌ **`waitFor(() => expect(...).not.toBeInTheDocument()`)** — this passes immediately if the element was never there; use `waitForElementToBeRemoved` instead