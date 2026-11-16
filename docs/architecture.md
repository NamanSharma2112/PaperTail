# Architecture

## Overview

```
 researcher's machine                     server (Next.js)                         PostgreSQL (Aiven or local)
 ───────────────────                      ────────────────                         ─────────────────────────
 papertrail CLI / Experiment ──HTTPS──▶   /api/v1/sdk/*   (ingestion token)  ──▶   owner connection, after token check
 browser ─────────────────────HTTPS──▶    pages + /api/v1/* (session cookie)  ──▶   SET LOCAL ROLE papertrail_app + RLS
                                          /api/auth/*  (Better Auth)          ──▶   user / session / account tables
                                          lib/stats (pure TypeScript)
                                          Crossref · arXiv · OpenAlex (outbound, metadata only)
```

The whole application is one Next.js app in `apps/web`. Server components read through the same service layer (`lib/server/services`) as the API route handlers, so the browser UI and the API enforce the same rules.

## Layers

| Layer | Location | Responsibility |
|---|---|---|
| Pages | `app/(app)`, `app/(auth)`, `app/page.tsx` | Server components fetch data through services; client components call the API with `fetch`. |
| Route handlers | `app/api/v1/**/route.ts` | Parse and validate input (Zod, `lib/schemas.ts`), call one service, map errors to HTTP. |
| HTTP helpers | `lib/server/http.ts` | `userRoute` / `publicRoute`, JSON size limit, UUID checks, error mapping, rate limiting. |
| Services | `lib/server/services/*.ts` | All SQL and business rules. Each takes a `Db` handle that is already scoped to a user or a token. |
| Database access | `lib/server/db.ts` | `withUser(userId, fn)`: a transaction running as the restricted role with the user id set. `withSystem(fn)`: owner connection, used only after a token has been verified, and for profile creation. |
| Statistics | `lib/stats` | Pure functions (mean, SD, t-intervals, difference intervals, tolerance share). |
| Auth | `lib/server/auth.ts` | Better Auth with email and password, sessions in PostgreSQL. |

## Decisions

### PostgreSQL on Aiven, not Supabase

The specification suggested Supabase for the database, authentication and storage. The project owner chose to keep their existing Aiven PostgreSQL. That decision drives the rest of this list:

- **Authentication** is Better Auth, an open-source library whose tables live in the same database (`db/migrations/0001_auth.sql`). Nothing depends on a hosted auth service.
- **Row-level security** is still used, but it can't rely on Supabase's `auth.uid()`. Each request opens a transaction, runs `SET LOCAL ROLE papertrail_app`, and sets `app.user_id`. The policies read that value through `app.uid()`. A query that forgets a `WHERE` clause still sees only the user's own rows. See [security.md](security.md).
- **Artifact storage** uses a PostgreSQL table (`artifact_blobs`, `bytea`) instead of object storage. Files are capped at 2 MB, and each project has a total quota (50 MB by default). This keeps the deployment to two free services and keeps permissions in one place. Large files should stay on the researcher's machine. Moving to S3-compatible storage later only touches `ingest.ts` and the artifact download route.

### One TypeScript app instead of FastAPI plus Next.js

The earlier prototype had a FastAPI backend. The specification asks for Next.js route handlers, and one deployable unit fits a free hosting tier. The statistics, the one place where Python was a strong reason, are handled like this:

- `packages/analysis` is the **reference implementation** in Python, cross-checked against scipy.
- `make_fixtures.py` writes `fixtures/stats_cases.json`.
- `apps/web/tests/stats.test.ts` checks that the TypeScript port reproduces every fixture to within 1e-9 relative error.

### The comparison never decides the outcome

The comparison service computes summaries, differences, intervals and compatibility warnings. A verdict (matched, not matched, inconclusive, blocked) is always entered by the researcher, with a note. The report shows the authors' values, the reproduced values, the computed statistics and the researcher's interpretation as separate things. See [reproduction-methodology.md](reproduction-methodology.md).

### The SDK uses only the standard library

Published research code often pins old interpreters and old dependencies. The client installs into those environments without adding packages that could conflict. It was tested on Python 3.7 and 3.13. It records the environment rather than changing it.

### Runs are created by tokens, not by the browser

Experiment runs arrive only through the SDK endpoints, authenticated by a project-scoped ingestion token. In the browser, users can rename, annotate, cancel or delete runs, but cannot create or alter measured values. That keeps "what the code produced" separate from "what someone typed".

## Request lifecycle (browser)

1. The `(app)` layout resolves the session with Better Auth and redirects signed-out visitors to `/login`.
2. A page loads data through `pageData(fn)`, and an API route is wrapped in `userRoute(handler)`. Each resolves the session again, so an API call without one gets 401. No route relies on the layout alone.
3. `withUser(user.id, db => service(db, …))` runs `BEGIN; SET LOCAL ROLE papertrail_app; SELECT set_config('app.user_id', $1, true)`, runs the service, then commits.
4. RLS policies filter every read and reject unauthorised writes. A row the user cannot see returns 404, never 403, so the existence of other people's projects isn't revealed.

## Request lifecycle (SDK)

1. The `Authorization: Bearer pt_…` header is hashed with SHA-256 and looked up in `ingestion_tokens`. Unknown, revoked and expired tokens return 401.
2. The token's project is the only project the request can touch. A run id from another project returns 404.
3. The request is rate-limited per token and validated by Zod: finite numbers, size limits, safe file names.
4. Run creation is idempotent: the SDK sends an `idempotency_key`, so a retried request returns the existing run.

## Repository layout

```
apps/web/
  app/                 pages and API routes
  components/          UI (components/ui = primitives)
  lib/schemas.ts       every input schema
  lib/stats/           statistics
  lib/server/          db, auth, http, email, services
  scripts/             migrate.mjs, seed-pilot.mjs, pg-config.mjs
  tests/               vitest (unit + integration), e2e (Playwright)
db/migrations/         0001_auth, 0002_core, 0003_rls, 0004_finite_metrics
packages/python-sdk/   papertrail client and CLI
packages/analysis/     reference statistics and fixtures
pilot/                 the GCN reproduction
```
