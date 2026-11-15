import "server-only";
import { randomUUID } from "node:crypto";
import type { Db } from "../db";
import { ApiError } from "../http";
import { logActivity, one, projectRole, rows, maybeOne } from "./common";
import type { PaperRow } from "./papers";

export type ProjectRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  kind: string;
  status: string;
  outcome: string | null;
  outcome_notes: string | null;
  limitations: string | null;
  code_url: string | null;
  code_commit: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type ProjectListItem = ProjectRow & {
  paper_title: string | null;
  runs: number;
  completed_runs: number;
  failed_runs: number;
  open_discrepancies: number;
  reported_metrics: number;
  last_run_at: string | null;
  role: string;
};

export async function listProjects(db: Db) {
  return rows<ProjectListItem>(
    db,
    `select p.*, app.project_role(p.id) as role,
       (select pa.title from project_papers pp join papers pa on pa.id = pp.paper_id where pp.project_id = p.id and pp.is_primary limit 1) as paper_title,
       (select count(*)::int from experiment_runs r where r.project_id = p.id) as runs,
       (select count(*)::int from experiment_runs r where r.project_id = p.id and r.status = 'completed') as completed_runs,
       (select count(*)::int from experiment_runs r where r.project_id = p.id and r.status = 'failed') as failed_runs,
       (select count(*)::int from discrepancies d where d.project_id = p.id and d.resolution_status in ('open','investigating')) as open_discrepancies,
       (select count(*)::int from reported_metrics m where m.project_id = p.id) as reported_metrics,
       (select max(coalesce(r.completed_at, r.started_at, r.created_at)) from experiment_runs r where r.project_id = p.id) as last_run_at
     from projects p order by p.updated_at desc limit 500`,
  );
}

export async function createProject(
  db: Db,
  userId: string,
  input: { title: string; description: string | null; paper_id?: string | null; kind: string; code_url: string | null; code_commit: string | null },
) {
  // No RETURNING: the read policy needs the owner membership, which the after-insert
  // trigger creates, so the row only becomes readable once the statement has finished.
  const id = randomUUID();
  await db.query(`insert into projects (id, owner_id, title, description, kind, code_url, code_commit) values ($1,$2,$3,$4,$5,$6,$7)`, [
    id, userId, input.title, input.description, input.kind, input.code_url, input.code_commit,
  ]);
  const project = await one<ProjectRow>(db, "select * from projects where id = $1", [id], "Project");
  if (input.paper_id) {
    await db.query("insert into project_papers (project_id, paper_id, is_primary) values ($1, $2, true)", [project.id, input.paper_id]);
    await db.query("update papers set reading_status = 'reproducing' where id = $1 and reading_status in ('to_read','reading','read')", [input.paper_id]);
  }
  await db.query("insert into protocols (project_id, updated_by) values ($1, $2)", [project.id, userId]);
  await logActivity(db, project.id, userId, "project.created", `Created the project "${project.title}"`);
  return project;
}

export async function getProject(db: Db, id: string) {
  const role = await projectRole(db, id);
  const project = await one<ProjectRow>(db, "select * from projects where id = $1", [id], "Project");
  const papers = await rows<PaperRow & { is_primary: boolean }>(
    db,
    "select pa.*, pp.is_primary from project_papers pp join papers pa on pa.id = pp.paper_id where pp.project_id = $1 order by pp.is_primary desc, pp.created_at",
    [id],
  );
  return { ...project, role, papers, primary_paper: papers.find((p) => p.is_primary) ?? papers[0] ?? null };
}

const PROJECT_FIELDS = ["title", "description", "kind", "status", "outcome", "outcome_notes", "limitations", "code_url", "code_commit"] as const;

export async function updateProject(db: Db, userId: string, id: string, input: Partial<Record<(typeof PROJECT_FIELDS)[number], unknown>>) {
  const role = await projectRole(db, id);
  if (role === "viewer") throw new ApiError(403, "forbidden", "Viewers cannot change the project");
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const f of PROJECT_FIELDS) {
    if (input[f] === undefined) continue;
    params.push(input[f]);
    sets.push(`${f} = $${params.length}`);
  }
  if (!sets.length) return one<ProjectRow>(db, "select * from projects where id = $1", [id], "Project");
  const p = await one<ProjectRow>(db, `update projects set ${sets.join(", ")} where id = $1 returning *`, params, "Project");
  if (input.status !== undefined || input.outcome !== undefined) {
    await logActivity(db, id, userId, "project.updated", `Status ${p.status}${p.outcome ? `, outcome ${p.outcome.replace("_", " ")}` : ""}`);
  }
  return p;
}

export async function deleteProject(db: Db, id: string) {
  const role = await projectRole(db, id);
  if (role !== "owner") throw new ApiError(403, "forbidden", "Only the owner can delete a project");
  await db.query("delete from projects where id = $1", [id]);
}

export async function linkPaper(db: Db, projectId: string, paperId: string) {
  const existing = await maybeOne(db, "select 1 from project_papers where project_id = $1 and paper_id = $2", [projectId, paperId]);
  if (existing) return;
  const hasPrimary = await maybeOne(db, "select 1 from project_papers where project_id = $1 and is_primary", [projectId]);
  await db.query("insert into project_papers (project_id, paper_id, is_primary) values ($1,$2,$3)", [projectId, paperId, !hasPrimary]);
}

/** What a reproduction record is still missing, shown on the project overview. */
export async function missingInformation(db: Db, id: string) {
  const r = await one<Record<string, unknown>>(
    db,
    `select
       (select count(*) from project_papers where project_id = $1)::int as papers,
       (select research_objective is not null and methodology is not null and evaluation_method is not null from protocols where project_id = $1) as protocol_core,
       (select count(*) from reported_metrics where project_id = $1)::int as reported,
       (select count(*) from reported_metrics m where project_id = $1 and m.reported_runs is null)::int as reported_without_n,
       (select count(*) from datasets where project_id = $1)::int as datasets,
       (select code_url is not null from projects where id = $1) as has_code,
       (select code_commit is not null from projects where id = $1) as has_commit,
       (select count(*) from experiment_runs where project_id = $1)::int as runs`,
    [id],
  );
  const items: { key: string; text: string }[] = [];
  if (!r.papers) items.push({ key: "paper", text: "No paper is linked to this project." });
  if (!r.protocol_core) items.push({ key: "protocol", text: "The protocol is missing its objective, methodology or evaluation method." });
  if (!r.has_code) items.push({ key: "code", text: "No code repository recorded." });
  else if (!r.has_commit) items.push({ key: "commit", text: "The code repository has no pinned commit." });
  if (!r.datasets) items.push({ key: "datasets", text: "No datasets recorded." });
  if (!r.reported) items.push({ key: "reported", text: "No published results entered, so nothing can be compared yet." });
  if ((r.reported_without_n as number) > 0) items.push({ key: "reported_n", text: `${r.reported_without_n} published result(s) do not say how many runs they aggregate.` });
  if (!r.runs) items.push({ key: "runs", text: "No experiment runs recorded yet." });
  return items;
}
