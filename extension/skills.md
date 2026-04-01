# Skills Reference

> This file is the index. Each skill lives in `skills/` as its own file.
> Agents: read the relevant skill file before working in that domain.
> When in doubt about which skill applies, read `agents.md` for routing guidance.

---

## Available Skills

| Skill | File | When to Use |
|-------|------|-------------|
| **explain-code** | `skills/explain-code.md` | Explaining how code works, teaching, "how does this work?" questions |
| **design-system** | `skills/design-system.md` | Building any UI component, page, or style |
| **api-conventions** | `skills/api-conventions.md` | Writing any Express route, REST endpoint, or SQL query |
| **code-organization** | `skills/code-organization.md` | Scaffolding new features, creating files, deciding where logic belongs, refactoring |
| **testing-patterns** | `skills/testing-patterns.md` | Writing unit, integration, or E2E tests; debugging test failures |
| **error-security-patterns** | `skills/error-security-patterns.md` | Error handling, input validation, auth, rate limiting, SQL safety |
| **postgres** | `skills/postgres.md` | Schema design, migrations, query optimization, transactions, indexes |

---

## Quick Reference

### Design System — Key Rule
One source of truth: all colors/fonts/spacing live in CSS vars in `client/src/index.css`.
Button variants: `primary | secondary | outline | ghost` — always use `<Button>`, never raw `<button>`.

### API — Key Rule
Always return `{ data: ... }` or `{ error: { code, message } }`.
Validate with Zod before touching the DB. Never interpolate user input into SQL.

### Code Organization — Key Rule
Organize by feature, not by type. Dependencies point inward: UI → hooks → services → utils.
When unsure where something goes, put it in the feature folder first. Move to shared only when a second feature needs it.

### Testing — Key Rule
Test behavior, not implementation. Query by role and label, not class or testId.
Use MSW for API mocking — not module mocks. Co-locate test files with source files.

### Error & Security — Key Rule
Fail loudly internally, fail safely externally. Never expose stack traces, DB errors, or file paths to the client.
Always run argon2.verify even when the user doesn't exist (timing attack prevention).
Refresh tokens in `httpOnly` cookies. Access tokens in memory, not localStorage.

### Postgres — Key Rule
Never concatenate user input into SQL — use parameterized queries or the `sql` tagged template.
Always use `TIMESTAMPTZ`, never `TIMESTAMP`. Index every foreign key column manually — Postgres does not auto-index them.

---

## Agent Domain Map

| Agent | Skills to Read |
|-------|---------------|
| UIAgent | design-system, code-organization |
| APIAgent | api-conventions, error-security-patterns, code-organization |
| DatabaseAgent | postgres, error-security-patterns (SQL safety + DB errors) |
| AuthAgent | error-security-patterns |
| TestAgent | testing-patterns |
| RefactorAgent | code-organization, testing-patterns |
| IntegrationAgent | all |
