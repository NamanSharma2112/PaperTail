import "server-only";
import { createHash } from "node:crypto";
import { withSystem, type Db } from "../db";
import { ApiError, notFound, rateLimit } from "../http";
import { logActivity, maybeOne, one } from "./common";
import { verifyToken, type VerifiedToken } from "./tokens";

/**
 * SDK ingestion. Every call authenticates with a project ingestion token
 * (Authorization: Bearer pt_...), runs as the database owner after verification, and is
 * confined to the token's project. The server never executes anything it receives.
 */
export async function withToken<T>(req: Request, fn: (db: Db, token: VerifiedToken) => Promise<T>): Promise<T> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  return withSystem(async (db) => {
    const token = await verifyToken(db, raw);
    if (!token) throw new ApiError(401, "invalid_token", "The ingestion token is missing, unknown, expired or revoked");
    rateLimit(`sdk:${token.id}`, Number(process.env.SDK_RATE_LIMIT_PER_MIN ?? 600));
    return fn(db, token);
  });
}

async function runForToken(db: Db, token: VerifiedToken, runId: string) {
  const run = await maybeOne<{ id: string; project_id: string; status: string; name: string; started_at: string | null }>(
    db,
    "select id, project_id, status, name, started_at from experiment_runs where id = $1 for update",
    [runId],
  );
  // A token for another project gets the same answer as a run that does not exist.
  if (!run || run.project_id !== token.project_id) throw notFound("Run");
  return run;
}

export async function createRun(db: Db, token: VerifiedToken, input: {
  project_id: string; name: string; run_group: string; idempotency_key?: string | null; seed?: number | null;
  parameters: Record<string, unknown>; git: { repository: string | null; commit: string | null; dirty?: boolean | null };
  dataset_version: string | null; environment: { python: string | null; os: string | null; platform: string | null; hardware: Record<string, unknown>; packages: Record<string, string> };
  command: string | null; started_at?: string | null;
}) {
  if (input.project_id !== token.project_id) throw new ApiError(403, "wrong_project", "This token belongs to a different project");
  if (input.idempotency_key) {
    const existing = await maybeOne(db, "select * from experiment_runs where project_id = $1 and idempotency_key = $2", [token.project_id, input.idempotency_key]);
    if (existing) return { run: existing, created: false };
  }
  const env = input.environment;
  const run = await one<{ id: string; name: string }>(
    db,
    `insert into experiment_runs (project_id, name, run_group, status, git_repository, git_commit, git_dirty, dataset_version, python_version,
       operating_system, hardware_information, seed, parameters, environment_metadata, command, started_at, idempotency_key, token_id)
     values ($1,$2,$3,'running',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,coalesce($15::timestamptz, now()),$16,$17)
     on conflict (project_id, idempotency_key) do nothing returning *`,
    [
      token.project_id, input.name, input.run_group, input.git.repository, input.git.commit, input.git.dirty ?? null, input.dataset_version,
      env.python, env.os ?? env.platform, JSON.stringify(env.hardware ?? {}), input.seed ?? null, JSON.stringify(input.parameters),
      JSON.stringify({ platform: env.platform, packages: env.packages }), input.command, input.started_at ?? null, input.idempotency_key ?? null, token.id,
    ],
  ).catch(async (err) => {
    // Lost a race with an identical idempotent request.
    if (input.idempotency_key) {
      const again = await maybeOne(db, "select * from experiment_runs where project_id = $1 and idempotency_key = $2", [token.project_id, input.idempotency_key]);
      if (again) return again as { id: string; name: string };
    }
    throw err;
  });
  await logActivity(db, token.project_id, token.created_by, "run.started", `Run "${run.name}" started (${input.run_group})`);
  return { run, created: true };
}

export async function addMetrics(db: Db, token: VerifiedToken, runId: string, metrics: { name: string; value: number; unit?: string | null; step?: number | null }[]) {
  const run = await runForToken(db, token, runId);
  if (run.status !== "running") throw new ApiError(409, "run_closed", `Run is ${run.status}; metrics can only be added while it is running`);
  const values: unknown[] = [];
  const tuples = metrics.map((m, i) => {
    values.push(runId, m.name, m.value, m.unit ?? null, m.step ?? null);
    const b = i * 5;
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
  });
  await db.query(`insert into run_metrics (run_id, metric_name, metric_value, metric_unit, metric_step) values ${tuples.join(",")}`, values);
  return { stored: metrics.length };
}

export async function addArtifact(db: Db, token: VerifiedToken, runId: string, meta: { file_name: string; file_type: string }, content: Buffer) {
  const run = await runForToken(db, token, runId);
  if (run.status !== "running") throw new ApiError(409, "run_closed", `Run is ${run.status}; artifacts can only be added while it is running`);
  const checksum = createHash("sha256").update(content).digest("hex");
  const a = await one<{ id: string }>(
    db,
    "insert into artifacts (project_id, run_id, file_name, file_type, file_size, checksum) values ($1,$2,$3,$4,$5,$6) returning id, file_name, file_size, checksum",
    [token.project_id, runId, meta.file_name, meta.file_type, content.length, checksum],
  );
  await db.query("insert into artifact_blobs (artifact_id, content) values ($1, $2)", [a.id, content]);
  return a;
}

async function finish(db: Db, token: VerifiedToken, runId: string, status: "completed" | "failed" | "cancelled", input: { completed_at?: string | null; duration_seconds?: number | null; failure_summary?: string | null }) {
  const run = await runForToken(db, token, runId);
  if (run.status === status) return one(db, "select * from experiment_runs where id = $1", [runId]); // idempotent retry
  if (run.status !== "running" && run.status !== "pending") throw new ApiError(409, "run_closed", `Run is already ${run.status}`);
  const row = await one(
    db,
    `update experiment_runs set status = $2, completed_at = coalesce($3::timestamptz, now()),
       duration_seconds = coalesce($4, extract(epoch from (coalesce($3::timestamptz, now()) - started_at))),
       failure_summary = $5 where id = $1 returning *`,
    [runId, status, input.completed_at ?? null, input.duration_seconds ?? null, input.failure_summary ?? null],
  );
  await logActivity(db, token.project_id, token.created_by, `run.${status}`, `Run "${run.name}" ${status}`);
  return row;
}

export const completeRun = (db: Db, t: VerifiedToken, id: string, input: { completed_at?: string | null; duration_seconds?: number | null }) => finish(db, t, id, "completed", input);
export const failRun = (db: Db, t: VerifiedToken, id: string, input: { failure_summary: string; completed_at?: string | null; duration_seconds?: number | null; status: "failed" | "cancelled" }) =>
  finish(db, t, id, input.status, input);
