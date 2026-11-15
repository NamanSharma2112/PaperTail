import "server-only";
import type { Db } from "../db";
import { ApiError, notFound } from "../http";
import { logActivity, maybeOne, one, projectRole, rows } from "./common";

export type RunRow = {
  id: string;
  project_id: string;
  name: string;
  run_group: string;
  status: string;
  git_repository: string | null;
  git_commit: string | null;
  git_dirty: boolean | null;
  dataset_version: string | null;
  python_version: string | null;
  operating_system: string | null;
  hardware_information: Record<string, unknown>;
  seed: number | null;
  parameters: Record<string, unknown>;
  environment_metadata: Record<string, unknown>;
  command: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  failure_summary: string | null;
  notes: string | null;
  created_at: string;
};

export type MetricRow = { run_id: string; metric_name: string; metric_value: number; metric_unit: string | null; metric_step: number | null; created_at: string };

export async function listRuns(db: Db, projectId: string, opts: { status?: string; group?: string; limit?: number; offset?: number } = {}) {
  await projectRole(db, projectId);
  const params: unknown[] = [projectId];
  let where = "r.project_id = $1";
  if (opts.status) {
    params.push(opts.status);
    where += ` and r.status = $${params.length}`;
  }
  if (opts.group) {
    params.push(opts.group);
    where += ` and r.run_group = $${params.length}`;
  }
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const offset = Math.max(opts.offset ?? 0, 0);
  const runs = await rows<RunRow & { metrics: Record<string, number> }>(
    db,
    `select r.id, r.project_id, r.name, r.run_group, r.status, r.git_commit, r.git_dirty, r.dataset_version, r.python_version,
            r.operating_system, r.seed, r.parameters, r.started_at, r.completed_at, r.duration_seconds, r.failure_summary, r.created_at,
            coalesce((select jsonb_object_agg(m.metric_name, m.metric_value) from (
               select distinct on (metric_name) metric_name, metric_value from run_metrics
                where run_id = r.id order by metric_name, metric_step desc nulls last, created_at desc) m), '{}') as metrics
       from experiment_runs r where ${where}
      order by coalesce(r.started_at, r.created_at) desc limit ${limit} offset ${offset}`,
    params,
  );
  const total = await one<{ n: number }>(db, `select count(*)::int as n from experiment_runs r where ${where}`, params);
  const groups = await rows<{ run_group: string; n: number }>(
    db,
    "select run_group, count(*)::int as n from experiment_runs where project_id = $1 group by run_group order by run_group",
    [projectId],
  );
  return { runs, total: total.n, groups };
}

export async function getRun(db: Db, runId: string) {
  const run = await one<RunRow>(db, "select * from experiment_runs where id = $1", [runId], "Run");
  const metrics = await rows<MetricRow>(db, "select * from run_metrics where run_id = $1 order by metric_name, metric_step nulls first, created_at", [runId]);
  const artifacts = await rows(db, "select id, file_name, file_type, file_size, checksum, created_at from artifacts where run_id = $1 order by created_at", [runId]);
  const role = await projectRole(db, run.project_id);
  return { ...run, metrics, artifacts, role };
}

export async function runMetrics(db: Db, runId: string) {
  await one(db, "select id from experiment_runs where id = $1", [runId], "Run");
  return rows<MetricRow>(db, "select * from run_metrics where run_id = $1 order by metric_name, metric_step nulls first, created_at", [runId]);
}

export async function updateRun(db: Db, userId: string, runId: string, input: { notes?: string | null; run_group?: string; status?: "cancelled" }) {
  const run = await one<RunRow>(db, "select * from experiment_runs where id = $1", [runId], "Run");
  const role = await projectRole(db, run.project_id);
  if (role === "viewer") throw new ApiError(403, "forbidden", "Viewers cannot change runs");
  if (input.status === "cancelled" && !["pending", "running"].includes(run.status)) {
    throw new ApiError(409, "invalid_state", `A ${run.status} run cannot be cancelled`);
  }
  const sets: string[] = [];
  const params: unknown[] = [runId];
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    params.push(v);
    sets.push(`${k} = $${params.length}`);
  }
  if (!sets.length) return run;
  const updated = await one<RunRow>(db, `update experiment_runs set ${sets.join(", ")} where id = $1 returning *`, params, "Run");
  if (input.status === "cancelled") await logActivity(db, run.project_id, userId, "run.cancelled", `Cancelled run "${run.name}"`);
  return updated;
}

export async function deleteRun(db: Db, userId: string, runId: string) {
  const run = await maybeOne<RunRow>(db, "select * from experiment_runs where id = $1", [runId]);
  if (!run) throw notFound("Run");
  const role = await projectRole(db, run.project_id);
  if (role === "viewer") throw new ApiError(403, "forbidden", "Viewers cannot delete runs");
  await db.query("delete from experiment_runs where id = $1", [runId]);
  await logActivity(db, run.project_id, userId, "run.deleted", `Deleted run "${run.name}"`);
}

/** Side-by-side view of several runs: which parameters differ, and every metric's final value. */
export async function compareRuns(db: Db, projectId: string, runIds: string[]) {
  await projectRole(db, projectId);
  const runs = await rows<RunRow>(db, "select * from experiment_runs where project_id = $1 and id = any($2::uuid[]) order by created_at", [projectId, runIds]);
  if (runs.length !== runIds.length) throw notFound("Run");
  const metrics = await rows<MetricRow>(
    db,
    `select distinct on (run_id, metric_name) * from run_metrics where run_id = any($1::uuid[])
      order by run_id, metric_name, metric_step desc nulls last, created_at desc`,
    [runIds],
  );
  const paramKeys = [...new Set(runs.flatMap((r) => Object.keys(r.parameters ?? {})))].sort();
  const parameters = paramKeys.map((k) => {
    const values = runs.map((r) => (r.parameters ?? {})[k] ?? null);
    return { name: k, values, differs: new Set(values.map((v) => JSON.stringify(v))).size > 1 };
  });
  const env = (["git_commit", "dataset_version", "python_version", "operating_system", "seed", "run_group"] as const).map((k) => {
    const values = runs.map((r) => (r[k] ?? null) as unknown);
    return { name: k, values, differs: new Set(values.map((v) => JSON.stringify(v))).size > 1 };
  });
  const metricNames = [...new Set(metrics.map((m) => m.metric_name))].sort();
  const metricTable = metricNames.map((name) => ({
    name,
    values: runs.map((r) => metrics.find((m) => m.run_id === r.id && m.metric_name === name)?.metric_value ?? null),
  }));
  return { runs: runs.map((r) => ({ id: r.id, name: r.name, status: r.status, seed: r.seed })), parameters, environment: env, metrics: metricTable };
}
