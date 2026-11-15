import { FolderKanban } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, StatusBadge } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { listProjects } from "@/lib/server/services/projects";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Research projects" };

export default async function Projects() {
  const projects = await pageData(listProjects);
  return (
    <>
      <PageHeader crumbs={[{ label: "Research projects" }]} title="Research projects" actions={<Link href="/projects/new" className={`${buttonVariants()} !text-surface !no-underline`}>New project</Link>} />
      {projects.length === 0 ? (
        <EmptyState icon={<FolderKanban />} title="No projects yet" action={<Link href="/projects/new" className={`${buttonVariants()} !text-surface`}>Create a project</Link>}>
          A project holds one paper&apos;s claims, the runs that test them, and what you found.
        </EmptyState>
      ) : (
        <ol className="grid gap-4">
          {projects.map((p, i) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="sheet lift grid gap-4 p-6 !text-ink !no-underline sm:grid-cols-[44px_1fr_auto]">
                <span className="mono text-sm text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={p.status} />
                    {p.outcome && <StatusBadge status={p.outcome} />}
                    {p.is_demo && <span className="chip !py-0.5">Demonstration data</span>}
                    {p.role !== "owner" && <span className="chip !py-0.5">{p.role}</span>}
                  </span>
                  <span className="title mt-2 block text-[20px]">{p.title}</span>
                  {p.paper_title && <span className="mt-1 block truncate text-sm italic text-ink-2">{p.paper_title}</span>}
                </span>
                <span className="num grid grid-cols-3 gap-x-6 gap-y-1 self-start text-right text-sm sm:grid-cols-1">
                  <span><span className="block text-lg font-light">{p.completed_runs}<span className="text-ink-3">/{p.runs}</span></span><span className="mono text-[10px] uppercase tracking-[0.08em] text-ink-3">runs done</span></span>
                  <span><span className="block text-lg font-light">{p.reported_metrics}</span><span className="mono text-[10px] uppercase tracking-[0.08em] text-ink-3">claims</span></span>
                  <span><span className="block text-lg font-light">{p.open_discrepancies}</span><span className="mono text-[10px] uppercase tracking-[0.08em] text-ink-3">open issues</span></span>
                </span>
                <span className="text-xs text-ink-3 sm:col-start-2">Updated {timeAgo(p.updated_at)}{p.last_run_at ? ` · last run ${timeAgo(p.last_run_at)}` : ""}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
