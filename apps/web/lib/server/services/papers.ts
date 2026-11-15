import "server-only";
import type { Db } from "../db";
import { lookupPaper, classifyIdentifier } from "./metadata";
import { notFound } from "../http";
import { maybeOne, one, rows } from "./common";

export type PaperRow = {
  id: string;
  title: string;
  abstract: string | null;
  authors: string[];
  doi: string | null;
  arxiv_id: string | null;
  publication_year: number | null;
  venue: string | null;
  publisher: string | null;
  landing_url: string | null;
  pdf_url: string | null;
  metadata_source: string;
  reading_status: string;
  tags: string[];
  notes: string | null;
  created_at: string;
  project_count?: number;
};

const SORTS: Record<string, string> = {
  recent: "p.created_at desc",
  title: "lower(p.title) asc",
  year: "p.publication_year desc nulls last, p.created_at desc",
};

export async function listPapers(db: Db, userId: string, opts: { q?: string; status?: string; sort?: string } = {}) {
  const params: unknown[] = [userId];
  let where = "p.created_by = $1";
  if (opts.q) {
    params.push(`%${opts.q.replace(/[%_\\]/g, "\\$&")}%`);
    where += ` and (p.title ilike $${params.length} or p.authors::text ilike $${params.length} or coalesce(p.venue,'') ilike $${params.length} or coalesce(p.doi,'') ilike $${params.length} or coalesce(p.arxiv_id,'') ilike $${params.length})`;
  }
  if (opts.status) {
    params.push(opts.status);
    where += ` and p.reading_status = $${params.length}`;
  }
  return rows<PaperRow>(
    db,
    `select p.*, (select count(*)::int from project_papers pp where pp.paper_id = p.id) as project_count
       from papers p where ${where} order by ${SORTS[opts.sort ?? "recent"] ?? SORTS.recent} limit 500`,
    params,
  );
}

/** Import by identifier. Importing a paper already in the library returns it unchanged. */
export async function importPaper(db: Db, userId: string, identifier: string): Promise<{ paper: PaperRow; existing: boolean }> {
  const id = classifyIdentifier(identifier);
  const column = id.kind === "arxiv" ? "arxiv_id" : "doi";
  const existing = await maybeOne<PaperRow>(db, `select * from papers where created_by = $1 and ${column} = $2`, [userId, id.value]);
  if (existing) return { paper: existing, existing: true };
  const m = await lookupPaper(identifier);
  // An arXiv paper with a journal DOI may already be in the library under that DOI.
  if (m.doi) {
    const byDoi = await maybeOne<PaperRow>(db, "select * from papers where created_by = $1 and doi = $2", [userId, m.doi]);
    if (byDoi) return { paper: byDoi, existing: true };
  }
  const paper = await one<PaperRow>(
    db,
    `insert into papers (created_by, title, abstract, authors, doi, arxiv_id, publication_year, venue, publisher, landing_url, pdf_url, metadata_source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [userId, m.title.slice(0, 1000), m.abstract, JSON.stringify(m.authors), m.doi, m.arxiv_id, m.publication_year, m.venue, m.publisher, m.landing_url, m.pdf_url, m.metadata_source],
  );
  return { paper, existing: false };
}

export async function getPaper(db: Db, id: string) {
  const paper = await one<PaperRow>(db, "select * from papers where id = $1", [id], "Paper");
  const projects = await rows<{ id: string; title: string; status: string; is_primary: boolean }>(
    db,
    "select pr.id, pr.title, pr.status, pp.is_primary from project_papers pp join projects pr on pr.id = pp.project_id where pp.paper_id = $1 order by pr.updated_at desc",
    [id],
  );
  return { ...paper, projects };
}

export async function updatePaper(db: Db, id: string, input: { reading_status?: string; tags?: string[]; notes?: string | null }) {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    params.push(v);
    sets.push(`${k} = $${params.length}`);
  }
  if (!sets.length) return one<PaperRow>(db, "select * from papers where id = $1", [id], "Paper");
  return one<PaperRow>(db, `update papers set ${sets.join(", ")} where id = $1 returning *`, params, "Paper");
}

export async function deletePaper(db: Db, id: string) {
  const r = await db.query("delete from papers where id = $1", [id]);
  if (!r.rowCount) throw notFound("Paper");
}
