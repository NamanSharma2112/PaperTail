import "server-only";
import type { Db } from "../db";
import { PROVENANCE_LABEL, PROTOCOL_FIELDS } from "../../schemas";
import { one, rows } from "./common";
import { compareProject } from "./comparison";
import { getProject } from "./projects";

/** Everything the report shows, assembled once and rendered as Markdown or HTML. */
export async function buildReport(db: Db, projectId: string) {
  const project = await getProject(db, projectId);
  const protocol = await one<Record<string, unknown>>(db, "select * from protocols where project_id = $1", [projectId]);
  const comparisons = await compareProject(db, projectId);
  const datasets = await rows<{ key: string; name: string; status: string; url: string | null; version: string | null; note: string | null; sources: { relation: string; title: string; year?: number | null }[] }>(
    db, "select * from datasets where project_id = $1 order by created_at", [projectId]);
  const deviations = await rows<{ key: string; kind: string; what: string; why: string | null; expected_effect: string | null }>(db, "select * from deviations where project_id = $1 order by created_at", [projectId]);
  const discrepancies = await rows<{ title: string; category: string; severity: string; cause_status: string; resolution_status: string; explanation: string | null; description: string | null }>(
    db, "select * from discrepancies where project_id = $1 order by created_at", [projectId]);
  const runStats = await one<{ total: number; completed: number; failed: number; groups: number }>(
    db,
    "select count(*)::int as total, count(*) filter (where status='completed')::int as completed, count(*) filter (where status='failed')::int as failed, count(distinct run_group)::int as groups from experiment_runs where project_id = $1",
    [projectId],
  );
  const environments = await rows<{ python_version: string | null; operating_system: string | null; git_commit: string | null; n: number }>(
    db,
    "select python_version, operating_system, git_commit, count(*)::int as n from experiment_runs where project_id = $1 group by 1,2,3 order by n desc limit 20",
    [projectId],
  );
  const configurations = await rows<{ run_group: string; parameters: Record<string, unknown>; n: number }>(
    db,
    "select distinct on (run_group) run_group, parameters, (select count(*)::int from experiment_runs x where x.project_id = r.project_id and x.run_group = r.run_group) as n from experiment_runs r where project_id = $1 order by run_group, created_at",
    [projectId],
  );
  return { generated_at: new Date().toISOString(), project, protocol, comparisons, datasets, deviations, discrepancies, runStats, environments, configurations };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;

const OUTCOME: Record<string, string> = {
  successful: "Reproduced",
  partial: "Partially reproduced",
  blocked: "Blocked",
  inconclusive: "Inconclusive",
  not_reproduced: "Not reproduced",
};
const FIELD_TITLE: Record<string, string> = {
  research_objective: "Research objective",
  hypothesis: "Hypothesis",
  methodology: "Methodology",
  model_information: "Model",
  dataset_information: "Datasets",
  preprocessing: "Preprocessing",
  training_procedure: "Training procedure",
  evaluation_method: "Evaluation",
  assumptions: "Assumptions",
};

const cell = (v: unknown) => (v === null || v === undefined || v === "" ? "–" : String(v).replace(/\|/g, "\\|").replace(/\n/g, " "));
const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "–" : v.toFixed(d));
const signed = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`);

export function reportMarkdown(r: Report): string {
  const p = r.project;
  const paper = p.primary_paper;
  const out: string[] = [];
  out.push(`# Reproduction report: ${p.title}`, "");
  out.push(`Generated ${r.generated_at.slice(0, 10)} by PaperTrail.${p.is_demo ? " **Demonstration data.**" : ""}`, "");
  out.push(`**Conclusion: ${p.outcome ? OUTCOME[p.outcome] : "not yet recorded"}.** ${p.outcome_notes ?? ""}`, "");
  out.push("This report records what was attempted and what was observed. It is not a certification of the original work's scientific validity.", "");

  out.push("## 1. Original paper", "");
  if (paper) {
    out.push(`${paper.authors.join(", ")}. *${paper.title}.* ${paper.venue ?? ""} ${paper.publication_year ?? ""}`.trim(), "");
    if (paper.doi) out.push(`- DOI: https://doi.org/${paper.doi}`);
    if (paper.arxiv_id) out.push(`- arXiv: https://arxiv.org/abs/${paper.arxiv_id}`);
    out.push("");
  } else out.push("No paper linked.", "");

  out.push("## 2–4. Objective, original methodology and reproduction protocol", "");
  const evidence = (r.protocol.evidence ?? {}) as Record<string, { source: keyof typeof PROVENANCE_LABEL; note?: string | null }>;
  for (const f of PROTOCOL_FIELDS) {
    const v = r.protocol[f] as string | null;
    out.push(`**${FIELD_TITLE[f]}.** ${v ?? "_Not documented._"}`);
    if (evidence[f]) out.push(`_Source: ${PROVENANCE_LABEL[evidence[f].source]}${evidence[f].note ? ` — ${evidence[f].note}` : ""}_`);
    out.push("");
  }
  const setup = (r.protocol.experimental_setup ?? {}) as Record<string, unknown>;
  const hp = (setup.hyperparameters ?? {}) as Record<string, unknown>;
  if (Object.keys(hp).length) {
    out.push("| Hyperparameter | Value | Source |", "|---|---|---|");
    for (const [k, v] of Object.entries(hp)) out.push(`| ${cell(k)} | ${cell(v)} | ${evidence[`hp:${k}`] ? PROVENANCE_LABEL[evidence[`hp:${k}`].source] : "–"} |`);
    out.push("");
  }
  for (const k of ["seeds", "splits", "hardware", "frameworks"]) if (setup[k]) out.push(`- ${k[0].toUpperCase() + k.slice(1)}: ${setup[k]}`);
  out.push("");

  out.push("## 5. Code", "", `${p.code_url ?? "No repository recorded"}${p.code_commit ? ` at commit \`${p.code_commit}\`` : ""}`, "");

  out.push("## 6. Datasets", "");
  if (r.datasets.length) {
    out.push("| Dataset | Status | Version | Source |", "|---|---|---|---|");
    for (const d of r.datasets) out.push(`| ${cell(d.name)} | ${d.status} | ${cell(d.version)} | ${cell(d.sources.map((s) => `${s.relation} ${s.title}${s.year ? ` (${s.year})` : ""}`).join("; "))} |`);
  } else out.push("None recorded.");
  out.push("");

  out.push("## 7–8. Execution environments and configurations", "");
  out.push(`${r.runStats.total} run(s): ${r.runStats.completed} completed, ${r.runStats.failed} failed, in ${r.runStats.groups} run group(s).`, "");
  if (r.environments.length) {
    out.push("| Python | Operating system | Commit | Runs |", "|---|---|---|---|");
    for (const e of r.environments) out.push(`| ${cell(e.python_version)} | ${cell(e.operating_system)} | ${e.git_commit ? `\`${e.git_commit.slice(0, 12)}\`` : "–"} | ${e.n} |`);
    out.push("");
  }
  for (const c of r.configurations) out.push(`- \`${c.run_group}\` (${c.n} runs): ${cell(JSON.stringify(c.parameters))}`);
  out.push("");

  out.push("## 9–11. Published results, reproduced results and comparison", "");
  for (const c of r.comparisons) {
    const m = c.metric;
    out.push(`### ${m.label}`, "");
    out.push(`- Published: **${m.metric_value}${m.metric_unit ?? ""}** ${m.metric_name}; ${m.aggregation ?? "aggregation not stated"}${m.reported_runs ? ` (n = ${m.reported_runs})` : ""}; spread ${m.dispersion ?? "not reported"}`);
    out.push(`- Source: ${m.source_reference ?? "not recorded"} (${PROVENANCE_LABEL[m.provenance as keyof typeof PROVENANCE_LABEL] ?? m.provenance})`);
    if (m.tolerance !== null) out.push(`- Tolerance set by the researcher: ±${m.tolerance}${m.tolerance_reason ? ` (${m.tolerance_reason})` : ""}`);
    out.push("");
    if (c.state === "blocked") out.push(`**Blocked.** ${m.blocked_reason}`, "");
    else if (!c.groups.length) out.push("No runs recorded.", "");
    else {
      out.push("| Run group | Runs | Mean | SD | 95% CI of mean | Difference | 95% CI of difference | State |", "|---|---|---|---|---|---|---|---|");
      for (const g of c.groups) {
        const s = g.summary;
        out.push(`| ${g.run_group} | ${g.runs_used} | ${num(s?.mean)} | ${num(s?.sd ?? null)} | ${s && s.ci_low !== null ? `${num(s.ci_low)} to ${num(s.ci_high)}` : "–"} | ${signed(g.diff)} | ${g.diff_interval ? `${signed(g.diff_interval.ci_low)} to ${signed(g.diff_interval.ci_high)}` : "–"} | ${g.state} |`);
      }
      out.push("");
      for (const g of c.groups) {
        if (g.diff_interval) out.push(`- ${g.run_group}: ${g.diff_interval.assumption}`);
        for (const n of g.notes) out.push(`- ${g.run_group}: ${n.level === "invalid" ? "**Comparison not valid:** " : ""}${n.text}`);
      }
      out.push("");
    }
    out.push(`Researcher's conclusion: ${m.verdict ? m.verdict.replace("_", " ") : "not recorded"}. ${m.verdict_note ?? ""}`, "");
  }

  out.push("## 12. Deviations from the original methodology", "");
  if (r.deviations.length) {
    out.push("| ID | Type | What changed | Why | Expected effect |", "|---|---|---|---|---|");
    for (const d of r.deviations) out.push(`| ${d.key} | ${d.kind} | ${cell(d.what)} | ${cell(d.why)} | ${cell(d.expected_effect)} |`);
  } else out.push("None recorded.");
  out.push("");

  out.push("## 13. Known limitations", "", p.limitations ?? "None recorded.", "");

  out.push("## 14. Discrepancies", "");
  if (r.discrepancies.length) {
    out.push("| Discrepancy | Category | Severity | Cause | Status |", "|---|---|---|---|---|");
    for (const d of r.discrepancies) out.push(`| ${cell(d.title)} | ${d.category.replace(/_/g, " ")} | ${d.severity} | ${d.cause_status} | ${d.resolution_status.replace("_", " ")} |`);
  } else out.push("None recorded.");
  out.push("");

  out.push("## 15. Conclusion", "", `${p.outcome ? OUTCOME[p.outcome] : "Not yet recorded"}. ${p.outcome_notes ?? ""}`, "");
  return out.join("\n");
}
