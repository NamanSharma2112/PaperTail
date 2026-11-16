# Security model

## What is protected, and from whom

- **Users' data from other users.** A user sees only their own library and the projects they are a member of. This is enforced by PostgreSQL row-level security, not only by application code.
- **Projects from leaked ingestion tokens.** A token can only add runs to one project. It can't read data, edit the protocol, or touch other projects, and it can be revoked or set to expire.
- **The server from research code.** The server never runs, imports, unpickles or renders anything a user uploads. Artifacts are stored as bytes and returned as downloads.
- **Secrets from the record.** The SDK redacts known secret formats before sending, and the server never logs passwords or tokens.

## Authentication

Better Auth with email and password:

- Passwords are 10–128 characters and are hashed by Better Auth (scrypt).
- Sessions are database-backed, last 14 days, and are refreshed daily. The cookie is httpOnly and SameSite=Lax, and Secure on HTTPS.
- Password reset links expire after 30 minutes and can be used once. A reset signs out every other session. A request for an unknown email gets the same response as a known one.
- Changing the password signs out other sessions. Deleting the account requires the password and cascades to everything the user owns.
- Better Auth's rate limiter is on for its endpoints: 60 requests per minute per IP, per instance.
- Email verification is **not** required at sign-up. See [status.md](status.md).

## Authorisation: row-level security

The application connects as the database owner. For each request it opens a transaction, switches to the restricted role and records the user:

```sql
BEGIN;
SET LOCAL ROLE papertrail_app;
SELECT set_config('app.user_id', $1, true);
-- service queries
COMMIT;
```

`papertrail_app` is `NOLOGIN`. On PostgreSQL 16 and later it is granted with `INHERIT FALSE`, so the owner doesn't silently gain its permissions. Every table has RLS enabled, with policies written for this role (see [database-schema.md](database-schema.md)). As a result:

- A service query with a missing `WHERE project_id = …` still returns only rows the user can see.
- Writes the user isn't allowed to make fail in the database (`42501`). The API turns that into 404, logs a warning, and never says whether the row exists.
- Column-level grants stop the app role from writing measured run data, changing a project's owner or demo flag, or reading token hashes.

`withSystem` (owner, RLS bypassed) is used in exactly two places. Both are reviewed:

1. **SDK ingestion**, only after the token has been verified. Every query is then constrained to the token's `project_id`, and a run belonging to another project returns 404.
2. **Profile creation** in the Better Auth sign-up hook.

The integration tests (`apps/web/tests/integration/security.test.ts`) check these rules against a real PostgreSQL:

- Non-members can't see, change, delete or insert into another user's project.
- With no user id set, nothing is visible.
- Auth tables aren't readable by the app role.
- Viewers can't write; editors can't delete the project or manage members; nobody can promote themselves to owner.
- Runs can only be cancelled through the app role, never completed or rewritten.
- Token hashes can't be read; tokens verify, revoke and expire.
- A user can't create a token for someone else's project.
- Deleting a project cascades.
- Constraints reject NaN, infinity and invalid values.

That a token for project A can't write to project B (403/404) was checked against the running API with curl, and the end-to-end test covers it as well.

## Ingestion tokens

- Format: `pt_` followed by 32 random bytes (base64url), 256 bits of entropy.
- Only the SHA-256 hash is stored. The full token is shown once, at creation. The UI shows a 10-character prefix to tell tokens apart.
- Optional expiry. Revocation is immediate. `last_used_at` is updated on use.
- Tokens are sent as `Authorization: Bearer`. The CLI advises against passing them as flags, because flags end up in shell history.
- Rate limit per token: `SDK_RATE_LIMIT_PER_MIN`, default 600.

## Input handling

- Every request body is validated with Zod (`lib/schemas.ts`): lengths, enums, UUIDs, finite numbers, URL schemes limited to http(s), and JSON bodies of at most 256 KB.
- The database repeats the critical checks (enums, finite values, file-name rules, sizes), so a bug in the API can't store invalid data.
- SQL is always parameterised.
- Paper metadata from Crossref, arXiv and OpenAlex is treated as untrusted text. It is stored as plain text and rendered by React, which escapes it. JATS markup in abstracts is stripped, not rendered.

## Artifacts

- At most 2 MB per file. The total per project is capped (`ARTIFACT_PROJECT_QUOTA_MB`, default 50). Only allow-listed content types are accepted. File names can't contain path separators. A SHA-256 checksum is recorded.
- Downloads are always served with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. An uploaded HTML or SVG file can't run script in the app's origin.
- Python pickles, model checkpoints and the like are never loaded or inspected on the server.

## HTTP headers

`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and a restrictive `Permissions-Policy` are set on every response (`next.config.ts`).

## Secrets

- No secrets are committed. `.env`, `.env.local` and `.env.*.local` are git-ignored. `.env.example` holds names only.
- Docker generates `BETTER_AUTH_SECRET` into a volume if none is given. Production must set it explicitly.
- The database connection uses TLS when the URL asks for it. Set `DATABASE_CA_CERT` to also verify the server certificate.
- **If a database password has been shared in chat, email or a ticket, rotate it** in the provider's console and update `.env` and the hosting provider's settings.

## Known limitations

- **Rate limiting is in memory, per server instance.** On serverless hosting each instance counts separately. A shared store (for example Redis) would be needed for strict limits.
- **Redaction is best-effort.** A secret written literally in source code can appear in a traceback line, and unknown secret formats aren't recognised. Researchers should review failure summaries before sharing a report.
- **No email verification and no multi-factor authentication** yet.
- **No audit of reads.** `activity_events` records changes, not who viewed what.
- **Owner connection.** The app's database user owns the schema. A server compromise is a database compromise. Using a separate non-owner login role is a possible hardening step.
