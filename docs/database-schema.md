# Database schema

PostgreSQL 14 or later. Tested on 16. The schema is plain SQL in `db/migrations`. `apps/web/scripts/migrate.mjs` applies it in filename order and records each file's SHA-256 checksum in `schema_migrations`. If an applied migration file is later edited, the script refuses to run. Changes go in a new file.

| Migration | Contents |
|---|---|
| `0001_auth.sql` | Better Auth tables: `user`, `session`, `account`, `verification`. |
| `0002_core.sql` | Schema `app`, domain `app.provenance`, all application tables, the owner-membership trigger. |
| `0003_rls.sql` | Role `papertrail_app`, helper functions, grants, row-level-security policies, the run-status guard. |
| `0004_finite_metrics.sql` | Rejects NaN and ±Infinity in measured and reported numbers. Postgres treats `NaN = NaN` as true, so the first check in 0002 was ineffective. |

```bash
cd apps/web && DATABASE_URL=… npm run db:migrate
```

## Entities

```
user ─1:1─ profiles
user ─1:n─ papers ─1:n─ paper_references
user ─1:n─ projects ─1:n─ project_members (owner | editor | viewer)
                    ─n:m─ papers            (project_papers, one primary)
                    ─1:1─ protocols
                    ─1:n─ datasets, deviations, reported_metrics, discrepancies
                    ─1:n─ experiment_runs ─1:n─ run_metrics
                                          ─1:n─ artifacts ─1:1─ artifact_blobs
                    ─1:n─ ingestion_tokens
                    ─1:n─ activity_events
```

## Tables

### Library

- **papers**: one copy per user. The same DOI or arXiv ID can't be imported twice by one user (partial unique indexes); DOIs are stored in lower case. The table holds title, abstract, authors (JSON array), year, venue, publisher, links and `metadata_source` (arxiv, crossref, openalex or manual). There are also personal fields: `reading_status`, `tags` and `notes`. A paper linked to a project is readable by that project's members.
- **paper_references**: works a paper cites, as listed by a bibliographic source. Used by the graph.

### Projects

- **projects**: `kind` is computational_reproduction, reimplementation or replication. `status` is planning, in_progress, completed, blocked or archived. `outcome` holds the researcher's overall conclusion and is never computed. There are also `limitations`, the code link and commit, and `is_demo`, which marks demonstration data.
- **project_members**: a role per user. The owner row is created by a trigger when the project is inserted.
- **project_papers**: links papers to a project. At most one is primary.

### Protocol

- **protocols**: one per project. Text fields for objective, hypothesis, methodology, model, dataset, preprocessing, training and evaluation. `experimental_setup` is JSON (hyperparameters, seeds, splits, hardware, frameworks). `assumptions` is text. `evidence` maps a field name to `{source, note, link}`, where `source` takes the `app.provenance` values: `reported` (stated in the paper), `implementation` (found in the authors' code), `inferred`, `selected` (chosen by the researcher) or `unknown`. `version` provides optimistic locking: a save with a stale version gets 409.
- **datasets**: key, name, availability, link, version and derivation sources.
- **deviations**: changes relative to the original method. `kind` is environment, code, data or protocol. Each records what changed, why, the expected effect and what it applies to.

### Experiments

- **experiment_runs**: one execution. It belongs to a `run_group`: runs that share a configuration and differ only by seed. Other fields: status, git repository, commit and dirty flag, dataset version, Python version, OS, hardware (JSON), seed, parameters (JSON), environment metadata (JSON, including installed packages), command, timestamps, duration, failure summary, notes. `idempotency_key` is unique per project, so retried SDK requests do not duplicate runs. Measured fields can be written only through the SDK path. Through the browser, users can change `notes` and `run_group`, and can change `status` only to `cancelled` (trigger `app.guard_run_status`).
- **run_metrics**: name, value (finite double), unit, step. Only the SDK path writes them. When a run logs a metric at several steps, the comparison uses the highest step.
- **artifacts** and **artifact_blobs**: a file name without path separators, a type from an allow-list, size ≤ 2 MB, and a SHA-256 checksum. The content is stored separately so listings don't load bytes. Total size is limited per project (`ARTIFACT_PROJECT_QUOTA_MB`, default 50).

### Comparison and findings

- **reported_metrics**: a number the paper reports. Fields:
  - Identity: `key`, `label`, `metric_name` (must equal the name runs log), value, unit.
  - `run_value_scale`: for example 100 when runs log 0.815 and the paper says 81.5%.
  - `direction`: higher, lower or none.
  - Aggregation: `aggregation`, `reported_runs`, `dispersion` and `dispersion_kind`.
  - Context: dataset, `source_reference` (for example "Table 2"), conditions, provenance.
  - `run_groups`: which groups to compare. Empty means every group that logged the metric.
  - Researcher-entered: `tolerance` with its reason, `blocked_reason`, and `verdict` (matched, not_matched, inconclusive or blocked) with a note.
- **discrepancies**: a finding linked optionally to a run and a reported metric. `category` is one of missing_information, dataset_difference, dependency_conflict, preprocessing_difference, hardware_difference, hyperparameter_difference, implementation_difference, statistical_variation or other. `severity` is low to critical. `explanation` comes with a `cause_status`: suspected, confirmed or ruled_out, so a suspicion is never shown as a fact. Also `evidence` and `resolution_status`.

### Access and audit

- **ingestion_tokens**: SHA-256 hash only (`token_hash`, never readable by the app role), a display prefix, name, expiry, revocation time and last use.
- **activity_events**: an append-only project log (kind, summary, actor, time).

## Row-level security

Every application table has RLS enabled. Policies apply to the role `papertrail_app`, which the app switches to for each request (`SET LOCAL ROLE`). The current user id comes from `current_setting('app.user_id')` through `app.uid()`.

| Helper | Meaning |
|---|---|
| `app.project_role(p)` | The current user's role in project `p`, or null. `SECURITY DEFINER`, so policies can consult memberships without recursion. |
| `app.can_read(p)` | Any role. |
| `app.can_edit(p)` | owner or editor. |
| `app.is_owner(p)` | owner. |

| Table | Read | Write |
|---|---|---|
| profiles | own | own |
| papers | own, or linked to a readable project | own |
| projects | members | insert: self as owner. Update: editors, limited to the listed columns. Delete: owner. |
| project_members | members | owner, except the owner row itself |
| protocols, datasets, deviations, reported_metrics, discrepancies, project_papers | members | editors |
| experiment_runs | members | editors: notes, run_group, cancel. Delete. No insert. |
| run_metrics, artifacts, artifact_blobs | members | none, except editors may delete artifacts |
| ingestion_tokens | editors (hash column not granted) | editors: create, rename, revoke |
| activity_events | members | members (insert only) |

Column-level grants back this up. For example, the app role can't update `projects.owner_id` or `projects.is_demo`, can't select `ingestion_tokens.token_hash`, and has no insert grant on runs or metrics. The tests in `apps/web/tests/integration/security.test.ts` check these rules against a real database.
