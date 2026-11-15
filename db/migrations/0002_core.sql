-- PaperTrail research data.
--
-- Conventions: uuid primary keys, timestamptz, explicit check constraints for every
-- enumerated value, jsonb only for genuinely open-ended structures (hyperparameters,
-- environment snapshots, per-field provenance).

create extension if not exists pgcrypto;  -- gen_random_uuid() on Postgres < 13

create schema if not exists app;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Where a stated fact comes from. Used for protocol fields and reported metrics.
-- reported: stated by the original authors. implementation: read from the official code.
-- inferred: the researcher's reading. selected: chosen by the researcher.
-- unknown: not reported anywhere.
create domain app.provenance as text
  check (value in ('reported', 'implementation', 'inferred', 'selected', 'unknown'));

-- ---------------------------------------------------------------- profiles

create table profiles (
  id text primary key references "user" ("id") on delete cascade,
  display_name text not null default '',
  affiliation text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on profiles for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------- papers (personal library)

create table papers (
  id uuid primary key default gen_random_uuid(),
  created_by text not null references "user" ("id") on delete cascade,
  title text not null check (length(title) between 1 and 1000),
  abstract text,
  authors jsonb not null default '[]' check (jsonb_typeof(authors) = 'array'),
  doi text check (doi is null or doi = lower(doi)),
  arxiv_id text,
  publication_year int check (publication_year is null or publication_year between 1600 and 2200),
  venue text,
  publisher text,
  landing_url text,
  pdf_url text,
  metadata_source text not null check (metadata_source in ('arxiv', 'crossref', 'openalex', 'manual')),
  reading_status text not null default 'to_read'
    check (reading_status in ('to_read', 'reading', 'read', 'reproducing', 'reproduced')),
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One copy of a paper per library: the same identifier cannot be imported twice by one user.
create unique index papers_owner_doi on papers (created_by, doi) where doi is not null;
create unique index papers_owner_arxiv on papers (created_by, arxiv_id) where arxiv_id is not null;
create index papers_owner_created on papers (created_by, created_at desc);
create trigger papers_touch before update on papers for each row execute function app.touch_updated_at();

-- Works a paper cites, as listed by a bibliographic source such as OpenAlex.
create table paper_references (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references papers (id) on delete cascade,
  title text not null,
  year int,
  authors jsonb not null default '[]',
  doi text,
  arxiv_id text,
  openalex_id text,
  cited_by_count int,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create index paper_references_paper on paper_references (paper_id);

-- ---------------------------------------------------------------- projects

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references "user" ("id") on delete cascade,
  title text not null check (length(title) between 1 and 300),
  description text,
  kind text not null default 'computational_reproduction'
    check (kind in ('computational_reproduction', 'reimplementation', 'replication')),
  status text not null default 'planning'
    check (status in ('planning', 'in_progress', 'completed', 'blocked', 'archived')),
  -- The researcher's overall conclusion. Never computed by the application.
  outcome text check (outcome in ('successful', 'partial', 'blocked', 'inconclusive', 'not_reproduced')),
  outcome_notes text,
  limitations text,
  code_url text,
  code_commit text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner on projects (owner_id, updated_at desc);
create trigger projects_touch before update on projects for each row execute function app.touch_updated_at();

create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  user_id text not null references "user" ("id") on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create index project_members_user on project_members (user_id);

create table project_papers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  paper_id uuid not null references papers (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, paper_id)
);
create unique index project_papers_one_primary on project_papers (project_id) where is_primary;
create index project_papers_paper on project_papers (paper_id);

-- ---------------------------------------------------------------- protocol

create table protocols (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects (id) on delete cascade,
  research_objective text,
  hypothesis text,
  methodology text,
  model_information text,
  dataset_information text,
  preprocessing text,
  training_procedure text,
  evaluation_method text,
  -- {hyperparameters: {...}, seeds: "...", splits: "...", hardware: "...", frameworks: "..."}
  experimental_setup jsonb not null default '{}' check (jsonb_typeof(experimental_setup) = 'object'),
  assumptions text,
  -- {field_name: {source: provenance, note: text, link: url}}
  evidence jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object'),
  version int not null default 1,
  updated_by text references "user" ("id") on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger protocols_touch before update on protocols for each row execute function app.touch_updated_at();

create table datasets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  key text not null check (key ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$'),
  name text not null,
  status text not null default 'available' check (status in ('available', 'partial', 'unavailable')),
  url text,
  version text,
  note text,
  -- [{relation, title, arxiv_id, doi, year}]
  sources jsonb not null default '[]' check (jsonb_typeof(sources) = 'array'),
  created_at timestamptz not null default now(),
  unique (project_id, key)
);

-- Changes made relative to the original method (environment, code, data, protocol).
create table deviations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  key text not null,
  kind text not null check (kind in ('environment', 'code', 'data', 'protocol')),
  what text not null,
  why text,
  expected_effect text,
  applies_to text,
  created_at timestamptz not null default now(),
  unique (project_id, key)
);

-- ---------------------------------------------------------------- experiments

create table experiment_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  -- Runs that share a configuration and differ only by seed share a group.
  run_group text not null default 'default' check (run_group ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$'),
  status text not null default 'running' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  git_repository text,
  git_commit text,
  git_dirty boolean,
  dataset_version text,
  python_version text,
  operating_system text,
  hardware_information jsonb not null default '{}',
  seed bigint,
  parameters jsonb not null default '{}' check (jsonb_typeof(parameters) = 'object'),
  environment_metadata jsonb not null default '{}' check (jsonb_typeof(environment_metadata) = 'object'),
  command text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds double precision check (duration_seconds is null or duration_seconds >= 0),
  failure_summary text,
  notes text,
  idempotency_key text,
  token_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, idempotency_key)
);
create index experiment_runs_project on experiment_runs (project_id, created_at desc);
create index experiment_runs_group on experiment_runs (project_id, run_group);
create trigger experiment_runs_touch before update on experiment_runs for each row execute function app.touch_updated_at();

create table run_metrics (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references experiment_runs (id) on delete cascade,
  metric_name text not null check (metric_name ~ '^[A-Za-z0-9][A-Za-z0-9_./ -]{0,79}$'),
  metric_value double precision not null check (metric_value = metric_value), -- rejects NaN
  metric_unit text,
  metric_step int,
  created_at timestamptz not null default now()
);
create index run_metrics_run on run_metrics (run_id, metric_name);

-- Numbers the paper reports, entered by the researcher.
create table reported_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  key text not null check (key ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$'),
  label text not null,
  metric_name text not null,
  metric_value double precision not null,
  metric_unit text,
  -- Multiply a logged run value by this to put it in the reported unit (e.g. 100 for %).
  run_value_scale double precision not null default 1 check (run_value_scale > 0),
  direction text not null default 'none' check (direction in ('higher', 'lower', 'none')),
  aggregation text,
  reported_runs int check (reported_runs is null or reported_runs >= 1),
  dispersion double precision check (dispersion is null or dispersion >= 0),
  dispersion_kind text check (dispersion_kind in ('sd', 'se', 'ci95', 'range', 'other')),
  dataset_key text,
  source_reference text,
  reported_conditions text,
  provenance app.provenance not null default 'reported',
  run_groups text[] not null default '{}',
  tolerance double precision check (tolerance is null or tolerance >= 0),
  tolerance_reason text,
  blocked_reason text,
  verdict text check (verdict in ('matched', 'not_matched', 'inconclusive', 'blocked')),
  verdict_note text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, key)
);
create trigger reported_metrics_touch before update on reported_metrics for each row execute function app.touch_updated_at();

create table discrepancies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  run_id uuid references experiment_runs (id) on delete set null,
  reported_metric_id uuid references reported_metrics (id) on delete set null,
  category text not null check (category in (
    'missing_information', 'dataset_difference', 'dependency_conflict', 'preprocessing_difference',
    'hardware_difference', 'hyperparameter_difference', 'implementation_difference',
    'statistical_variation', 'other')),
  title text not null check (length(title) between 1 and 300),
  description text,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  explanation text,
  -- Whether the explanation is a confirmed cause or a suspicion.
  cause_status text not null default 'suspected' check (cause_status in ('suspected', 'confirmed', 'ruled_out')),
  evidence text,
  resolution_status text not null default 'open' check (resolution_status in ('open', 'investigating', 'resolved', 'wont_fix')),
  notes text,
  created_by text references "user" ("id") on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index discrepancies_project on discrepancies (project_id, created_at desc);
create trigger discrepancies_touch before update on discrepancies for each row execute function app.touch_updated_at();

-- Small result files. Content is kept in Postgres (artifact_blobs) because there is no
-- private object store in this deployment; the API caps each file at 2 MB.
create table artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  run_id uuid not null references experiment_runs (id) on delete cascade,
  file_name text not null check (file_name !~ '[/\\]' and length(file_name) between 1 and 255),
  file_type text not null,
  file_size bigint not null check (file_size >= 0 and file_size <= 2097152),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index artifacts_run on artifacts (run_id);

create table artifact_blobs (
  artifact_id uuid primary key references artifacts (id) on delete cascade,
  content bytea not null
);

create table ingestion_tokens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  created_by text references "user" ("id") on delete set null,
  name text not null default 'token',
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index ingestion_tokens_project on ingestion_tokens (project_id);

create table activity_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references projects (id) on delete cascade,
  actor_id text references "user" ("id") on delete set null,
  kind text not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index activity_events_project on activity_events (project_id, created_at desc);

-- Every project has exactly one owner membership, created with it.
create or replace function app.add_owner_membership() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  insert into project_members (project_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger projects_owner_membership after insert on projects
  for each row execute function app.add_owner_membership();
