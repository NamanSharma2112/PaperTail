-- Row Level Security.
--
-- Model: the application connects as the database owner (the role that runs these
-- migrations). For every request made on behalf of a signed-in user it opens a
-- transaction, switches to the restricted role papertrail_app with SET LOCAL ROLE, and
-- sets app.user_id. Every policy below applies to papertrail_app only, so a user's
-- queries can never see or change another user's rows, whatever the application code
-- asks for. The owner role (used for sign-in, migrations, and SDK ingestion after the
-- ingestion token has been verified) is not subject to these policies.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'papertrail_app') then
    create role papertrail_app nologin;
  end if;
  -- Let the migrating (owner) role switch to papertrail_app. PostgreSQL 16 split
  -- membership into SET and INHERIT; we want SET only.
  if current_setting('server_version_num')::int >= 160000 then
    execute format('grant papertrail_app to %I with set true, inherit false', current_user);
  else
    execute format('grant papertrail_app to %I', current_user);
  end if;
end $$;

-- ---------------------------------------------------------------- helpers

create or replace function app.uid() returns text
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')
$$;

-- Runs as the owner, so it can read memberships without recursing into their policy.
create or replace function app.project_role(p uuid) returns text
language sql stable security definer set search_path = public, app as $$
  select role from project_members where project_id = p and user_id = app.uid()
$$;

create or replace function app.can_read(p uuid) returns boolean
language sql stable as $$ select app.project_role(p) is not null $$;

create or replace function app.can_edit(p uuid) returns boolean
language sql stable as $$ select coalesce(app.project_role(p) in ('owner', 'editor'), false) $$;

create or replace function app.is_owner(p uuid) returns boolean
language sql stable as $$ select coalesce(app.project_role(p) = 'owner', false) $$;

revoke all on function app.project_role(uuid) from public;

grant usage on schema public, app to papertrail_app;
grant execute on function app.uid(), app.project_role(uuid), app.can_read(uuid), app.can_edit(uuid), app.is_owner(uuid)
  to papertrail_app;

-- ---------------------------------------------------------------- grants
-- Auth tables ("user", session, account, verification) are deliberately not granted.

grant select, insert, update on profiles to papertrail_app;
grant select, insert, update, delete on papers to papertrail_app;
grant select, insert, delete on paper_references to papertrail_app;
grant select, insert, delete on projects to papertrail_app;
grant update (title, description, kind, status, outcome, outcome_notes, limitations, code_url, code_commit)
  on projects to papertrail_app;
grant select, insert, update, delete on project_members, project_papers to papertrail_app;
grant select, insert, update on protocols to papertrail_app;
grant select, insert, update, delete on datasets, deviations, reported_metrics, discrepancies to papertrail_app;
-- Runs and metrics are written only by SDK ingestion. Users may annotate, regroup,
-- cancel or delete runs; they cannot set results.
grant select, delete on experiment_runs to papertrail_app;
grant update (notes, run_group, status) on experiment_runs to papertrail_app;
grant select on run_metrics to papertrail_app;
grant select, delete on artifacts to papertrail_app;
grant select on artifact_blobs to papertrail_app;
-- token_hash is never readable by the application role.
grant select (id, project_id, created_by, name, token_prefix, expires_at, revoked_at, last_used_at, created_at)
  on ingestion_tokens to papertrail_app;
grant insert (project_id, created_by, name, token_hash, token_prefix, expires_at) on ingestion_tokens to papertrail_app;
grant update (revoked_at, name) on ingestion_tokens to papertrail_app;
grant select, insert on activity_events to papertrail_app;

-- ---------------------------------------------------------------- policies

alter table profiles enable row level security;
create policy profiles_own on profiles to papertrail_app
  using (id = app.uid()) with check (id = app.uid());

alter table papers enable row level security;
create policy papers_read on papers for select to papertrail_app using (
  created_by = app.uid()
  or exists (select 1 from project_papers pp where pp.paper_id = papers.id and app.can_read(pp.project_id))
);
create policy papers_insert on papers for insert to papertrail_app with check (created_by = app.uid());
create policy papers_update on papers for update to papertrail_app
  using (created_by = app.uid()) with check (created_by = app.uid());
create policy papers_delete on papers for delete to papertrail_app using (created_by = app.uid());

alter table paper_references enable row level security;
create policy paper_references_read on paper_references for select to papertrail_app
  using (exists (select 1 from papers p where p.id = paper_references.paper_id));
create policy paper_references_write on paper_references for insert to papertrail_app
  with check (exists (select 1 from papers p where p.id = paper_id and p.created_by = app.uid()));
create policy paper_references_delete on paper_references for delete to papertrail_app
  using (exists (select 1 from papers p where p.id = paper_id and p.created_by = app.uid()));

alter table projects enable row level security;
create policy projects_read on projects for select to papertrail_app using (app.can_read(id));
create policy projects_insert on projects for insert to papertrail_app with check (owner_id = app.uid());
create policy projects_update on projects for update to papertrail_app
  using (app.can_edit(id)) with check (app.can_edit(id));
create policy projects_delete on projects for delete to papertrail_app using (app.is_owner(id));

alter table project_members enable row level security;
create policy members_read on project_members for select to papertrail_app using (app.can_read(project_id));
create policy members_write on project_members for insert to papertrail_app
  with check (app.is_owner(project_id) and role <> 'owner');
create policy members_update on project_members for update to papertrail_app
  using (app.is_owner(project_id) and role <> 'owner') with check (app.is_owner(project_id) and role <> 'owner');
create policy members_delete on project_members for delete to papertrail_app
  using (app.is_owner(project_id) and role <> 'owner');

alter table project_papers enable row level security;
create policy project_papers_read on project_papers for select to papertrail_app using (app.can_read(project_id));
-- Linking requires edit rights on the project and a paper the user can see.
create policy project_papers_insert on project_papers for insert to papertrail_app with check (
  app.can_edit(project_id) and exists (select 1 from papers p where p.id = paper_id and p.created_by = app.uid())
);
create policy project_papers_update on project_papers for update to papertrail_app
  using (app.can_edit(project_id)) with check (app.can_edit(project_id));
create policy project_papers_delete on project_papers for delete to papertrail_app using (app.can_edit(project_id));

-- Tables owned by a project: members read, owners and editors write.
do $$
declare t text;
begin
  foreach t in array array['protocols', 'datasets', 'deviations', 'reported_metrics', 'discrepancies'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to papertrail_app using (app.can_read(project_id))', t || '_read', t);
    execute format('create policy %I on %I for insert to papertrail_app with check (app.can_edit(project_id))', t || '_insert', t);
    execute format('create policy %I on %I for update to papertrail_app using (app.can_edit(project_id)) with check (app.can_edit(project_id))', t || '_update', t);
    execute format('create policy %I on %I for delete to papertrail_app using (app.can_edit(project_id))', t || '_delete', t);
  end loop;
end $$;

alter table experiment_runs enable row level security;
create policy runs_read on experiment_runs for select to papertrail_app using (app.can_read(project_id));
create policy runs_update on experiment_runs for update to papertrail_app
  using (app.can_edit(project_id)) with check (app.can_edit(project_id));
create policy runs_delete on experiment_runs for delete to papertrail_app using (app.can_edit(project_id));

-- Users may only cancel a pending or running run; results are set by ingestion alone.
create or replace function app.guard_run_status() returns trigger
language plpgsql as $$
begin
  if current_user = 'papertrail_app' and new.status is distinct from old.status
     and not (new.status = 'cancelled' and old.status in ('pending', 'running')) then
    raise exception 'run status can only be changed to cancelled from pending or running'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger experiment_runs_guard_status before update on experiment_runs
  for each row execute function app.guard_run_status();

alter table run_metrics enable row level security;
create policy run_metrics_read on run_metrics for select to papertrail_app
  using (exists (select 1 from experiment_runs r where r.id = run_metrics.run_id));

alter table artifacts enable row level security;
create policy artifacts_read on artifacts for select to papertrail_app using (app.can_read(project_id));
create policy artifacts_delete on artifacts for delete to papertrail_app using (app.can_edit(project_id));

alter table artifact_blobs enable row level security;
create policy artifact_blobs_read on artifact_blobs for select to papertrail_app
  using (exists (select 1 from artifacts a where a.id = artifact_blobs.artifact_id));

alter table ingestion_tokens enable row level security;
create policy tokens_read on ingestion_tokens for select to papertrail_app using (app.can_edit(project_id));
create policy tokens_insert on ingestion_tokens for insert to papertrail_app
  with check (app.can_edit(project_id) and created_by = app.uid());
create policy tokens_update on ingestion_tokens for update to papertrail_app
  using (app.can_edit(project_id)) with check (app.can_edit(project_id));

alter table activity_events enable row level security;
create policy activity_read on activity_events for select to papertrail_app using (app.can_read(project_id));
create policy activity_insert on activity_events for insert to papertrail_app
  with check (app.can_edit(project_id) and actor_id = app.uid());
