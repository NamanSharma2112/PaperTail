# API

All endpoints are under `/api/v1` and exchange JSON, except artifact upload and download.

- **Authentication.** Browser endpoints use the session cookie set by `/api/auth/*` (Better Auth). SDK endpoints (`/api/v1/sdk/*`) use `Authorization: Bearer pt_…`, a project ingestion token.
- **Validation.** Every request body is checked against a schema in `apps/web/lib/schemas.ts`. JSON bodies are limited to 256 KB.
- **Access.** Permissions are enforced by the database (see [security.md](security.md)). A resource you can't see answers 404, whether or not it exists.

## Errors

```json
{ "error": { "code": "validation_failed", "message": "Some fields are not valid", "details": [{ "path": "title", "message": "Required" }] } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_json` | Body is not valid JSON |
| 401 | `unauthenticated`, `invalid_token` | No session, or a missing, unknown, expired or revoked token |
| 403 | `wrong_project` | An SDK token used with another project's id |
| 404 | `not_found`, `paper_not_found` | Missing, or not visible to you; no metadata for that identifier |
| 409 | `conflict`, `version_conflict`, `run_closed`, `invalid_state` | Duplicate key (same DOI, same metric key), stale protocol version, writing to a finished run, cancelling a finished run |
| 413 | `payload_too_large`, `quota_exceeded` | Body over the limit, file over 2 MB, project artifact quota full |
| 422 | `validation_failed`, `invalid_value`, `invalid_reference`, `unrecognised_identifier` | Schema or database check failed; `details` lists the fields |
| 429 | `rate_limited` | Too many requests; retry later |
| 502 | `metadata_unavailable` | Crossref, arXiv or OpenAlex did not answer usefully |

## Health

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{status, database}`; 503 when the database is unreachable. No authentication. |

## Account

| Method | Path | Body / notes |
|---|---|---|
| — | `/api/auth/*` | Better Auth: `sign-up/email`, `sign-in/email`, `sign-out`, `request-password-reset`, `reset-password`, `change-password`, `delete-user`, `get-session`. |
| GET, PATCH | `/me` | Profile: `display_name`, `affiliation`, `avatar_url`. |
| GET | `/dashboard` | Counts, recent projects, recent activity. |

## Papers (personal library)

| Method | Path | Body / notes |
|---|---|---|
| GET | `/papers?q=&status=&tag=` | Your library; `q` searches title, authors, DOI and arXiv ID. |
| POST | `/papers/import` | `{identifier}`: an arXiv ID, a DOI, or any URL containing one (arxiv.org, doi.org, publisher pages). Metadata is looked up from arXiv, Crossref or OpenAlex. 409 if already in your library. Rate-limited to 30 per minute per user. |
| GET, PATCH, DELETE | `/papers/{id}` | PATCH: `reading_status`, `tags`, `notes`, and title or abstract corrections. |

## Projects

| Method | Path | Body / notes |
|---|---|---|
| GET, POST | `/projects` | POST: `title`, `description`, `kind`, optional `paper_id` to link as primary. |
| GET, PATCH, DELETE | `/projects/{id}` | PATCH: title, description, kind, status, outcome, outcome_notes, limitations, code_url, code_commit. DELETE is owner only. |
| POST | `/projects/{id}/papers` | `{paper_id, is_primary}` |
| GET, PUT | `/projects/{id}/protocol` | PUT must send the current `version`; a stale one gets 409. |
| GET, PUT | `/projects/{id}/datasets` | PUT upserts by `key`. |
| DELETE | `/projects/{id}/datasets/{did}` | |
| GET, POST | `/projects/{id}/deviations` | `kind`: environment, code, data or protocol. |
| DELETE | `/projects/{id}/deviations/{did}` | |
| GET, PUT | `/projects/{id}/reported-metrics` | PUT upserts by `key`. Includes the researcher's `tolerance`, `blocked_reason` and `verdict`. |
| DELETE | `/projects/{id}/reported-metrics/{mid}` | |
| GET | `/projects/{id}/comparison` | Computed comparison per reported metric and run group (see [reproduction-methodology.md](reproduction-methodology.md)). |
| GET, POST | `/projects/{id}/discrepancies` | |
| PATCH, DELETE | `/discrepancies/{id}` | |
| GET | `/projects/{id}/runs?status=&group=&q=` | |
| GET | `/projects/{id}/runs/compare?ids=a,b` | Two to four runs side by side: parameters, environment and metrics. |
| GET, PATCH, DELETE | `/runs/{id}` | PATCH: `notes`, `run_group`, or `status: "cancelled"`. Measured values can't be edited. |
| GET | `/runs/{id}/metrics` | |
| GET | `/artifacts/{id}` | Downloads as an attachment with `X-Content-Type-Options: nosniff` and a sandboxing CSP. |
| GET, POST | `/projects/{id}/tokens` | POST `{name, expires_in_days}` returns the token **once**. |
| DELETE | `/projects/{id}/tokens/{tid}` | Revokes. |
| GET | `/projects/{id}/report` | The report as JSON. |
| GET, POST | `/projects/{id}/report/export` | Markdown download. |
| GET | `/projects/{id}/activity` | |
| GET | `/graph` | Nodes and edges for the papers, projects, datasets and references you can see. |

## SDK ingestion

All of these need `Authorization: Bearer pt_…`. They are rate-limited per token (`SDK_RATE_LIMIT_PER_MIN`, default 600).

| Method | Path | Body |
|---|---|---|
| POST | `/sdk/runs` | `project_id` (must match the token), `name`, `run_group`, `idempotency_key`, `seed`, `parameters`, `git {repository, commit, dirty}`, `dataset_version`, `environment {python, os, platform, hardware, packages}`, `command`, `started_at`. Returns 201, or 200 with the existing run when the idempotency key was seen before. |
| POST | `/sdk/runs/{id}/metrics` | `{metrics: [{name, value, unit?, step?}]}`: 1–1000 finite values. |
| POST | `/sdk/runs/{id}/artifacts` | Raw file body; headers `X-File-Name` (URL-encoded, no path) and `Content-Type` (allow-listed). At most 2 MB. |
| POST | `/sdk/runs/{id}/complete` | `completed_at`, `duration_seconds`, optional `parameters` (merged) and `dataset_version`. |
| POST | `/sdk/runs/{id}/fail` | `failure_summary` (required, already redacted by the client), `status` (`failed` or `cancelled`), plus the same optional fields as complete. |

Example:

```bash
curl -X POST "$PAPERTRAIL_URL/api/v1/sdk/runs" \
  -H "Authorization: Bearer $PAPERTRAIL_TOKEN" -H "Content-Type: application/json" \
  -d '{"project_id":"'"$PAPERTRAIL_PROJECT"'","name":"cora seed 1","run_group":"cora","seed":1,"idempotency_key":"cora-1"}'
```
