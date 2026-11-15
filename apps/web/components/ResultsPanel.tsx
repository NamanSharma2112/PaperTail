"use client";
import { AlertOctagon, AlertTriangle, Info, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StripPlot } from "@/components/StripPlot";
import { VerdictBadge, type Verdict } from "@/components/VerdictBadge";
import { Button } from "@/components/ui/button";
import { ConfirmButton, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { PROVENANCE, PROVENANCE_LABEL } from "@/lib/schemas";
import { api, fmt, signed } from "@/lib/utils";

type Metric = Record<string, unknown> & {
  id: string; key: string; label: string; metric_name: string; metric_value: number; metric_unit: string | null; run_value_scale: number; direction: string;
  aggregation: string | null; reported_runs: number | null; dispersion: number | null; dispersion_kind: string | null; dataset_key: string | null; source_reference: string | null;
  reported_conditions: string | null; provenance: string; run_groups: string[]; tolerance: number | null; tolerance_reason: string | null; blocked_reason: string | null;
  verdict: Verdict | null; verdict_note: string | null; notes: string | null;
};
type Note = { code: string; level: "info" | "warning" | "invalid"; text: string };
type Group = {
  run_group: string; runs_total: number; runs_used: number; points: { run_id: string; name: string; seed: number | null; value: number }[];
  summary: { n: number; mean: number; sd: number | null; ci_low: number | null; ci_high: number | null } | null;
  diff: number | null; relative_diff_percent: number | null; diff_interval: { ci_low: number; ci_high: number; assumption: string } | null;
  share_within_tolerance: number | null; notes: Note[]; state: string;
};
export type Comparison = { metric: Metric; state: string; groups: Group[] };

const num = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : Number(v));
const str = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : String(v).trim());

export function MetricDialog({ projectId, metric, groups, datasets, trigger }: { projectId: string; metric?: Metric; groups: string[]; datasets: { key: string; name: string }[]; trigger: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = metric;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(null); }} wide title={m ? `Edit “${m.label}”` : "Add a published result"} description="Enter the number exactly as the paper reports it, and how the paper says it was produced." trigger={trigger}>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError(null);
          try {
            await api(`/api/v1/projects/${projectId}/reported-metrics`, {
              method: "PUT",
              json: {
                key: m?.key ?? str(f.get("key")),
                label: str(f.get("label")),
                metric_name: str(f.get("metric_name")),
                metric_value: num(f.get("metric_value")),
                metric_unit: str(f.get("metric_unit")),
                run_value_scale: num(f.get("run_value_scale")) ?? 1,
                direction: f.get("direction"),
                aggregation: str(f.get("aggregation")),
                reported_runs: num(f.get("reported_runs")),
                dispersion: num(f.get("dispersion")),
                dispersion_kind: str(f.get("dispersion_kind")),
                dataset_key: str(f.get("dataset_key")),
                source_reference: str(f.get("source_reference")),
                reported_conditions: str(f.get("reported_conditions")),
                provenance: f.get("provenance"),
                run_groups: f.getAll("run_groups").map(String),
                tolerance: num(f.get("tolerance")),
                tolerance_reason: str(f.get("tolerance_reason")),
                blocked_reason: str(f.get("blocked_reason")),
                verdict: str(f.get("verdict")),
                verdict_note: str(f.get("verdict_note")),
                notes: m?.notes ?? null,
              },
            });
            toast("success", "Published result saved");
            setOpen(false);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save");
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <p role="alert" className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-[var(--critical)]">{error}</p>}
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="eyebrow mb-2">As reported by the paper</legend>
          <Field label="Label" htmlFor="m-label" className="sm:col-span-2"><Input id="m-label" name="label" defaultValue={m?.label} placeholder="Table 2: GCN on Cora" required /></Field>
          {!m && <Field label="Short key" htmlFor="m-key"><Input id="m-key" name="key" className="mono !text-[13px]" placeholder="t2-cora" required pattern="[A-Za-z0-9][A-Za-z0-9_.\-]*" /></Field>}
          <Field label="Metric name your runs log" htmlFor="m-name" hint="Must match the name passed to log_metrics."><Input id="m-name" name="metric_name" className="mono !text-[13px]" defaultValue={m?.metric_name} placeholder="test_accuracy" required /></Field>
          <Field label="Reported value" htmlFor="m-value"><Input id="m-value" name="metric_value" type="number" step="any" defaultValue={m?.metric_value} required /></Field>
          <Field label="Unit" htmlFor="m-unit"><Input id="m-unit" name="metric_unit" defaultValue={m?.metric_unit ?? ""} placeholder="%" /></Field>
          <Field label="How the paper aggregated it" htmlFor="m-agg" className="sm:col-span-2"><Input id="m-agg" name="aggregation" defaultValue={m?.aggregation ?? ""} placeholder="mean of 100 runs with random initialisations" /></Field>
          <Field label="Number of runs aggregated" htmlFor="m-n" hint="Leave empty if the paper does not say."><Input id="m-n" name="reported_runs" type="number" min={1} defaultValue={m?.reported_runs ?? ""} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Spread reported" htmlFor="m-disp"><Input id="m-disp" name="dispersion" type="number" step="any" min={0} defaultValue={m?.dispersion ?? ""} /></Field>
            <Field label="Kind" htmlFor="m-dk"><Select id="m-dk" name="dispersion_kind" defaultValue={m?.dispersion_kind ?? ""}><option value="">–</option><option value="sd">SD</option><option value="se">SE</option><option value="ci95">95% CI half-width</option><option value="range">range</option><option value="other">other</option></Select></Field>
          </div>
          <Field label="Where in the paper" htmlFor="m-src"><Input id="m-src" name="source_reference" defaultValue={m?.source_reference ?? ""} placeholder="Table 2, Section 6.1" /></Field>
          <Field label="This value is" htmlFor="m-prov"><Select id="m-prov" name="provenance" defaultValue={m?.provenance ?? "reported"}>{PROVENANCE.map((p) => <option key={p} value={p}>{PROVENANCE_LABEL[p]}</option>)}</Select></Field>
          <Field label="Dataset" htmlFor="m-ds"><Select id="m-ds" name="dataset_key" defaultValue={m?.dataset_key ?? ""}><option value="">–</option>{datasets.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</Select></Field>
          <Field label="Which direction is better" htmlFor="m-dir"><Select id="m-dir" name="direction" defaultValue={m?.direction ?? "none"}><option value="none">Not specified</option><option value="higher">Higher</option><option value="lower">Lower</option></Select></Field>
          <Field label="Conditions" htmlFor="m-cond" className="sm:col-span-2"><Textarea id="m-cond" name="reported_conditions" rows={2} defaultValue={m?.reported_conditions ?? ""} placeholder="Split, preprocessing, hardware the paper states for this number." /></Field>
        </fieldset>
        <fieldset className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <legend className="eyebrow mb-2">Comparison settings</legend>
          <Field label="Scale run values by" htmlFor="m-scale" hint="e.g. 100 if runs log 0.815 and the paper says 81.5%."><Input id="m-scale" name="run_value_scale" type="number" step="any" min={0} defaultValue={m?.run_value_scale ?? 1} /></Field>
          <Field label="Tolerance (±)" htmlFor="m-tol" hint="Decide before looking at results."><Input id="m-tol" name="tolerance" type="number" step="any" min={0} defaultValue={m?.tolerance ?? ""} /></Field>
          <Field label="Why this tolerance" htmlFor="m-tolr" className="sm:col-span-2"><Input id="m-tolr" name="tolerance_reason" defaultValue={m?.tolerance_reason ?? ""} /></Field>
          <div className="sm:col-span-2">
            <p className="label">Run groups to compare</p>
            {groups.length === 0 ? <p className="text-xs text-ink-3">No runs yet. When none are ticked, every group that logged this metric is compared.</p> : (
              <div className="flex flex-wrap gap-2">{groups.map((g) => <label key={g} className="chip mono cursor-pointer"><input type="checkbox" name="run_groups" value={g} defaultChecked={m?.run_groups.includes(g)} className="accent-[var(--text-primary)]" /> {g}</label>)}</div>
            )}
          </div>
          <Field label="Cannot be attempted because" htmlFor="m-block" className="sm:col-span-2" hint="Fill this only if the claim is blocked, e.g. data not available."><Input id="m-block" name="blocked_reason" defaultValue={m?.blocked_reason ?? ""} /></Field>
        </fieldset>
        <fieldset className="grid gap-4 border-t border-line pt-5 sm:grid-cols-[200px_1fr]">
          <legend className="eyebrow mb-2">Your conclusion</legend>
          <Field label="Verdict" htmlFor="m-verdict"><Select id="m-verdict" name="verdict" defaultValue={m?.verdict ?? ""}><option value="">Not decided</option><option value="matched">Matched</option><option value="not_matched">Did not match</option><option value="inconclusive">Inconclusive</option><option value="blocked">Blocked</option></Select></Field>
          <Field label="Reasoning" htmlFor="m-vn"><Input id="m-vn" name="verdict_note" defaultValue={m?.verdict_note ?? ""} /></Field>
        </fieldset>
        <div className="flex justify-end gap-2"><Button type="submit" loading={busy}>Save</Button></div>
      </form>
    </Dialog>
  );
}

const NOTE_ICON = { info: Info, warning: AlertTriangle, invalid: AlertOctagon };
const NOTE_COLOR = { info: "var(--neutral)", warning: "var(--warning)", invalid: "var(--critical)" };

export function ComparisonCard({ c, index, projectId, canEdit, groups, datasets }: { c: Comparison; index: string; projectId: string; canEdit: boolean; groups: string[]; datasets: { key: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const m = c.metric;
  const unit = m.metric_unit ?? "";
  const rows = c.groups.map((g) => ({ run_set: g.run_group, n: g.runs_used, points: g.points, summary: g.summary }));
  const assumption = c.groups.find((g) => g.diff_interval)?.diff_interval?.assumption;
  const dataset = datasets.find((d) => d.key === m.dataset_key);
  return (
    <section className="sheet p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-4">
          <span className="mono pt-1.5 text-xs text-ink-3">{index}</span>
          <div>
            <h3 className="title text-[21px]">{m.label}</h3>
            <p className="mt-1 text-sm text-ink-2">Published <span className="num font-medium text-ink">{m.metric_value}{unit}</span> <span className="mono text-xs">{m.metric_name}</span>{dataset ? <> · on {dataset.name}</> : null}{m.provenance !== "reported" && <> · <em>{PROVENANCE_LABEL[m.provenance as keyof typeof PROVENANCE_LABEL]}</em></>}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <VerdictBadge verdict={m.verdict} />
          {canEdit && <MetricDialog projectId={projectId} metric={m} groups={groups} datasets={datasets} trigger={<Button variant="ghost" size="icon" aria-label={`Edit ${m.label}`}><Pencil /></Button>} />}
        </div>
      </div>
      <dl className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="label !mb-0 pt-0.5">Aggregation</dt><dd className="text-ink-2">{m.aggregation ?? "Not stated"}{m.reported_runs ? ` (n = ${m.reported_runs})` : ""}</dd>
        <dt className="label !mb-0 pt-0.5">Spread reported</dt><dd className="text-ink-2">{m.dispersion !== null ? `${m.dispersion}${unit} (${m.dispersion_kind ?? "kind not stated"})` : "None"}</dd>
        <dt className="label !mb-0 pt-0.5">Source</dt><dd className="text-ink-2">{m.source_reference ?? "Not recorded"}</dd>
        {m.tolerance !== null && <><dt className="label !mb-0 pt-0.5">Tolerance</dt><dd className="text-ink-2">±{m.tolerance}{unit}{m.tolerance_reason ? ` (${m.tolerance_reason})` : ""}</dd></>}
      </dl>
      {c.state === "blocked" ? (
        <p className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-3 text-sm"><span className="font-medium">Could not be attempted.</span> {m.blocked_reason}</p>
      ) : c.groups.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-3 text-sm text-ink-2">No runs have logged <span className="mono">{m.metric_name}</span> yet.</p>
      ) : (
        <>
          <figure className="dot-grid mt-6 rounded-xl border border-line p-4 sm:p-5">
            <StripPlot runSets={rows} published={m.metric_value} unit={unit} />
            <figcaption className="figcap mt-3 border-t border-line pt-3"><b>FIG. {index}</b>Each dot is one completed run, scaled by {m.run_value_scale}. The dark tick and bar are the mean and its 95% interval; the vertical line is the published value.</figcaption>
          </figure>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead><tr className="mono border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3"><th className="py-1.5 pr-3 font-medium">Run group</th><th className="py-1.5 pr-3 text-right font-medium">Runs</th><th className="py-1.5 pr-3 text-right font-medium">Mean</th><th className="py-1.5 pr-3 text-right font-medium">SD</th><th className="py-1.5 pr-3 text-right font-medium">95% CI of mean</th><th className="py-1.5 pr-3 text-right font-medium">Difference</th><th className="py-1.5 pr-3 text-right font-medium">Relative</th><th className="py-1.5 text-right font-medium">95% CI of difference</th></tr></thead>
              <tbody className="num">
                {c.groups.map((g) => (
                  <tr key={g.run_group} className="border-b border-line last:border-0">
                    <td className="mono py-1.5 pr-3 text-[13px]">{g.run_group}{g.state === "invalid" && <span className="ml-2 font-sans text-xs text-[var(--critical)]">not valid</span>}</td>
                    <td className="py-1.5 pr-3 text-right">{g.runs_used}{g.runs_total > g.runs_used && <span className="text-ink-3"> /{g.runs_total}</span>}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(g.summary?.mean)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(g.summary?.sd ?? null)}</td>
                    <td className="py-1.5 pr-3 text-right">{g.summary && g.summary.ci_low !== null ? `${fmt(g.summary.ci_low)} to ${fmt(g.summary.ci_high)}` : "–"}</td>
                    <td className="py-1.5 pr-3 text-right font-medium">{signed(g.diff)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-2">{g.relative_diff_percent === null ? "–" : `${signed(g.relative_diff_percent, 2)}%`}</td>
                    <td className="py-1.5 text-right">{g.diff_interval ? `${signed(g.diff_interval.ci_low)} to ${signed(g.diff_interval.ci_high)}` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {assumption && <p className="mt-2 text-xs text-ink-3">Interval for the difference: {assumption}</p>}
          <ul className="mt-4 space-y-1.5">
            {c.groups.flatMap((g) => g.notes.map((n, i) => {
              const Icon = NOTE_ICON[n.level];
              return (
                <li key={`${g.run_group}${i}`} className="flex gap-2.5 rounded-xl bg-surface-2 px-4 py-2.5 text-sm">
                  <Icon className="mt-0.5 size-4 shrink-0" style={{ color: NOTE_COLOR[n.level] }} aria-label={n.level} />
                  <span><span className="mono text-xs text-ink-3">{g.run_group}</span> {n.level === "invalid" && <strong>Comparison not valid. </strong>}{n.text}</span>
                </li>
              );
            }))}
            {c.groups.some((g) => g.share_within_tolerance !== null) && c.groups.map((g) => g.share_within_tolerance !== null && (
              <li key={`tol${g.run_group}`} className="flex gap-2.5 rounded-xl bg-surface-2 px-4 py-2.5 text-sm"><Info className="mt-0.5 size-4 shrink-0 text-ink-3" /><span><span className="mono text-xs text-ink-3">{g.run_group}</span> {Math.round(100 * g.share_within_tolerance)}% of individual runs are within ±{m.tolerance}{unit} of the published value.</span></li>
            ))}
          </ul>
        </>
      )}
      {m.verdict_note && <p className="mt-6 border-t border-line pt-4 text-[15px]"><span className="label !inline">Conclusion</span> <span className="text-ink-2">{m.verdict_note}</span></p>}
      {canEdit && (
        <div className="mt-4 flex justify-end">
          <ConfirmButton label="Delete" title={`Delete “${m.label}”?`} description="The published value and your verdict are removed. Runs are not affected." onConfirm={async () => { await api(`/api/v1/projects/${projectId}/reported-metrics/${m.id}`, { method: "DELETE" }); toast("success", "Deleted"); router.refresh(); }} />
        </div>
      )}
    </section>
  );
}
