import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { EmptyState, StatusBadge } from "@/components/ui/misc";
import { RUN_STATUS } from "@/lib/schemas";
import { pageData } from "@/lib/server/page";
import { rows } from "@/lib/server/services/common";
import { cn, duration, timeAgo } from "@/lib/utils";

export const metadata = { title: "Experiments" };

export default async function AllExperiments({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = sp.status && (RUN_STATUS as readonly string[]).includes(sp.status) ? sp.status : null;
  const runs = await pageData((db) =>
    rows<{ id: string; name: string; status: string; run_group: string; project_id: string; project_title: string; seed: number | null; duration_seconds: number | null; at: string; failure_summary: string | null }>(
      db,
      `select r.id, r.name, r.status, r.run_group, r.project_id, p.title as project_title, r.seed, r.duration_seconds, r.failure_summary, coalesce(r.started_at, r.created_at) as at
         from experiment_runs r join projects p on p.id = r.project_id ${status ? "where r.status = $1" : ""} order by coalesce(r.started_at, r.created_at) desc limit 200`,
      status ? [status] : [],
    ),
  );
  return (
    <>
      <PageHeader crumbs={[{ label: "Experiments" }]} title="Experiments">Every run recorded across your projects, newest first. Open a project to filter by group and compare runs.</PageHeader>
      <div className="mb-5 flex flex-wrap gap-1.5 text-sm">
        {[null, ...RUN_STATUS].map((s) => <Link key={s ?? "all"} href={s ? `/experiments?status=${s}` : "/experiments"} className={cn("chip !no-underline", status === s ? "!bg-ink !text-surface" : "!text-ink-2")}>{s ?? "all"}</Link>)}
      </div>
      {runs.length === 0 ? (
        <EmptyState icon={<FlaskConical />} title={status ? `No ${status} runs` : "No runs yet"}>Runs appear here once the papertrail package sends them from your machine. Each project&apos;s Experiments tab shows how.</EmptyState>
      ) : (
        <ul className="sheet divide-y divide-line">
          {runs.map((r) => (
            <li key={r.id}>
              <Link href={`/projects/${r.project_id}/experiments/${r.id}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3 !text-ink !no-underline hover:bg-surface-2">
                <StatusBadge status={r.status} />
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{r.name} <span className="mono text-xs font-normal text-ink-3">{r.run_group}{r.seed !== null ? ` · seed ${r.seed}` : ""}</span></span><span className="block truncate text-xs text-ink-3">{r.project_title}{r.status === "failed" && r.failure_summary ? ` · ${r.failure_summary.split("\n")[0]}` : ""}</span></span>
                <span className="num text-right text-xs text-ink-3">{duration(r.duration_seconds)}<br />{timeAgo(r.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
