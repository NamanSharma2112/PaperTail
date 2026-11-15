import "server-only";
import type { Db } from "../db";
import { ApiError } from "../http";
import { logActivity, one, projectRole } from "./common";

export async function getProtocol(db: Db, projectId: string) {
  await projectRole(db, projectId);
  return one(db, "select * from protocols where project_id = $1", [projectId], "Protocol");
}

const FIELDS = [
  "research_objective",
  "hypothesis",
  "methodology",
  "model_information",
  "dataset_information",
  "preprocessing",
  "training_procedure",
  "evaluation_method",
  "assumptions",
] as const;

/** Save the protocol if nobody saved a newer version meanwhile (optimistic locking). */
export async function saveProtocol(db: Db, userId: string, projectId: string, input: Record<string, unknown> & { version: number }) {
  const role = await projectRole(db, projectId);
  if (role === "viewer") throw new ApiError(403, "forbidden", "Viewers cannot edit the protocol");
  const params: unknown[] = [projectId, input.version, userId, JSON.stringify(input.experimental_setup ?? {}), JSON.stringify(input.evidence ?? {})];
  const sets = FIELDS.map((f) => {
    params.push(input[f] ?? null);
    return `${f} = $${params.length}`;
  });
  const r = await db.query(
    `update protocols set ${sets.join(", ")}, experimental_setup = $4, evidence = $5, updated_by = $3, version = version + 1
      where project_id = $1 and version = $2 returning *`,
    params,
  );
  if (!r.rowCount) {
    throw new ApiError(409, "version_conflict", "Someone saved the protocol after you opened it. Reload to see their changes, then edit again.");
  }
  await logActivity(db, projectId, userId, "protocol.saved", `Saved the reproduction protocol (version ${r.rows[0].version})`);
  return r.rows[0];
}
