import { Download } from "lucide-react";
import { PrintButton } from "@/components/PrintButton";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/misc";
import { PROTOCOL_FIELDS, PROVENANCE_LABEL } from "@/lib/schemas";
import { pageData } from "@/lib/server/page";
import { buildReport } from "@/lib/server/services/report";
import { fmt, signed } from "@/lib/utils";

const OUTCOME: Record<string, string> = { successful: "Reproduced", partial: "Partially reproduced", blocked: "Blocked", inconclusive: "Inconclusive", not_reproduced: "Not reproduced" };
const FIELD: Record<string, string> = { research_objective: "Research objective", hypothesis: "Hypothesis", methodology: "Methodology", model_information: "Model", dataset_information: "Datasets", preprocessing: "Preprocessing", training_procedure: "Training procedure", evaluation_method: "Evaluation", assumptions: "Assumptions" };

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return <h2 className="section-head mt-10 !text-[20px] break-after-avoid"><span className="marker">§ {n}</span><span className="title">{children}</span></h2>;
}

export default async function ReportTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await pageData((db) => buildReport(db, id));
  const p = r.project;
  const paper = p.primary_paper;
  const ev = (r.protocol.evidence ?? {}) as Record<string, { source: keyof typeof PROVENANCE_LABEL; note?: string | null }>;
  const setup = (r.protocol.experimental_setup ?? {}) as { hyperparameters?: Record<string, unknown>; seeds?: string; splits?: string; hardware?: string; frameworks?: string };
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        <a href={`/api/v1/projects/${id}/report/export`} className={`${buttonVariants()} !text-surface !no-underline`}><Download /> Export Markdown</a>
        <PrintButton />
      </div>
      <article className="report sheet mx-auto max-w-4xl p-7 sm:p-12 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <p className="eyebrow">Reproduction report · generated {r.generated_at.slice(0, 10)}{p.is_demo ? " · demonstration data" : ""}</p>
        <h1 className="display mt-3 text-[34px]">{p.title}</h1>
        <div className="mt-5 rounded-xl border border-line bg-surface-2 p-5">
          <div className="flex flex-wrap items-center gap-2"><span className="label !mb-0">Conclusion</span>{p.outcome ? <StatusBadge status={p.outcome} label={OUTCOME[p.outcome]} /> : <span className="text-sm text-ink-2">Not yet recorded</span>}</div>
          {p.outcome_notes && <p className="mt-2 text-[15px]">{p.outcome_notes}</p>}
          <p className="mt-3 text-xs text-ink-3">This report records what was attempted and observed. It does not certify the original work&apos;s scientific validity.</p>
        </div>

        <H n={1}>Original paper</H>
        {paper ? <p className="mt-3 text-[15px]">{paper.authors.join(", ")}. <em>{paper.title}.</em> {paper.venue} {paper.publication_year}. {paper.doi && <a href={`https://doi.org/${paper.doi}`}>doi:{paper.doi}</a>} {paper.arxiv_id && <a href={`https://arxiv.org/abs/${paper.arxiv_id}`}>arXiv:{paper.arxiv_id}</a>}</p> : <p className="mt-3 text-sm text-ink-3">No paper linked.</p>}

        <H n={2}>Objective, methodology and protocol</H>
        <dl className="mt-3 space-y-4">
          {PROTOCOL_FIELDS.map((f) => (
            <div key={f}>
              <dt className="label">{FIELD[f]}{ev[f] && <span className="ml-2 normal-case tracking-normal text-ink-3">· {PROVENANCE_LABEL[ev[f].source]}{ev[f].note ? ` — ${ev[f].note}` : ""}</span>}</dt>
              <dd className="whitespace-pre-wrap text-[15px]">{(r.protocol[f] as string | null) ?? <span className="text-ink-3">Not documented.</span>}</dd>
            </div>
          ))}
        </dl>
        {setup.hyperparameters && Object.keys(setup.hyperparameters).length > 0 && (
          <table className="num mt-5 w-full text-sm"><thead><tr className="mono border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3"><th className="py-1.5">Hyperparameter</th><th className="py-1.5">Value</th><th className="py-1.5">Source</th></tr></thead>
            <tbody>{Object.entries(setup.hyperparameters).map(([k, v]) => <tr key={k} className="border-b border-line"><td className="mono py-1.5 text-xs">{k}</td><td className="py-1.5">{String(v)}</td><td className="py-1.5 text-ink-2">{ev[`hp:${k}`] ? PROVENANCE_LABEL[ev[`hp:${k}`].source] : "–"}</td></tr>)}</tbody></table>
        )}
        <ul className="mt-4 space-y-1 text-sm">{(["seeds", "splits", "hardware", "frameworks"] as const).filter((k) => setup[k]).map((k) => <li key={k}><span className="label !inline">{k}</span> {setup[k]}</li>)}</ul>

        <H n={3}>Code and datasets</H>
        <p className="mt-3 text-sm">{p.code_url ? <a href={p.code_url}>{p.code_url}</a> : "No repository recorded"}{p.code_commit && <> at <code className="mono text-xs">{p.code_commit}</code></>}</p>
        {r.datasets.length > 0 && <ul className="mt-3 space-y-1 text-sm">{r.datasets.map((d) => <li key={d.key}><strong>{d.name}</strong> ({d.status}){d.version ? `, ${d.version}` : ""}{d.sources.length ? ` — ${d.sources.map((s) => `${s.relation} ${s.title}${s.year ? ` (${s.year})` : ""}`).join("; ")}` : ""}</li>)}</ul>}

        <H n={4}>Execution environments and configurations</H>
        <p className="mt-3 text-sm">{r.runStats.total} runs: {r.runStats.completed} completed, {r.runStats.failed} failed, in {r.runStats.groups} run group(s).</p>
        {r.environments.length > 0 && <table className="num mt-3 w-full text-sm"><thead><tr className="mono border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3"><th className="py-1.5">Python</th><th className="py-1.5">Operating system</th><th className="py-1.5">Commit</th><th className="py-1.5 text-right">Runs</th></tr></thead><tbody>{r.environments.map((e, i) => <tr key={i} className="border-b border-line"><td className="py-1.5">{e.python_version ?? "–"}</td><td className="py-1.5">{e.operating_system ?? "–"}</td><td className="mono py-1.5 text-xs">{e.git_commit?.slice(0, 12) ?? "–"}</td><td className="py-1.5 text-right">{e.n}</td></tr>)}</tbody></table>}
        <ul className="mt-3 space-y-1 text-sm">{r.configurations.map((c) => <li key={c.run_group}><span className="mono text-xs">{c.run_group}</span> ({c.n} runs): <span className="mono text-xs text-ink-2">{JSON.stringify(c.parameters)}</span></li>)}</ul>

        <H n={5}>Published and reproduced results</H>
        {r.comparisons.length === 0 && <p className="mt-3 text-sm text-ink-3">No published results entered.</p>}
        {r.comparisons.map((c) => (
          <div key={c.metric.id} className="mt-5 break-inside-avoid">
            <h3 className="title text-lg">{c.metric.label}</h3>
            <p className="text-sm text-ink-2">Published {c.metric.metric_value}{c.metric.metric_unit ?? ""} ({c.metric.aggregation ?? "aggregation not stated"}{c.metric.reported_runs ? `, n = ${c.metric.reported_runs}` : ""}) · {c.metric.source_reference ?? "source not recorded"}</p>
            {c.state === "blocked" ? <p className="mt-2 text-sm"><strong>Blocked.</strong> {c.metric.blocked_reason}</p> : c.groups.length === 0 ? <p className="mt-2 text-sm text-ink-3">No runs.</p> : (
              <table className="num mt-2 w-full text-sm"><thead><tr className="mono border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3"><th className="py-1.5">Group</th><th className="py-1.5 text-right">n</th><th className="py-1.5 text-right">Mean</th><th className="py-1.5 text-right">SD</th><th className="py-1.5 text-right">95% CI</th><th className="py-1.5 text-right">Difference</th><th className="py-1.5 text-right">95% CI of difference</th></tr></thead>
                <tbody>{c.groups.map((g) => <tr key={g.run_group} className="border-b border-line"><td className="mono py-1.5 text-xs">{g.run_group}{g.state === "invalid" && " (not valid)"}</td><td className="py-1.5 text-right">{g.runs_used}</td><td className="py-1.5 text-right">{fmt(g.summary?.mean)}</td><td className="py-1.5 text-right">{fmt(g.summary?.sd ?? null)}</td><td className="py-1.5 text-right">{g.summary && g.summary.ci_low !== null ? `${fmt(g.summary.ci_low)}–${fmt(g.summary.ci_high)}` : "–"}</td><td className="py-1.5 text-right">{signed(g.diff)}</td><td className="py-1.5 text-right">{g.diff_interval ? `${signed(g.diff_interval.ci_low)} to ${signed(g.diff_interval.ci_high)}` : "–"}</td></tr>)}</tbody></table>
            )}
            <ul className="mt-2 space-y-0.5 text-xs text-ink-2">{c.groups.flatMap((g) => [...(g.diff_interval ? [g.diff_interval.assumption] : []), ...g.notes.map((n) => `${n.level === "invalid" ? "Not valid: " : ""}${n.text}`)].map((t, i) => <li key={`${g.run_group}${i}`}>{g.run_group}: {t}</li>))}</ul>
            <p className="mt-2 text-sm"><span className="label !inline">Researcher&apos;s conclusion</span> {c.metric.verdict ? c.metric.verdict.replace("_", " ") : "not recorded"}{c.metric.verdict_note ? ` — ${c.metric.verdict_note}` : ""}</p>
          </div>
        ))}

        <H n={6}>Deviations from the original methodology</H>
        {r.deviations.length === 0 ? <p className="mt-3 text-sm text-ink-3">None recorded.</p> : <ul className="mt-3 space-y-2 text-sm">{r.deviations.map((d) => <li key={d.key}><span className="mono">{d.key}</span> <span className="label !inline">{d.kind}</span> {d.what}{d.why ? ` — why: ${d.why}` : ""}{d.expected_effect ? ` — expected effect: ${d.expected_effect}` : ""}</li>)}</ul>}

        <H n={7}>Known limitations</H>
        <p className="mt-3 whitespace-pre-wrap text-sm">{p.limitations ?? <span className="text-ink-3">None recorded.</span>}</p>

        <H n={8}>Discrepancies</H>
        {r.discrepancies.length === 0 ? <p className="mt-3 text-sm text-ink-3">None recorded.</p> : <ul className="mt-3 space-y-2 text-sm">{r.discrepancies.map((d, i) => <li key={i}><strong>{d.title}</strong> — {d.category.replace(/_/g, " ")}, {d.severity}, {d.resolution_status.replace("_", " ")}{d.explanation ? `. ${d.cause_status === "confirmed" ? "Confirmed cause" : d.cause_status === "suspected" ? "Suspected cause" : "Ruled out"}: ${d.explanation}` : ""}</li>)}</ul>}
      </article>
    </div>
  );
}
