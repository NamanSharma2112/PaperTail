import "server-only";
import type { Db } from "../db";
import { ApiError, notFound } from "../http";
import { logActivity, maybeOne, one, projectRole, rows } from "./common";

async function requireEditor(db: Db, projectId: string) {
  const role = await projectRole(db, projectId);
  if (role === "viewer") throw new ApiError(403, "forbidden", "Viewers cannot change this project");
}

// ---------- reported metrics ----------

export async function listReported(db: Db, projectId: string) {
  await projectRole(db, projectId);
  return rows(db, "select * from reported_metrics where project_id = $1 order by created_at", [projectId]);
}

const RM_FIELDS = [
  "label", "metric_name", "metric_value", "metric_unit", "run_value_scale", "direction", "aggregation", "reported_runs",
  "dispersion", "dispersion_kind", "dataset_key", "source_reference", "reported_conditions", "provenance", "run_groups",
  "tolerance", "tolerance_reason", "blocked_reason", "verdict", "verdict_note", "notes",
] as const;

export async function upsertReported(db: Db, userId: string, projectId: string, input: Record<string, unknown> & { key: string }) {
  await requireEditor(db, projectId);
  const cols = ["project_id", "key", ...RM_FIELDS];
  const vals = [projectId, input.key, ...RM_FIELDS.map((f) => input[f] ?? null)];
  const updates = RM_FIELDS.map((f) => `${f} = excluded.${f}`).join(", ");
  const placeholders = cols.map((c, i) => (c === "run_groups" ? `coalesce($${i + 1}::text[], '{}')` : c === "run_value_scale" ? `coalesce($${i + 1}, 1)` : c === "direction" ? `coalesce($${i + 1}, 'none')` : c === "provenance" ? `coalesce($${i + 1}, 'reported')` : `$${i + 1}`));
  const row = await one(db, `insert into reported_metrics (${cols.join(", ")}) values (${placeholders.join(", ")}) on conflict (project_id, key) do update set ${updates} returning *`, vals);
  await logActivity(db, projectId, userId, "reported.saved", `Saved published result "${input.label}"`);
  return row;
}

export async function deleteReported(db: Db, userId: string, projectId: string, id: string) {
  await requireEditor(db, projectId);
  const r = await maybeOne<{ label: string }>(db, "delete from reported_metrics where id = $1 and project_id = $2 returning label", [id, projectId]);
  if (!r) throw notFound("Published result");
  await logActivity(db, projectId, userId, "reported.deleted", `Deleted published result "${r.label}"`);
}

// ---------- datasets ----------

export async function listDatasets(db: Db, projectId: string) {
  await projectRole(db, projectId);
  return rows(db, "select * from datasets where project_id = $1 order by created_at", [projectId]);
}

export async function upsertDataset(db: Db, userId: string, projectId: string, input: { key: string; name: string; status: string; url: string | null; version: string | null; note: string | null; sources: unknown[] }) {
  await requireEditor(db, projectId);
  const row = await one(
    db,
    `insert into datasets (project_id, key, name, status, url, version, note, sources) values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (project_id, key) do update set name = excluded.name, status = excluded.status, url = excluded.url,
       version = excluded.version, note = excluded.note, sources = excluded.sources returning *`,
    [projectId, input.key, input.name, input.status, input.url, input.version, input.note, JSON.stringify(input.sources)],
  );
  await logActivity(db, projectId, userId, "dataset.saved", `Saved dataset "${input.name}"`);
  return row;
}

export async function deleteDataset(db: Db, userId: string, projectId: string, id: string) {
  await requireEditor(db, projectId);
  const r = await maybeOne<{ key: string; name: string }>(db, "delete from datasets where id = $1 and project_id = $2 returning key, name", [id, projectId]);
  if (!r) throw notFound("Dataset");
  await db.query("update reported_metrics set dataset_key = null where project_id = $1 and dataset_key = $2", [projectId, r.key]);
  await logActivity(db, projectId, userId, "dataset.deleted", `Deleted dataset "${r.name}"`);
}

// ---------- deviations ----------

export async function listDeviations(db: Db, projectId: string) {
  await projectRole(db, projectId);
  return rows(db, "select * from deviations where project_id = $1 order by created_at", [projectId]);
}

export async function createDeviation(db: Db, userId: string, projectId: string, input: { kind: string; what: string; why: string | null; expected_effect: string | null; applies_to: string | null }) {
  await requireEditor(db, projectId);
  const used = new Set((await rows<{ key: string }>(db, "select key from deviations where project_id = $1", [projectId])).map((r) => r.key));
  let n = used.size + 1;
  while (used.has(`D${n}`)) n++;
  const row = await one(
    db,
    "insert into deviations (project_id, key, kind, what, why, expected_effect, applies_to) values ($1,$2,$3,$4,$5,$6,$7) returning *",
    [projectId, `D${n}`, input.kind, input.what, input.why, input.expected_effect, input.applies_to],
  );
  await logActivity(db, projectId, userId, "deviation.created", `Logged deviation D${n} (${input.kind})`);
  return row;
}

export async function deleteDeviation(db: Db, userId: string, projectId: string, id: string) {
  await requireEditor(db, projectId);
  const r = await maybeOne<{ key: string }>(db, "delete from deviations where id = $1 and project_id = $2 returning key", [id, projectId]);
  if (!r) throw notFound("Deviation");
  await logActivity(db, projectId, userId, "deviation.deleted", `Deleted deviation ${r.key}`);
}

// ---------- discrepancies ----------

export async function listDiscrepancies(db: Db, projectId: string) {
  await projectRole(db, projectId);
  return rows(
    db,
    `select d.*, r.name as run_name, m.label as reported_label from discrepancies d
       left join experiment_runs r on r.id = d.run_id left join reported_metrics m on m.id = d.reported_metric_id
      where d.project_id = $1 order by d.resolution_status in ('resolved','wont_fix'), d.created_at desc`,
    [projectId],
  );
}

const D_DEFAULTS: Record<string, string> = { severity: "medium", cause_status: "suspected", resolution_status: "open" };
const D_FIELDS = ["run_id", "reported_metric_id", "category", "title", "description", "severity", "explanation", "cause_status", "evidence", "resolution_status", "notes"] as const;

async function checkLinks(db: Db, projectId: string, input: Record<string, unknown>) {
  if (input.run_id && !(await maybeOne(db, "select 1 from experiment_runs where id = $1 and project_id = $2", [input.run_id, projectId]))) throw notFound("Run");
  if (input.reported_metric_id && !(await maybeOne(db, "select 1 from reported_metrics where id = $1 and project_id = $2", [input.reported_metric_id, projectId]))) throw notFound("Published result");
}

export async function createDiscrepancy(db: Db, userId: string, projectId: string, input: Record<string, unknown>) {
  await requireEditor(db, projectId);
  await checkLinks(db, projectId, input);
  const row = await one<{ id: string; title: string }>(
    db,
    `insert into discrepancies (project_id, created_by, ${D_FIELDS.join(", ")}) values ($1, $2, ${D_FIELDS.map((_, i) => `$${i + 3}`).join(", ")}) returning *`,
    [projectId, userId, ...D_FIELDS.map((f) => input[f] ?? D_DEFAULTS[f] ?? null)],
  );
  await logActivity(db, projectId, userId, "discrepancy.created", `Recorded discrepancy "${row.title}"`);
  return row;
}

export async function updateDiscrepancy(db: Db, userId: string, id: string, input: Record<string, unknown>) {
  const current = await one<{ project_id: string; title: string }>(db, "select project_id, title from discrepancies where id = $1", [id], "Discrepancy");
  await requireEditor(db, current.project_id);
  await checkLinks(db, current.project_id, input);
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const f of D_FIELDS) {
    if (input[f] === undefined) continue;
    params.push(input[f]);
    sets.push(`${f} = $${params.length}`);
  }
  if (!sets.length) return one(db, "select * from discrepancies where id = $1", [id]);
  const row = await one(db, `update discrepancies set ${sets.join(", ")} where id = $1 returning *`, params, "Discrepancy");
  if (input.resolution_status) await logActivity(db, current.project_id, userId, "discrepancy.updated", `Marked "${current.title}" as ${String(input.resolution_status).replace("_", " ")}`);
  return row;
}

export async function deleteDiscrepancy(db: Db, userId: string, id: string) {
  const current = await one<{ project_id: string; title: string }>(db, "select project_id, title from discrepancies where id = $1", [id], "Discrepancy");
  await requireEditor(db, current.project_id);
  await db.query("delete from discrepancies where id = $1", [id]);
  await logActivity(db, current.project_id, userId, "discrepancy.deleted", `Deleted discrepancy "${current.title}"`);
}

// ---------- activity ----------

export async function recentActivity(db: Db, projectId?: string, limit = 20) {
  return rows(
    db,
    `select a.id, a.project_id, a.kind, a.summary, a.created_at, p.title as project_title from activity_events a join projects p on p.id = a.project_id
      ${projectId ? "where a.project_id = $1" : ""} order by a.created_at desc limit ${Math.min(limit, 100)}`,
    projectId ? [projectId] : [],
  );
}
