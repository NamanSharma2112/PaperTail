import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { RunsTable } from "@/components/RunsTable";
import { SdkSnippet } from "@/components/SdkSnippet";
import { EmptyState, SectionHead } from "@/components/ui/misc";
import { RUN_STATUS } from "@/lib/schemas";
import { pageData } from "@/lib/server/page";
import { listRuns } from "@/lib/server/services/runs";
import { cn } from "@/lib/utils";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export default async function ExperimentsTab({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; group?: string; page?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const status = sp.status && (RUN_STATUS as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const d = await pageData((db) => listRuns(db, id, { status, group: sp.group, limit: 100, offset: (page - 1) * 100 }));
  const base = `/projects/${id}/experiments`;
  const q = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams(Object.entries({ status, group: sp.group, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `${base}${u.toString() ? `?${u}` : ""}`;
  };
  const anyRuns = d.groups.length > 0;
  if (!anyRuns) {
    return (
      <div className="space-y-6">
        <EmptyState icon={<FlaskConical />} title="No runs recorded yet">
          Runs are recorded on your own computer and sent here. Create an ingestion token in <Link href={`/projects/${id}/settings`}>Settings</Link>, then use one of the methods below.
        </EmptyState>
        <SdkSnippet projectId={id} appUrl={appUrl()} />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <SectionHead n="01" title="Experiment runs" aside={<span className="mono">{d.total} shown by filter</span>} />
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label !mb-0 mr-1">Status</span>
          {[undefined, ...RUN_STATUS].map((s) => (
            <Link key={s ?? "all"} href={q({ status: s, page: undefined })} className={cn("chip !no-underline", status === s ? "!bg-ink !text-surface" : "!text-ink-2")}>{s ?? "all"}</Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label !mb-0 mr-1">Group</span>
          <Link href={q({ group: undefined, page: undefined })} className={cn("chip !no-underline", !sp.group ? "!bg-ink !text-surface" : "!text-ink-2")}>all</Link>
          {d.groups.map((g) => <Link key={g.run_group} href={q({ group: g.run_group, page: undefined })} className={cn("chip mono !no-underline", sp.group === g.run_group ? "!bg-ink !text-surface" : "!text-ink-2")}>{g.run_group} <span className="opacity-60">{g.n}</span></Link>)}
        </div>
      </div>
      {d.runs.length === 0 ? <p className="sheet px-5 py-4 text-sm text-ink-2">No runs match these filters.</p> : <RunsTable projectId={id} runs={d.runs as never} />}
      {d.total > 100 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={q({ page: String(page - 1) })}>← Newer</Link>}
          <span className="text-ink-3">Page {page} of {Math.ceil(d.total / 100)}</span>
          {page * 100 < d.total && <Link href={q({ page: String(page + 1) })}>Older →</Link>}
        </div>
      )}
      <details className="sheet p-5">
        <summary className="cursor-pointer text-sm font-medium">How to record more runs</summary>
        <div className="mt-4"><SdkSnippet projectId={id} appUrl={appUrl()} /></div>
      </details>
    </div>
  );
}
