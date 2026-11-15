import { CheckCircle2, CircleDashed } from "lucide-react";
import Link from "next/link";
import { SectionHead, Stat, StatGrid, StatusBadge } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { maybeOne } from "@/lib/server/services/common";
import { compareProject } from "@/lib/server/services/comparison";
import { getProject, missingInformation } from "@/lib/server/services/projects";
import { recentActivity } from "@/lib/server/services/records";
import { duration, fmt, signed, timeAgo } from "@/lib/utils";

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await pageData(async (db) => {
    const project = await getProject(db, id);
    const counts = await maybeOne<Record<string, number>>(
      db,
      `select count(*)::int as runs, count(*) filter (where status='completed')::int as completed, count(*) filter (where status='failed')::int as failed,
              count(*) filter (where status='running')::int as running,
              (select count(*)::int from discrepancies where project_id = $1) as discrepancies,
              (select count(*)::int from discrepancies where project_id = $1 and resolution_status in ('open','investigating')) as open_discrepancies,
              (select count(*)::int from deviations where project_id = $1) as deviations
         from experiment_runs where project_id = $1`,
      [id],
    );
    const lastRun = await maybeOne<{ id: string; name: string; status: string; run_group: string; duration_seconds: number | null; at: string }>(
      db, "select id, name, status, run_group, duration_seconds, coalesce(completed_at, started_at, created_at) as at from experiment_runs where project_id = $1 order by coalesce(started_at, created_at) desc limit 1", [id]);
    return { project, counts: counts!, lastRun, missing: await missingInformation(db, id), comparisons: await compareProject(db, id), activity: await recentActivity(db, id, 10) };
  });
  const steps = [
    { done: !!d.project.primary_paper, label: "Paper linked", href: "paper" },
    { done: !d.missing.some((m) => m.key === "protocol"), label: "Objective, methodology and evaluation documented", href: "paper" },
    { done: !d.missing.some((m) => m.key === "code" || m.key === "commit"), label: "Code repository and commit recorded", href: "settings" },
    { done: !d.missing.some((m) => m.key === "datasets"), label: "Datasets recorded", href: "protocol" },
    { done: !d.missing.some((m) => m.key === "reported"), label: "Published results entered", href: "results" },
    { done: d.counts.completed > 0, label: "At least one completed run", href: "experiments" },
    { done: !!d.project.outcome, label: "Conclusion recorded", href: "settings" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <div className="space-y-12">
      <StatGrid cols={5}>
        <Stat value={d.counts.runs} label="experiment runs" sub={d.counts.running ? `${d.counts.running} running` : undefined} />
        <Stat value={d.counts.completed} label="completed" sub={d.counts.failed ? `${d.counts.failed} failed` : undefined} />
        <Stat value={d.comparisons.length} label="published results" />
        <Stat value={d.counts.open_discrepancies} label="open discrepancies" sub={`${d.counts.discrepancies} recorded`} />
        <Stat value={d.counts.deviations} label="deviations logged" />
      </StatGrid>

      <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <section className="space-y-4">
          <SectionHead n="01" title="Progress" aside={<span className="mono">{doneCount}/{steps.length}</span>} />
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={steps.length} aria-label="Record completeness">
            <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${(100 * doneCount) / steps.length}%` }} />
          </div>
          <ul className="space-y-1">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={`/projects/${id}/${s.href}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm !text-ink !no-underline hover:bg-surface-2">
                  {s.done ? <CheckCircle2 className="size-4 text-[var(--good)]" aria-label="done" /> : <CircleDashed className="size-4 text-ink-3" aria-label="to do" />}
                  <span className={s.done ? "text-ink-2" : ""}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          {d.missing.length > 0 && (
            <div className="rounded-xl border border-dashed border-line-strong bg-surface-2 p-4">
              <p className="label">Important missing information</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{d.missing.map((m) => <li key={m.key}>{m.text}</li>)}</ul>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <SectionHead n="02" title="Published results" aside={<Link href={`/projects/${id}/results`} className="mono">compare →</Link>} />
          {d.comparisons.length === 0 ? (
            <p className="sheet px-5 py-4 text-sm text-ink-2">No published results yet. <Link href={`/projects/${id}/results`}>Enter the numbers the paper reports</Link> to compare your runs against them.</p>
          ) : (
            <ul className="sheet divide-y divide-line">
              {d.comparisons.map((c) => {
                const g = c.groups.find((x) => x.summary) ?? null;
                return (
                  <li key={c.metric.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.metric.label}</span>
                      <span className="num text-xs text-ink-3">published {c.metric.metric_value}{c.metric.metric_unit ?? ""}{g ? ` · reproduced ${fmt(g.summary!.mean)} (Δ ${signed(g.diff)}, n=${g.runs_used})` : ""}</span>
                    </span>
                    <StatusBadge status={c.metric.verdict ?? (c.state === "blocked" ? "blocked" : "pending")} label={c.metric.verdict ? c.metric.verdict.replace("_", " ") : c.state === "blocked" ? "blocked" : "no conclusion"} />
                  </li>
                );
              })}
            </ul>
          )}

          <SectionHead n="03" title="Most recent run" className="pt-4" />
          {d.lastRun ? (
            <Link href={`/projects/${id}/experiments/${d.lastRun.id}`} className="sheet flex items-center gap-3 px-5 py-4 !text-ink !no-underline hover:bg-surface-2">
              <StatusBadge status={d.lastRun.status} />
              <span className="flex-1 text-sm font-medium">{d.lastRun.name} <span className="mono text-xs font-normal text-ink-3">{d.lastRun.run_group}</span></span>
              <span className="text-xs text-ink-3">{duration(d.lastRun.duration_seconds)} · {timeAgo(d.lastRun.at)}</span>
            </Link>
          ) : (
            <p className="sheet px-5 py-4 text-sm text-ink-2">No runs yet. <Link href={`/projects/${id}/experiments`}>How to record one →</Link></p>
          )}

          <SectionHead n="04" title="Recent activity" className="pt-4" />
          {d.activity.length === 0 ? <p className="text-sm text-ink-3">Nothing yet.</p> : (
            <ol className="space-y-2">
              {d.activity.map((a) => <li key={a.id as string} className="text-sm"><span className="text-ink-2">{a.summary as string}</span> <span className="text-xs text-ink-3">· {timeAgo(a.created_at as string)}</span></li>)}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
