import "server-only";
import type { Db } from "../db";
import { rows } from "./common";

/**
 * Papers, claims (published results), datasets, code and citations as one graph, over
 * every project the user can read. Nodes describing the same thing are merged across
 * projects: papers by arXiv ID, DOI or title; datasets by name; code by URL.
 */
const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type Node = Record<string, unknown> & { id: string; type: string; label: string };

export async function buildGraph(db: Db) {
  const projects = await rows<{ id: string; title: string; code_url: string | null; code_commit: string | null }>(db, "select id, title, code_url, code_commit from projects");
  const papers = await rows<{ project_id: string; id: string; title: string; arxiv_id: string | null; doi: string | null; publication_year: number | null; authors: string[]; landing_url: string | null }>(
    db, "select pp.project_id, pa.id, pa.title, pa.arxiv_id, pa.doi, pa.publication_year, pa.authors, pa.landing_url from project_papers pp join papers pa on pa.id = pp.paper_id where pp.is_primary");
  const refs = await rows<{ paper_id: string; title: string; arxiv_id: string | null; doi: string | null; year: number | null; cited_by_count: number | null; authors: string[] }>(
    db, "select pr.paper_id, pr.title, pr.arxiv_id, pr.doi, pr.year, pr.cited_by_count, pr.authors from paper_references pr where pr.paper_id in (select paper_id from project_papers where is_primary)");
  const datasets = await rows<{ project_id: string; key: string; name: string; status: string; url: string | null; note: string | null; sources: { relation: string; title: string; arxiv_id?: string | null; doi?: string | null; year?: number | null }[] }>(
    db, "select project_id, key, name, status, url, note, sources from datasets");
  const claims = await rows<{ project_id: string; key: string; label: string; verdict: string | null; metric_value: number; metric_unit: string | null; metric_name: string; dataset_key: string | null; blocked_reason: string | null }>(
    db, "select project_id, key, label, verdict, metric_value, metric_unit, metric_name, dataset_key, blocked_reason from reported_metrics");

  const nodes = new Map<string, Node>();
  const alias = new Map<string, string>();
  const edges = new Map<string, { source: string; target: string; relation: string }>();
  const edge = (source: string, target: string, relation: string) => edges.set(`${source}|${target}|${relation}`, { source, target, relation });
  const merge = (id: string, attrs: Record<string, unknown>) => {
    const n = nodes.get(id)!;
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === "") continue;
      if (k === "projects") n.projects = [...new Set([...(n.projects as string[]), ...(v as string[])])];
      else if (k === "reproduced") n.reproduced = n.reproduced || v;
      else if (n[k] === null || n[k] === undefined || n[k] === "") n[k] = v;
    }
  };
  const paper = (title: string, arxiv: string | null | undefined, doi: string | null | undefined, attrs: Record<string, unknown>) => {
    const keys = [arxiv && `arxiv:${arxiv.toLowerCase()}`, doi && `doi:${doi.toLowerCase()}`, title && `title:${normTitle(title)}`].filter(Boolean) as string[];
    let id = keys.map((k) => alias.get(k)).find(Boolean);
    if (!id) {
      id = `paper:${keys[0].split(":").slice(1).join(":")}`;
      nodes.set(id, { id, type: "paper", label: title, reproduced: false, arxiv_id: arxiv ?? null, doi: doi ?? null, year: null, cited_by_count: null, projects: [], authors: [] });
    }
    for (const k of keys) if (!alias.has(k)) alias.set(k, id);
    merge(id, { arxiv_id: arxiv, doi, ...attrs });
    return id;
  };

  const primaryByProject = new Map<string, string>();
  for (const p of papers) {
    const id = paper(p.title, p.arxiv_id, p.doi, { reproduced: true, projects: [p.project_id], year: p.publication_year, authors: p.authors, url: p.landing_url });
    primaryByProject.set(p.project_id, id);
    for (const r of refs.filter((x) => x.paper_id === p.id)) {
      const rid = paper(r.title, r.arxiv_id, r.doi, { year: r.year, cited_by_count: r.cited_by_count, authors: r.authors });
      if (rid !== id) edge(id, rid, "cites");
    }
  }
  for (const pr of projects) {
    const pid = primaryByProject.get(pr.id);
    if (pr.code_url && pid) {
      const cid = `code:${pr.code_url.replace(/\/+$/, "").toLowerCase()}`;
      if (!nodes.has(cid)) nodes.set(cid, { id: cid, type: "code", label: pr.code_url.replace(/^https?:\/\/(www\.)?(github\.com\/)?/, "").replace(/\/+$/, ""), url: pr.code_url, commit: pr.code_commit, projects: [] });
      merge(cid, { projects: [pr.id] });
      edge(cid, pid, "implements");
    }
  }
  const datasetIds = new Map<string, string>();
  for (const d of datasets) {
    const id = `dataset:${normTitle(d.name)}`;
    if (!nodes.has(id)) nodes.set(id, { id, type: "dataset", label: d.name, status: d.status, url: d.url, note: d.note, projects: [] });
    merge(id, { projects: [d.project_id] });
    datasetIds.set(`${d.project_id}:${d.key}`, id);
    for (const s of d.sources ?? []) edge(id, paper(s.title, s.arxiv_id, s.doi, { year: s.year }), s.relation || "from");
  }
  for (const c of claims) {
    const pid = primaryByProject.get(c.project_id);
    const id = `claim:${c.project_id}:${c.key}`;
    nodes.set(id, { id, type: "claim", label: c.label, project: c.project_id, verdict: c.verdict ?? (c.blocked_reason ? "blocked" : null), reported: c.metric_value, unit: c.metric_unit, metric: c.metric_name, projects: [c.project_id] });
    if (pid) edge(pid, id, "reports");
    const ds = c.dataset_key ? datasetIds.get(`${c.project_id}:${c.dataset_key}`) : undefined;
    if (ds) edge(id, ds, "measured on");
  }
  const degree = new Map<string, number>();
  for (const e of edges.values()) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const out: (Node & { degree: number })[] = [...nodes.values()].map((n) => ({ ...n, degree: degree.get(n.id) ?? 0 }));
  const counts: Record<string, number> = {};
  for (const n of out) {
    const k = n.type === "paper" && n.reproduced ? "reproduced_paper" : n.type;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return { nodes: out, edges: [...edges.values()], counts };
}
