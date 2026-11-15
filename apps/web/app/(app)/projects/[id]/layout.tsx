import Link from "next/link";
import { ProjectTabs } from "@/components/ProjectTabs";
import { StatusBadge } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { one } from "@/lib/server/services/common";
import { getProject } from "@/lib/server/services/projects";

const KIND: Record<string, string> = { computational_reproduction: "Computational reproduction", reimplementation: "Reimplementation", replication: "Independent replication" };

export default async function ProjectLayout({ params, children }: { params: Promise<{ id: string }>; children: React.ReactNode }) {
  const { id } = await params;
  const { project, counts } = await pageData(async (db) => {
    const project = await getProject(db, /^[0-9a-f-]{36}$/i.test(id) ? id : "00000000-0000-0000-0000-000000000000");
    const counts = await one<{ runs: number; discrepancies: number; reported: number }>(
      db,
      "select (select count(*)::int from experiment_runs where project_id = $1) as runs, (select count(*)::int from discrepancies where project_id = $1 and resolution_status in ('open','investigating')) as discrepancies, (select count(*)::int from reported_metrics where project_id = $1) as reported",
      [id],
    );
    return { project, counts };
  });
  const paper = project.primary_paper;
  return (
    <>
      <div className="mb-6 print:hidden">
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          <Link href="/projects" className="!text-ink-3 hover:!text-ink">Research projects</Link><span aria-hidden>/</span><span aria-current="page">{project.title}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">{KIND[project.kind]}</span>
          <StatusBadge status={project.status} />
          {project.outcome && <StatusBadge status={project.outcome} label={`outcome: ${project.outcome.replace("_", " ")}`} />}
          {project.is_demo && <span className="chip !py-0.5">Demonstration data</span>}
          {project.role !== "owner" && <span className="chip !py-0.5">You are {project.role === "editor" ? "an editor" : "a viewer"}</span>}
        </div>
        <h1 className="display mt-3 text-[30px] sm:text-[40px]">{project.title}</h1>
        {paper && (
          <p className="mt-2 text-sm text-ink-2">
            {paper.authors.slice(0, 4).join(", ")}{paper.authors.length > 4 ? " et al." : ""}. <Link href={`/library/${paper.id}`} className="italic">{paper.title}</Link>
            {paper.publication_year ? ` (${paper.publication_year})` : ""}
          </p>
        )}
      </div>
      <ProjectTabs id={project.id} counts={{ experiments: counts.runs, discrepancies: counts.discrepancies, results: counts.reported }} />
      {children}
    </>
  );
}
