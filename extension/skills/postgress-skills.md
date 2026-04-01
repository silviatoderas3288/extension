---
name: postgres
description: PostgreSQL schema design, querying, migrations, and connection handling for Node.js/TypeScript backends. Use when writing queries, designing schemas, debugging slow queries, setting up connection pools, writing migrations, or handling transactions. Covers raw SQL patterns, Drizzle ORM, and pg driver best practices.
---

## Core Philosophy

**The database is not an implementation detail.**

Most application bugs live at the data layer — bad schema decisions, missing indexes, unhandled nulls, silent transaction rollbacks, connection pool exhaustion. Understanding what your ORM generates and why is not optional.

Rules of thumb:
- Schema decisions are harder to reverse than application code decisions. Think before you migrate.
- If a query looks expensive, it probably is. `EXPLAIN ANALYZE` before assuming.
- Transactions are not just for rollbacks — they're your consistency guarantee. Use them more than you think you need to.
- Never trust user input in a query. Parameterized queries always.

---

## Stack Assumptions

| Layer | Tool |
|-------|------|
| Database | PostgreSQL 15+ |
| Driver | `pg` (node-postgres) |
| ORM / Query builder | Drizzle ORM |
| Migrations | Drizzle Kit |
| Connection pooling | `pg.Pool` (or PgBouncer in production) |
| Types | TypeScript throughout |

Raw SQL patterns are included alongside ORM examples — knowing both matters.

---

## Connection Pooling

Never create a new `Client` per request. Always use a `Pool`.

```ts
// src/db/pool.ts
import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,                  // max connections in pool
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 2000, // throw if no connection available after 2s
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : false,
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await pool.end();
});
```

### Why these settings matter
- **`max: 20`** — PostgreSQL has a hard connection limit (default 100). Leaving headroom for migrations, admin tools, and replicas matters.
- **`connectionTimeoutMillis`** — without this, a pool exhaustion event hangs requests forever instead of failing fast.
- **`idleTimeoutMillis`** — prevents accumulating stale connections on a long-running server.

### In production: use PgBouncer

Application-level pooling (`pg.Pool`) is fine for moderate load. At scale, use PgBouncer in transaction-mode pooling between your app and Postgres. This lets you run hundreds of app connections through a handful of real DB connections.

---

## Schema Design

### Naming conventions

```sql
-- Tables: snake_case, plural
CREATE TABLE job_listings ( ... );
CREATE TABLE user_accounts ( ... );

-- Foreign keys: {referenced_table_singular}_id
ALTER TABLE job_applications
  ADD COLUMN job_listing_id UUID NOT NULL REFERENCES job_listings(id);

-- Indexes: idx_{table}_{columns}
CREATE INDEX idx_job_listings_location ON job_listings(location);
CREATE INDEX idx_job_applications_user_id ON job_applications(user_id);

-- Constraints: {table}_{columns}_{type}
ALTER TABLE job_listings ADD CONSTRAINT job_listings_slug_unique UNIQUE (slug);
```

### Always-on columns

```sql
CREATE TABLE job_listings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- domain columns below
  title       TEXT NOT NULL,
  location    TEXT NOT NULL,
  salary_min  INTEGER,
  salary_max  INTEGER
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_listings_set_updated_at
  BEFORE UPDATE ON job_listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Use `TIMESTAMPTZ` (with timezone), never `TIMESTAMP`. Store everything in UTC. Convert to local time in the application layer.

### UUIDs vs. serial integers

| | UUID | SERIAL / BIGSERIAL |
|---|---|---|
| **Pros** | No enumeration attack, safe to expose in URLs, merge-friendly across DBs | Smaller, faster index, easier to read in logs |
| **Cons** | 16 bytes vs 4/8, random UUIDs fragment B-tree indexes | Exposes row count, sequential = guessable |
| **Use when** | IDs appear in URLs or APIs | Internal join keys never exposed |

For UUIDs, use `gen_random_uuid()` (UUIDv4, built into Postgres 13+). If insert performance is critical, consider `uuid_generate_v7()` (sequential UUIDs) — they index like integers.

---

## Drizzle ORM: Schema Definition

```ts
// src/db/schema/jobListings.ts
import { pgTable, uuid, text, integer, timestamptz } from 'drizzle-orm/pg-core';

export const jobListings = pgTable('job_listings', {
  id:        uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  title:     text('title').notNull(),
  location:  text('location').notNull(),
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  slug:      text('slug').notNull().unique(),
});

export const jobApplications = pgTable('job_applications', {
  id:           uuid('id').primaryKey().defaultRandom(),
  createdAt:    timestamptz('created_at').notNull().defaultNow(),
  jobListingId: uuid('job_listing_id').notNull().references(() => jobListings.id),
  userId:       uuid('user_id').notNull(),
  status:       text('status', { enum: ['pending', 'reviewed', 'rejected', 'accepted'] })
                  .notNull()
                  .default('pending'),
});

// Infer TypeScript types from schema — no duplication
export type JobListing = typeof jobListings.$inferSelect;
export type NewJobListing = typeof jobListings.$inferInsert;
```

### Drizzle db client setup

```ts
// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from './pool';
import * as schema from './schema';

export const db = drizzle(pool, { schema });
```

---

## Querying

### Basic CRUD (Drizzle)

```ts
import { db } from '@/db';
import { jobListings } from '@/db/schema';
import { eq, and, gte, ilike, desc } from 'drizzle-orm';

// SELECT with filters
const jobs = await db
  .select()
  .from(jobListings)
  .where(
    and(
      eq(jobListings.location, 'NYC'),
      gte(jobListings.salaryMin, 100000),
      ilike(jobListings.title, '%engineer%')
    )
  )
  .orderBy(desc(jobListings.createdAt))
  .limit(20)
  .offset(0);

// INSERT returning the new row
const [newJob] = await db
  .insert(jobListings)
  .values({ title: 'Backend Engineer', location: 'NYC', slug: 'backend-engineer-nyc' })
  .returning();

// UPDATE returning the updated row
const [updated] = await db
  .update(jobListings)
  .set({ title: 'Senior Backend Engineer', updatedAt: new Date() })
  .where(eq(jobListings.id, jobId))
  .returning();

if (!updated) throw new NotFoundError(`Job ${jobId} not found`);

// DELETE
await db.delete(jobListings).where(eq(jobListings.id, jobId));
```

### Raw SQL (when the ORM fights you)

Use `sql` tagged template literals — they're parameterized and safe.

```ts
import { sql } from 'drizzle-orm';
import { db } from '@/db';

// Complex aggregation that Drizzle can't express cleanly
const result = await db.execute(sql`
  SELECT
    location,
    COUNT(*) AS total_listings,
    AVG(salary_min)::INTEGER AS avg_salary_min,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary_min) AS median_salary
  FROM job_listings
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY location
  ORDER BY total_listings DESC
`);
```

Never concatenate user input into SQL strings:
```ts
// ❌ NEVER — SQL injection
const res = await db.execute(`SELECT * FROM jobs WHERE location = '${location}'`);

// ✅ Always — parameterized
const res = await db.execute(sql`SELECT * FROM jobs WHERE location = ${location}`);
```

---

## Transactions

Use transactions when two or more writes must succeed or fail together.

```ts
// src/services/applyToJob.ts
import { db } from '@/db';
import { jobApplications, jobListings } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function applyToJob(userId: string, jobId: string) {
  return await db.transaction(async (tx) => {
    // 1. Lock the job row to prevent concurrent modification
    const [job] = await tx
      .select()
      .from(jobListings)
      .where(eq(jobListings.id, jobId))
      .for('update'); // SELECT ... FOR UPDATE

    if (!job) throw new NotFoundError('Job not found');
    if (!job.acceptingApplications) throw new BadRequestError('Job is closed');

    // 2. Insert the application
    const [application] = await tx
      .insert(jobApplications)
      .values({ userId, jobListingId: jobId })
      .returning();

    // 3. Increment application count (denormalized counter)
    await tx
      .update(jobListings)
      .set({ applicationCount: sql`${jobListings.applicationCount} + 1` })
      .where(eq(jobListings.id, jobId));

    return application;
  });
  // If any step throws, the entire transaction rolls back automatically
}
```

### Transaction gotchas

- **Don't catch and swallow errors inside a transaction** — if you catch and don't re-throw, the transaction commits even when something went wrong.
- **Keep transactions short** — every open transaction holds locks. Long transactions block other writers.
- **Don't do network calls inside a transaction** — calling an external API inside a `db.transaction()` block holds DB locks for the duration of that HTTP request. Extract the network call to before or after.

```ts
// ❌ Network call inside transaction holds locks
await db.transaction(async (tx) => {
  const user = await tx.select()...;
  await sendWelcomeEmail(user.email); // holds DB lock during HTTP call
  await tx.update(users).set({ emailSent: true })...;
});

// ✅ Network call outside transaction
const user = await db.select()...;
await sendWelcomeEmail(user.email);
await db.update(users).set({ emailSent: true })...;
```

---

## Migrations (Drizzle Kit)

```bash
# Generate a migration from schema changes
npx drizzle-kit generate

# Apply pending migrations
npx drizzle-kit migrate

# Inspect current DB state
npx drizzle-kit introspect
```

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Migration discipline

- **Never edit a migration file after it's been committed.** Create a new one.
- **Always review the generated SQL** before applying — Drizzle can't always guess your intent perfectly.
- **Test migrations against a copy of production data** before running them in prod.
- **Make destructive changes in two steps**:
  1. Migration 1: add the new column, backfill data, deploy app code that writes to both
  2. Migration 2: drop the old column (after confirming nothing reads it)

Dropping a column in a single migration alongside an app deploy is how you cause downtime.

---

## Indexes

An unindexed query on a large table is a full sequential scan. This is the most common performance problem in growing apps.

### When to add an index

- Any column used in a `WHERE` clause on a high-traffic query
- Any column used in a `JOIN` condition
- Any column used in `ORDER BY` on paginated queries
- Foreign key columns (Postgres does **not** auto-index foreign keys)

```sql
-- Single column
CREATE INDEX idx_job_listings_location ON job_listings(location);

-- Composite: column order matters — put the most selective column first
CREATE INDEX idx_job_listings_location_created
  ON job_listings(location, created_at DESC);

-- Partial: index only a subset of rows (much smaller, faster)
CREATE INDEX idx_job_listings_active
  ON job_listings(created_at)
  WHERE is_active = true;

-- Unique
CREATE UNIQUE INDEX idx_job_listings_slug ON job_listings(slug);

-- Full-text search
CREATE INDEX idx_job_listings_search
  ON job_listings USING gin(to_tsvector('english', title || ' ' || description));
```

### The cardinal rule of indexes

Indexes speed up reads and slow down writes. Don't index every column. Use `EXPLAIN ANALYZE` to confirm an index is actually being used before committing to it.

---

## EXPLAIN ANALYZE

This is your primary tool for understanding and fixing slow queries. Run it in development against realistic data volumes.

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT j.*, COUNT(a.id) AS application_count
FROM job_listings j
LEFT JOIN job_applications a ON a.job_listing_id = j.id
WHERE j.location = 'NYC'
  AND j.is_active = true
GROUP BY j.id
ORDER BY application_count DESC
LIMIT 20;
```

### Reading the output

| Node type | What it means |
|---|---|
| `Seq Scan` | Full table scan — usually a red flag on large tables |
| `Index Scan` | Using an index |
| `Index Only Scan` | Using an index, never touching heap — fastest |
| `Hash Join` | Joining by building a hash table |
| `Nested Loop` | Joining row-by-row — fine for small sets, bad for large ones |
| `Sort` | Sorting in memory or on disk — disk sort is very slow |

Look for:
- `Seq Scan` on large tables → missing index
- `rows=1 actual rows=50000` → stale statistics, run `ANALYZE tablename`
- `Buffers: shared hit=0 read=8000` → data not cached, may need more `shared_buffers`

---

## Pagination

### Offset pagination (simple, has tradeoffs)

```ts
const PAGE_SIZE = 20;

const jobs = await db
  .select()
  .from(jobListings)
  .orderBy(desc(jobListings.createdAt))
  .limit(PAGE_SIZE)
  .offset(page * PAGE_SIZE);
```

Works fine for small datasets. At large offsets (`OFFSET 10000`), Postgres still scans and discards 10,000 rows — it gets slower as the page number grows.

### Cursor pagination (scalable, recommended for feeds)

```ts
// First page
const jobs = await db
  .select()
  .from(jobListings)
  .orderBy(desc(jobListings.createdAt))
  .limit(PAGE_SIZE + 1); // fetch one extra to know if there's a next page

const hasNextPage = jobs.length > PAGE_SIZE;
const cursor = hasNextPage ? jobs[PAGE_SIZE - 1].createdAt : null;

// Subsequent pages — pass cursor from previous response
const nextJobs = await db
  .select()
  .from(jobListings)
  .where(lt(jobListings.createdAt, cursor))
  .orderBy(desc(jobListings.createdAt))
  .limit(PAGE_SIZE + 1);
```

Cursor pagination is O(log n) per page instead of O(n). Use it for infinite scroll, feeds, or any table that grows large.

---

## N+1 Query Problem

The most common ORM-induced performance problem.

```ts
// ❌ N+1: 1 query for jobs + N queries for applications
const jobs = await db.select().from(jobListings).limit(20);
for (const job of jobs) {
  job.applications = await db
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.jobListingId, job.id));
}

// ✅ 2 queries total: batch fetch and join in memory
const jobs = await db.select().from(jobListings).limit(20);
const jobIds = jobs.map(j => j.id);

const applications = await db
  .select()
  .from(jobApplications)
  .where(inArray(jobApplications.jobListingId, jobIds));

const appsByJobId = groupBy(applications, a => a.jobListingId);
const jobsWithApps = jobs.map(j => ({
  ...j,
  applications: appsByJobId[j.id] ?? [],
}));

// ✅ Or: single query with JOIN (best for small result sets)
const results = await db
  .select()
  .from(jobListings)
  .leftJoin(jobApplications, eq(jobApplications.jobListingId, jobListings.id))
  .limit(20);
```

---

## Error Handling

Postgres surfaces constraint violations and other errors as structured codes. Handle them explicitly.

```ts
// src/db/errors.ts
import { DatabaseError } from 'pg';

export function isUniqueViolation(err: unknown): err is DatabaseError {
  return err instanceof DatabaseError && err.code === '23505';
}

export function isForeignKeyViolation(err: unknown): err is DatabaseError {
  return err instanceof DatabaseError && err.code === '23503';
}

export function isNotNullViolation(err: unknown): err is DatabaseError {
  return err instanceof DatabaseError && err.code === '23502';
}

// Postgres error codes reference:
// 23505 — unique_violation
// 23503 — foreign_key_violation
// 23502 — not_null_violation
// 23514 — check_violation
// 40001 — serialization_failure (retry-able)
// 57014 — query_canceled (statement_timeout hit)
```

```ts
// src/services/createJob.ts
import { isUniqueViolation } from '@/db/errors';

export async function createJob(data: NewJobListing) {
  try {
    const [job] = await db.insert(jobListings).values(data).returning();
    return job;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(`A job with slug "${data.slug}" already exists`);
    }
    throw err; // re-throw unknown errors — don't swallow them
  }
}
```

---

## Soft Deletes

For records that need audit history or may need to be restored.

```sql
ALTER TABLE job_listings ADD COLUMN deleted_at TIMESTAMPTZ;
```

```ts
// "Delete" by setting deleted_at
await db
  .update(jobListings)
  .set({ deletedAt: new Date() })
  .where(eq(jobListings.id, jobId));

// All queries must filter soft-deleted rows
const activeJobs = await db
  .select()
  .from(jobListings)
  .where(isNull(jobListings.deletedAt));
```

The downside of soft deletes is that **every query must remember the filter**. Use a Postgres view or Drizzle's `$with` to avoid forgetting:

```sql
CREATE VIEW active_job_listings AS
  SELECT * FROM job_listings WHERE deleted_at IS NULL;
```

Or consider hard deletes + a separate audit table if the "recover deleted records" requirement doesn't actually exist.

---

## Environment & Configuration

```bash
# .env.local (never commit)
DATABASE_URL=postgresql://user:password@localhost:5432/myapp_dev

# Separate DBs per environment — never share
DATABASE_URL_TEST=postgresql://user:password@localhost:5432/myapp_test
DATABASE_URL_STAGING=postgresql://user:password@staging-host:5432/myapp_staging
```

```ts
// src/db/config.ts — validate at startup, not at query time
const requiredEnv = ['DATABASE_URL', 'DB_POOL_MAX'] as const;

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
```

Fail loudly at startup if config is missing. A server that boots without a DB connection and then crashes on the first request is much harder to debug than one that refuses to start.

---

## Quick Reference: Common Mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Using `TIMESTAMP` instead of `TIMESTAMPTZ` | Timezone bugs in multi-region apps | Always use `TIMESTAMPTZ` |
| No index on foreign keys | Slow JOINs and cascading deletes | Add index on every FK column |
| `SELECT *` in production code | Fetching columns you don't need, fragile to schema changes | Select only the columns you use |
| Long-running transactions | Lock contention, blocking other writers | Keep transactions short; no network calls inside |
| N+1 queries | Exponential DB load as data grows | Batch fetch or JOIN |
| Catching and swallowing DB errors | Silent data corruption | Re-throw unknown errors |
| `OFFSET` pagination on large tables | Slow at high page numbers | Use cursor-based pagination |
| Editing committed migration files | Schema drift between environments | Always create a new migration |
| Single DB connection instead of pool | Serial request handling | Use `pg.Pool` |