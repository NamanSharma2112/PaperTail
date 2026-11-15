import { FileText } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { EmptyState, StatusBadge } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { listProjects } from "@/lib/server/services/projects";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Reports" };
const OUTCOME: Record<string, string> = { successful: "Reproduced", partial: "Partially reproduced", blocked: "Blocked", inconclusive: "Inconclusive", not_reproduced: "Not reproduced" };

export default async function Reports() {
  const projects = await pageData(listProjects);
  return (
    <>
      <PageHeader crumbs={[{ label: "Reports" }]} title="Reproduction reports">One report per project, built from its record. Open one to read, print or export it as Markdown.</PageHeader>
      {projects.length === 0 ? <EmptyState icon={<FileText />} title="No reports yet">Reports are generated from projects. Create a project first.</EmptyState> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}/report`} className="sheet lift block p-5 !text-ink !no-underline">
                <div className="flex items-center justify-between gap-2">{p.outcome ? <StatusBadge status={p.outcome} label={OUTCOME[p.outcome]} /> : <span className="chip !py-0.5">No conclusion yet</span>}<span className="text-xs text-ink-3">updated {timeAgo(p.updated_at)}</span></div>
                <h3 className="title mt-3 text-lg">{p.title}</h3>
                <p className="num mt-1 text-xs text-ink-3">{p.reported_metrics} published results · {p.completed_runs} completed runs · {p.open_discrepancies} open discrepancies</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
