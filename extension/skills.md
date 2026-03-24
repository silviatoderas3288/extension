# Skills Reference — NYC Jobs 3D Map Platform

> This file is the index. Each skill lives in `skills/` as its own file.
> Agents: read the relevant skill file before working in that domain.

---

## Available Skills

| Skill | File | When to Use |
|-------|------|-------------|
| **explain-code** | [skills/explain-code.md](skills/explain-code.md) | Explaining how code works, teaching, "how does this work?" questions |
| **api-conventions** | [skills/api-conventions.md](skills/api-conventions.md) | Writing any Express route, REST endpoint, or SQL query |
| **design-system** | [skills/design-system.md](skills/design-system.md) | Building any UI component, page, or style |

---

## Quick Reference

### Design System — Key Rule
**One source of truth**: all colors/fonts/spacing live in CSS vars in `client/src/index.css`.
Tailwind config maps to those vars. To retheme the app, change `:root` only.
Button variants: `primary | secondary | outline | ghost` — always use `<Button>` component, never raw `<button>`.

### API — Key Rule
Always return `{ data: ... }` or `{ error: { code, message } }`. Validate with `zod` before touching DB.
Never interpolate user input into SQL — always use parameterized queries (`$1`, `$2`, ...).

### Code Explanation — Key Rule
Lead with an everyday analogy → ASCII diagram → step-by-step walkthrough → one gotcha.

---

## Agent Domain Map

| Agent | Skills to Read |
|-------|---------------|
| MapAgent | explain-code, design-system |
| UIAgent | design-system, explain-code |
| APIAgent | api-conventions |
| DatabaseAgent | api-conventions (SQL safety section) |
| IntegrationAgent | all |
