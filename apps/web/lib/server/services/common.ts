import "server-only";
import type { Db } from "../db";
import { notFound } from "../http";

export async function rows<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query(sql, params)).rows as T[];
}

export async function one<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = [], what = "Resource"): Promise<T> {
  const r = (await db.query(sql, params)).rows;
  if (!r.length) throw notFound(what);
  return r[0] as T;
}

export async function maybeOne<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = (await db.query(sql, params)).rows;
  return (r[0] as T) ?? null;
}

export async function logActivity(db: Db, projectId: string, actorId: string | null, kind: string, summary: string) {
  await db.query("insert into activity_events (project_id, actor_id, kind, summary) values ($1, $2, $3, $4)", [projectId, actorId, kind, summary.slice(0, 500)]);
}

export type Role = "owner" | "editor" | "viewer";

/** The caller's role on a project; 404 when they are not a member (RLS hides it anyway). */
export async function projectRole(db: Db, projectId: string): Promise<Role> {
  const r = await maybeOne<{ role: Role }>(db, "select app.project_role($1) as role", [projectId]);
  if (!r?.role) throw notFound("Project");
  return r.role;
}
