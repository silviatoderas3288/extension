---
name: api-conventions
description: API design patterns for this codebase
---

When writing API endpoints:
- Use RESTful naming conventions
- Return consistent error formats
- Include request validation

## URL Conventions

```
GET    /api/jobs              → list (with filters as query params)
GET    /api/jobs/map-pins     → lightweight list for map rendering
GET    /api/jobs/:id          → single resource
GET    /api/companies/:id     → single resource
GET    /api/companies/:id/photos → sub-resource
POST   /api/admin/sync        → admin action
GET    /api/health            → system check
```

## Response Shape

### Success (list)
```json
{
  "data": [...],
  "meta": {
    "total": 147,
    "limit": 20,
    "offset": 0
  }
}
```

### Success (single)
```json
{
  "data": { ... }
}
```

### Error
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Job with id 99 not found"
  }
}
```

Always use the same `{ error: { code, message } }` shape — never return bare strings or non-JSON error bodies.

## Validation

Use `zod` to validate all incoming query params and request bodies:

```js
import { z } from 'zod';

const jobsQuerySchema = z.object({
  industry:      z.string().optional(),
  position_type: z.enum(['full-time','part-time','contract','internship']).optional(),
  lat:           z.coerce.number().optional(),
  lng:           z.coerce.number().optional(),
  radius:        z.coerce.number().default(50000),
  limit:         z.coerce.number().min(1).max(100).default(20),
  offset:        z.coerce.number().min(0).default(0),
});
```

Return 400 with the error shape if validation fails. Never let bad params reach the database.

## SQL Safety

Always use parameterized queries — NEVER string interpolation:

```js
// CORRECT
const { rows } = await pool.query(
  'SELECT * FROM jobs WHERE id = $1',
  [jobId]
);

// WRONG — SQL injection risk
const { rows } = await pool.query(
  `SELECT * FROM jobs WHERE id = ${jobId}`
);
```

## HTTP Status Codes

| Situation | Code |
|-----------|------|
| OK | 200 |
| Created | 201 |
| Bad request / validation fail | 400 |
| Unauthorized (missing/wrong auth) | 401 |
| Not found | 404 |
| Server error | 500 |
