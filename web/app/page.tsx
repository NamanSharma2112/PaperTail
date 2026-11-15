import Link from "next/link";
import { NewProjectForm } from "@/components/NewProjectForm";
import { VERDICT_LABEL } from "@/components/VerdictBadge";
import { apiGet, KIND_LABEL, type ProjectSummary } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Home() {
  let projects: ProjectSummary[] | null = null;
  let unreachable = false;
  try {
    projects = await apiGet<ProjectSummary[]>("/api/projects");
  } catch {
    unreachable = true;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reproductions</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Each project takes one paper, the numbers it reports, and the runs that test them. Runs are recorded on your own machine and sent here; nothing is executed on this server.
        </p>
      </div>

      {unreachable && (
        <p role="alert" className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          The PaperTrail API is not reachable. Start it with <code className="font-mono">uvicorn papertrail_api.main:app</code> in <code className="font-mono">backend/</code>, then reload.
        </p>
      )}

      {projects && projects.length === 0 && (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-2">No projects yet. Import a paper below to start the first one.</p>
      )}

      {projects && projects.length > 0 && (
        <ul className="space-y-3">
          {projects.map((p) => (
            <li key={p.slug} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/projects/${p.slug}`} className="text-base font-semibold">
                  {p.title}
                </Link>
                <span className="text-xs text-ink-3">{KIND_LABEL[p.kind] ?? p.kind}</span>
              </div>
              <p className="mt-1 text-sm text-ink-2">
                {p.paper.authors.slice(0, 3).join(", ")}
                {p.paper.authors.length > 3 ? " et al." : ""}. <em>{p.paper.title}</em>
              </p>
              <p className="num mt-3 text-sm">
                {p.claims} {p.claims === 1 ? "claim" : "claims"}
                {Object.entries(p.verdicts).length > 0 && (
                  <span className="text-ink-2">
                    {" "}
                    ({Object.entries(p.verdicts)
                      .map(([v, n]) => `${n} ${(VERDICT_LABEL[v] ?? v).toLowerCase()}`)
                      .join(", ")}
                    )
                  </span>
                )}
                <span className="text-ink-3"> · </span>
                {p.runs} runs<span className="text-ink-3"> · </span>
                {p.deviations} {p.deviations === 1 ? "deviation" : "deviations"}
              </p>
            </li>
          ))}
        </ul>
      )}

      <NewProjectForm />
    </div>
  );
}
