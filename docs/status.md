# Status

Last updated: 16 November 2026.

## Implemented

| Module | What works |
|---|---|
| Authentication | Sign up, sign in and sign out (Better Auth, email and password). Password reset by email (Resend), or by a link written to the server log when email isn't configured. Change password, edit profile, delete account. |
| Paper library | Import by arXiv ID, DOI or URL (arXiv, Crossref, with OpenAlex as fallback). Duplicate detection. Reading status, tags, notes, search and filters. Paper detail page. |
| Projects | Create from a paper. Kind (reproduction, reimplementation, replication), status and outcome. Code link and commit. Limitations. Delete (owner only). |
| Workspace tabs | Overview (missing-information checklist, activity), Paper, Protocol (with per-field provenance and optimistic locking), Experiments, Results, Discrepancies, Report, Settings. |
| Experiment tracking | Python SDK and CLI. Run list with filters, run detail (parameters, environment, metrics, artifacts, failure summary), compare 2–4 runs, notes, regrouping, cancel, delete. |
| Statistical comparison | Per published result and run group: summary, t-interval, difference, interval for the difference under a stated assumption, share within tolerance, 12 compatibility checks. Strip plots of individual runs. |
| Discrepancies and deviations | Category, severity, and cause status (suspected, confirmed or ruled out). Resolution workflow. |
| Reports | Structured report page, Markdown export, print-to-PDF stylesheet. |
| Ingestion tokens | Project-scoped, hashed, prefix shown, expiry, revocation, last used. |
| Security | Row-level security on every table through a restricted role, column grants, Zod validation, rate limits, safe artifact downloads, security headers. |
| Graph | Papers, projects, datasets and references, with a radial layout. |
| Demo data | The GCN pilot (400 real runs) can be loaded into any account. It is marked "Demonstration data". |
| Operations | Docker Compose (bundled PostgreSQL or Aiven), migrations with checksums, a health endpoint, a CI workflow. |

## Tested (actually run, 15–16 November 2026)

| Suite | Result |
|---|---|
| Vitest: statistics against scipy fixtures, comparison rules, parsers, validation, report | pass |
| Vitest: database and row-level-security tests against PostgreSQL 16, including the artifact quota | pass. 42 tests in total with the unit tests. |
| Playwright, the 14-step workflow (register, import a paper, create a project, protocol, published results, token, SDK runs from Python, comparison, verdict, discrepancy, report, export, second user sees nothing, token used on another project gets 403) | pass, against the Docker production build |
| Python SDK (pytest) | 16 passed on Python 3.13 and on Python 3.7 (python:3.7-slim container) |
| Reference statistics (pytest) | 9 passed |
| Demo loader | Loads 400 runs. A second run does nothing. |
| Manual API checks with curl | Duplicate import 409, token idempotency, 413 and 422 limits, revocation, cross-user 404 |
| Manual password reset | Old password rejected, new password accepted, reset link single-use, unknown email gets the same answer as a known one |

The CI workflow (`.github/workflows/ci.yml`) is written but **has not run on GitHub yet**. Its first run may need small fixes.

## Not done or not verified

- **Not deployed anywhere.** [deployment.md](deployment.md) describes Vercel Hobby with Aiven, and Docker.
- **Aiven not tested from here.** The sandbox's network refuses connections to Aiven's port. The same code connects to a local PostgreSQL with `sslmode` handling that follows libpq. Test on your machine with the commands in the README.
- **No member-invitation UI.** Roles (owner, editor, viewer) exist and are enforced by the database. Adding members needs SQL for now.
- **Email verification is not required** at sign-up. There is no multi-factor authentication.
- **No in-app notifications.**
- **PDF export** goes through the browser's print dialog. No server-side PDF is generated.
- **References for newly imported papers** aren't fetched automatically (OpenAlex now needs a key for batch use). Only the demo has references in the graph.
- **Rate limiting is per server instance** (in memory).
- **Redaction is best-effort.** Secrets hardcoded in source can appear in tracebacks.
- **No MLflow importer** yet (proposed in the feasibility assessment).

## Decisions taken that differ from the specification

| Specification | Done instead | Why |
|---|---|---|
| Supabase (database, auth, storage) | Aiven PostgreSQL, Better Auth, artifacts in PostgreSQL | The project owner chose to keep their Aiven database. See [architecture.md](architecture.md). |
| Storage bucket for artifacts | `artifact_blobs` table, 2 MB per file, 50 MB per project | No object store on the free stack. The quota protects Aiven's 1 GB. |
| — | Verdicts are entered, never computed | The specification forbids presenting interpretation as fact. |

## Next milestone

1. Run CI on GitHub and fix what it finds.
2. Deploy to Vercel with Aiven, then run the post-deploy checks in [deployment.md](deployment.md).
3. Member invitations (by email, with a role) and a members list in project Settings.
4. Email verification.
5. MLflow run importer, and automatic reference import with an OpenAlex key.
6. Interviews with ML Reproducibility Challenge participants, using the demo project. See the [feasibility assessment](feasibility-assessment.md).
