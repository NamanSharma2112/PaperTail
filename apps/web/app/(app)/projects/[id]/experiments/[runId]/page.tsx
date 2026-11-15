import { Download } from "lucide-react";
import Link from "next/link";
import { RunControls, RunNotes } from "@/components/RunActions";
import { Sparkline } from "@/components/Sparkline";
import { buttonVariants } from "@/components/ui/button";
import { SectionHead, StatusBadge } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { getRun, type MetricRow } from "@/lib/server/services/runs";
import { duration } from "@/lib/utils";

export default async function RunPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await params;
  const run = await pageData((db) => getRun(db, /^[0-9a-f-]{36}$/i.test(runId) ? runId : "00000000-0000-0000-0000-000000000000"));
  const byMetric = new Map<string, MetricRow[]>();
  for (const m of run.metrics) byMetric.set(m.metric_name, [...(byMetric.get(m.metric_name) ?? []), m]);
  const packages = Object.entries((run.environment_metadata?.packages ?? {}) as Record<string, string>).sort(([a], [b]) => a.localeCompare(b));
  const hw = run.hardware_information ?? {};
  const canEdit = run.role !== "viewer";
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-ink-3"><Link href={`/projects/${id}/experiments`} className="!text-ink-3">Experiments</Link> / run</p>
          <h2 className="title mt-1 text-[26px]">{run.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={run.status} />
            <span className="chip mono">{run.run_group}</span>
            {run.seed !== null && <span className="chip">seed {run.seed}</span>}
            <span className="text-ink-3">{duration(run.duration_seconds)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Link href={`/projects/${id}/discrepancies?run=${run.id}`} className={`${buttonVariants({ variant: "secondary", size: "sm" })} !no-underline`}>Record a discrepancy</Link>}
          {canEdit && <RunControls projectId={id} runId={run.id} status={run.status} />}
        </div>
      </div>

      {run.failure_summary && (
        <section className="space-y-2">
          <SectionHead title={run.status === "failed" ? "Error" : "Reason"} />
          <pre className="mono max-h-80 overflow-auto rounded-xl border border-line bg-surface-2 p-4 text-xs leading-relaxed">{run.failure_summary}</pre>
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="space-y-3">
          <SectionHead n="01" title="Metrics" />
          {byMetric.size === 0 ? <p className="text-sm text-ink-3">No metrics logged.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="mono border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3"><th className="py-2 pr-3 font-medium">Metric</th><th className="py-2 pr-3 text-right font-medium">Final</th><th className="py-2 pr-3 font-medium">Unit</th><th className="py-2 font-medium">Trend</th></tr></thead>
              <tbody className="num">
                {[...byMetric.entries()].map(([name, obs]) => {
                  const last = obs[obs.length - 1];
                  const stepped = obs.filter((o) => o.metric_step !== null);
                  return (
                    <tr key={name} className="border-b border-line last:border-0">
                      <td className="py-2 pr-3">{name}</td>
                      <td className="py-2 pr-3 text-right font-medium">{Number(last.metric_value).toPrecision(6)}</td>
                      <td className="py-2 pr-3 text-ink-3">{last.metric_unit ?? "–"}</td>
                      <td className="py-2">{stepped.length > 2 ? <Sparkline points={stepped.map((o) => [o.metric_step as number, Number(o.metric_value)])} label={name} /> : <span className="text-xs text-ink-3">{obs.length} value{obs.length > 1 ? "s" : ""}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <SectionHead n="02" title="Parameters" className="pt-6" />
          {Object.keys(run.parameters ?? {}).length === 0 ? <p className="text-sm text-ink-3">None logged.</p> : (
            <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
              {Object.entries(run.parameters).map(([k, v]) => <><dt key={`k${k}`} className="mono text-xs text-ink-3">{k}</dt><dd key={`v${k}`} className="mono break-all text-[13px]">{JSON.stringify(v)}</dd></>)}
            </dl>
          )}
          <SectionHead n="03" title="Artifacts" className="pt-6" />
          {run.artifacts.length === 0 ? <p className="text-sm text-ink-3">No files attached.</p> : (
            <ul className="sheet divide-y divide-line">
              {(run.artifacts as { id: string; file_name: string; file_size: number; checksum: string }[]).map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex-1"><span className="font-medium">{a.file_name}</span><span className="mono block text-[11px] text-ink-3">{(a.file_size / 1024).toFixed(1)} KB · sha256 {a.checksum.slice(0, 16)}…</span></span>
                  <a href={`/api/v1/artifacts/${a.id}`} className={`${buttonVariants({ variant: "ghost", size: "sm" })} !no-underline`} download><Download /> Download</a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-3">
          <SectionHead n="04" title="Code and environment" />
          <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="label !mb-0 pt-0.5">Repository</dt><dd className="break-all">{run.git_repository ?? "–"}</dd>
            <dt className="label !mb-0 pt-0.5">Commit</dt><dd className="mono text-[13px]">{run.git_commit ?? "–"}{run.git_dirty ? <span className="ml-2 chip !py-0 text-[11px]">uncommitted changes</span> : null}</dd>
            <dt className="label !mb-0 pt-0.5">Dataset version</dt><dd>{run.dataset_version ?? "–"}</dd>
            <dt className="label !mb-0 pt-0.5">Python</dt><dd>{run.python_version ?? "–"}</dd>
            <dt className="label !mb-0 pt-0.5">Operating system</dt><dd>{run.operating_system ?? "–"}</dd>
            {Object.entries(hw).map(([k, v]) => <><dt key={`hk${k}`} className="label !mb-0 pt-0.5">{k.replace(/_/g, " ")}</dt><dd key={`hv${k}`}>{Array.isArray(v) ? (v.length ? v.join(", ") : "none") : String(v)}</dd></>)}
            <dt className="label !mb-0 pt-0.5">Started</dt><dd>{run.started_at ? new Date(run.started_at).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "–"}</dd>
            <dt className="label !mb-0 pt-0.5">Finished</dt><dd>{run.completed_at ? new Date(run.completed_at).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "–"}</dd>
          </dl>
          {run.command && <><p className="label pt-2">Command</p><pre className="mono overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs">{run.command}</pre></>}
          {packages.length > 0 && (
            <details className="rounded-xl border border-line p-4">
              <summary className="cursor-pointer text-sm font-medium">{packages.length} installed packages</summary>
              <div className="mono mt-3 grid max-h-72 grid-cols-2 gap-x-4 overflow-y-auto text-xs">{packages.map(([n, v]) => <div key={n} className="flex justify-between gap-2 border-b border-line py-0.5"><span className="truncate">{n}</span><span className="text-ink-3">{v}</span></div>)}</div>
            </details>
          )}
          <div className="pt-4"><RunNotes runId={run.id} notes={run.notes} canEdit={canEdit} /></div>
        </section>
      </div>
    </div>
  );
}
