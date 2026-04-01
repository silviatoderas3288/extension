---
name: error-security-patterns
description: Error handling, input validation, authentication, and security patterns for Node.js/TypeScript APIs. Mid-to-senior level. Use when building API endpoints, handling auth, dealing with user input, debugging error responses, or hardening an application for production.
---

## Core Principle

**Fail loudly internally. Fail safely externally.**

Every unhandled error is a potential information leak and a guaranteed bad user experience. Every missing validation is a potential injection vector. Security is not a checklist you run at the end — it's a set of defaults you build into every layer from the start.

---

## Stack Assumptions

| Concern | Tool |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express |
| Validation | Zod |
| Auth | JWT (access + refresh tokens) |
| Password hashing | argon2 |
| Rate limiting | `express-rate-limit` |
| Token storage | `httpOnly` cookies |

---

## Error Architecture

### Custom error hierarchy

Define a typed error hierarchy so your error handler can make decisions based on error type, not string matching.

```ts
// src/utils/errors.ts

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(details: { field: string; message: string }[]) {
    super('Validation failed', 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

// Type guard — use this in your error handler
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
```

### Async route wrapper

Eliminates try/catch boilerplate in every route handler. Without this, a forgotten `try/catch` means an unhandled promise rejection that crashes the process (or silently hangs a request in older Node versions).

```ts
// src/utils/asyncHandler.ts
import { Request, Response, NextFunction, RequestHandler } from 'express';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// Usage — no try/catch needed in the route
router.get('/jobs/:id', asyncHandler(async (req, res) => {
  const job = await jobsService.getById(req.params.id);
  if (!job) throw new NotFoundError('Job');
  res.json({ data: job });
}));
```

### Global error handler

The error handler is the single place where errors are logged and serialized to a response. It runs last in the middleware stack.

```ts
// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { isAppError, ValidationError } from '@/utils/errors';
import { logger } from '@/lib/logger';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Structured log — always log the full error internally
  logger.error({
    err,
    req: {
      method: req.method,
      path: req.path,
      // Never log req.body — it may contain passwords or PII
      query: req.query,
      userId: req.user?.id,
    },
  });

  if (isAppError(err)) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err instanceof ValidationError && { details: err.details }),
      },
    });
    return;
  }

  // Handle Postgres constraint violations that escaped service-layer handling
  if (isDatabaseError(err)) {
    if (err.code === '23505') {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Resource already exists' } });
      return;
    }
  }

  // Unknown error — hide internals, return generic message
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

// src/app.ts
app.use(errorHandler); // Must be registered last
```

### What to never log

```ts
// ❌ Never log these — strip from request context before logging
const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'ssn', 'cardNumber'];

// ❌ Never include in error responses
// - Stack traces
// - Database error messages (they leak schema/table names)
// - File paths
// - Internal service URLs
// - Raw SQL

// ✅ Always log (for debugging)
// - Error type and message
// - Request path, method, user ID
// - Timestamp and request ID
// - Stack trace (server-side only)
```

---

## Input Validation

### Zod schemas as the boundary

Define schemas at the entry point — the route. Anything that passes validation is typed and trusted for the rest of the request lifecycle.

```ts
// src/features/jobs/jobs.schema.ts
import { z } from 'zod';

export const createJobSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  location: z.string().trim().min(2).max(100),
  salaryMin: z.number().int().positive(),
  salaryMax: z.number().int().positive(),
  companyId: z.string().uuid(),
}).refine(
  data => data.salaryMax >= data.salaryMin,
  { message: 'salaryMax must be >= salaryMin', path: ['salaryMax'] }
);

export const jobQuerySchema = z.object({
  location: z.string().trim().optional(),
  salaryMin: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// Infer types from schemas — no duplication
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type JobQuery = z.infer<typeof jobQuerySchema>;
```

### Validation middleware factory

```ts
// src/middleware/validate.ts
import { z, ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@/utils/errors';

type Target = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const details = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError(details);
    }

    // Attach typed, validated data to request
    req[target] = result.data;
    next();
  };
}

// Usage
router.post(
  '/jobs',
  authenticate,
  validate(createJobSchema, 'body'),
  asyncHandler(jobsController.create),
);

router.get(
  '/jobs',
  validate(jobQuerySchema, 'query'),
  asyncHandler(jobsController.list),
);
```

### Never trust optional chaining for security checks

```ts
// ❌ This silently passes if user is undefined
if (req.user?.role === 'admin') { ... }

// ✅ Be explicit — missing user should be an error, not a false negative
if (!req.user) throw new UnauthorizedError();
if (req.user.role !== 'admin') throw new ForbiddenError();
```

---

## Authentication

### Token architecture: access + refresh

A single long-lived JWT is a liability — if it leaks, an attacker has access until it expires. The access + refresh pattern limits the blast radius.

```
Access token:  short-lived (15 minutes), sent with every request
Refresh token: long-lived (7 days), used only to get a new access token
```

**Where to store them:**

| Storage | XSS risk | CSRF risk | Verdict |
|---|---|---|---|
| `localStorage` | ✅ Exposed | ❌ None | Never use for tokens |
| Memory (JS var) | ❌ Not exposed | ❌ None | Good for access token |
| `httpOnly` cookie | ❌ Not exposed | ✅ Exposed | Good for refresh token + CSRF mitigation |

```ts
// src/features/auth/auth.service.ts
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { UnauthorizedError } from '@/utils/errors';

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET!;

// Two separate secrets — compromising one doesn't compromise both
export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'access' }, ACCESS_TOKEN_SECRET, {
    expiresIn: '15m',
    algorithm: 'HS256',
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, REFRESH_TOKEN_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });
}

export async function login(email: string, password: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase().trim()),
  });

  // Constant-time comparison — always run argon2.verify even if user not found
  // to prevent user enumeration via timing attack
  const passwordValid = user
    ? await argon2.verify(user.passwordHash, password)
    : await argon2.verify('$argon2id$v=19$m=65536,t=3,p=4$fakehash', password);

  if (!user || !passwordValid) {
    // Same error message whether email or password is wrong
    // Never reveal which one failed — that's user enumeration
    throw new UnauthorizedError('Invalid credentials');
  }

  return {
    accessToken: signAccessToken(user.id),
    refreshToken: signRefreshToken(user.id),
    user: { id: user.id, email: user.email, role: user.role },
  };
}

export async function hashPassword(password: string): Promise<string> {
  // argon2id is the recommended variant (resistant to GPU and side-channel attacks)
  // Never use bcrypt for new projects — argon2 won the Password Hashing Competition
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 });
}
```

### Authentication middleware

```ts
// src/middleware/authenticate.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '@/utils/errors';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  // Access token comes from Authorization header (not cookie — short-lived, memory-stored)
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError();
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as jwt.JwtPayload;

    if (payload.type !== 'access') throw new UnauthorizedError('Invalid token type');

    req.user = { id: payload.sub!, role: payload.role };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired');
    }
    throw new UnauthorizedError('Invalid token');
  }
}

// Authorization — call after authenticate
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) throw new ForbiddenError();
    next();
  };
}

// Usage
router.delete('/jobs/:id', authenticate, requireRole('admin', 'moderator'), asyncHandler(...));
```

### Token refresh endpoint

```ts
// src/features/auth/auth.controller.ts
export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies['refresh_token'];
  if (!refreshToken) throw new UnauthorizedError();

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as jwt.JwtPayload;
  } catch {
    // Clear the invalid cookie
    res.clearCookie('refresh_token');
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  if (payload.type !== 'refresh') throw new UnauthorizedError();

  // Optionally: verify the token is in an allowlist (DB) for logout-everywhere support
  const newAccessToken = signAccessToken(payload.sub!);

  res.json({ accessToken: newAccessToken });
});

// Login sets the refresh token as httpOnly cookie
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);

  res.cookie('refresh_token', result.refreshToken, {
    httpOnly: true,         // JS cannot read this cookie — XSS protection
    secure: true,           // HTTPS only
    sameSite: 'strict',     // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: '/api/auth',      // Cookie only sent to /api/auth routes
  });

  // Access token in response body — client stores in memory (not localStorage)
  res.json({ accessToken: result.accessToken, user: result.user });
});
```

---

## SQL Safety

### Parameterize everything — no exceptions

```ts
// ❌ SQL injection — never do this
const jobs = await db.execute(`SELECT * FROM jobs WHERE location = '${location}'`);

// ✅ Drizzle ORM (parameterized under the hood)
const jobs = await db.select().from(jobListings).where(eq(jobListings.location, location));

// ✅ Raw SQL with tagged template (also parameterized)
const jobs = await db.execute(sql`SELECT * FROM jobs WHERE location = ${location}`);
```

### The race condition you'll hit eventually

Don't check-then-insert. Let the database enforce uniqueness.

```ts
// ❌ Race condition — two concurrent requests both pass the SELECT,
//    then both INSERT, creating a duplicate
const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
if (existing) throw new ConflictError('Email already in use');
await db.insert(users).values({ email, ... });

// ✅ Let the DB unique constraint handle it, catch the violation
try {
  await db.insert(users).values({ email, passwordHash, ... });
} catch (err) {
  if (isUniqueViolation(err)) {
    throw new ConflictError('Email already in use');
  }
  throw err;
}

// src/db/errors.ts
import { DatabaseError } from 'pg';

export function isUniqueViolation(err: unknown): err is DatabaseError {
  return err instanceof DatabaseError && err.code === '23505';
}

export function isForeignKeyViolation(err: unknown): err is DatabaseError {
  return err instanceof DatabaseError && err.code === '23503';
}
```

---

## Rate Limiting

Rate limiting is not just for login. Think about what an attacker or a runaway client could do to any endpoint.

```ts
// src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';

// Tight limit for auth endpoints — brute force protection
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in 15 minutes.' } },
  skipSuccessfulRequests: true, // Only count failures — successful logins don't count toward limit
});

// Looser limit for general API — protection against runaway clients
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tight limit for expensive operations
export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
});

// Apply in app.ts
app.use('/api', apiRateLimiter);
app.post('/api/auth/login', authRateLimiter, asyncHandler(authController.login));
app.post('/api/auth/forgot-password', authRateLimiter, asyncHandler(authController.forgotPassword));
app.get('/api/jobs/search', searchRateLimiter, asyncHandler(jobsController.search));
```

### Endpoints that always need tight rate limiting

- Login / signup
- Password reset request (also consider: same limit per email address, not just IP)
- OTP / 2FA verification
- Email verification resend
- Any endpoint that sends email or SMS
- Any computationally expensive operation (search, export, report generation)

---

## CORS

```ts
// src/app.ts
import cors from 'cors';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') ?? [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed`));
    }
  },
  credentials: true,          // Required for cookies (refresh token)
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,              // Preflight cached for 24h — reduces OPTIONS requests
}));

// .env
// ALLOWED_ORIGINS=https://myapp.com,https://staging.myapp.com
```

**Never use `origin: '*'` with `credentials: true`** — browsers block this combination, and it also defeats the purpose of CORS.

---

## Security Headers

```ts
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // tighten if you can
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,         // 1 year
    includeSubDomains: true,
    preload: true,
  },
}));
```

Helmet sets ~14 security-relevant headers by default. `contentSecurityPolicy` is the one that needs tuning per app.

---

## Environment & Secrets

```ts
// src/config/env.ts — validate at process start, not at runtime
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  ALLOWED_ORIGINS: z.string(),
  PORT: z.coerce.number().default(3000),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment configuration:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1); // Hard exit — don't start a misconfigured server
}

export const env = result.data;
```

### Secrets that always need rotation capability

- JWT signing secrets (have a plan for rotation without logging everyone out)
- Database credentials
- Third-party API keys
- Encryption keys

Use a secrets manager (AWS Secrets Manager, Doppler, Vault) in production — don't rely on `.env` files on servers.

---

## Error Response Contract

Consistent shape across all errors — frontend can rely on this structure.

```ts
// Successful response
{
  "data": { ... }
}

// Error response — always this shape
{
  "error": {
    "code": "NOT_FOUND",          // machine-readable, stable string
    "message": "Job not found",   // human-readable, may change
    "details": [                  // optional, present for VALIDATION_ERROR only
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

Standard error codes your frontend should handle:

| Code | Status | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Input failed schema validation |
| `UNAUTHORIZED` | 401 | No valid auth token |
| `FORBIDDEN` | 403 | Valid token, insufficient permissions |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Unique constraint / resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unhandled server error |

---

## What to Audit When Reviewing for Security

**Authentication:**
- [ ] Are JWT secrets long (32+ chars), random, and environment-specific?
- [ ] Are access tokens short-lived (≤15 min)?
- [ ] Is the refresh token in an `httpOnly`, `secure`, `sameSite=strict` cookie?
- [ ] Does login return the same error for wrong email and wrong password?
- [ ] Is password hashing using argon2id (not bcrypt, not MD5, never plaintext)?

**Authorization:**
- [ ] Is every protected route running `authenticate` middleware?
- [ ] Are ownership checks explicit? (e.g., `job.userId !== req.user.id` → 403, not just "not found")
- [ ] Are admin/role checks applied as close to the route as possible?

**Input handling:**
- [ ] Is every request body and query string validated with Zod before use?
- [ ] Is all user-supplied data parameterized in SQL queries?
- [ ] Are file uploads validated for type and size before processing?

**Infrastructure:**
- [ ] Is rate limiting applied to auth endpoints?
- [ ] Is CORS configured with an explicit allowlist?
- [ ] Is `helmet` applied?
- [ ] Are environment variables validated at startup?
- [ ] Is `NODE_ENV=production` set in prod (disables stack traces in some frameworks)?
- [ ] Are dependencies up to date? (`npm audit`)