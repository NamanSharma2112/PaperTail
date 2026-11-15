import Link from "next/link";
import { NewProjectForm } from "@/components/NewProjectForm";
import { Schematic } from "@/components/Schematic";
import { VERDICT_STYLE } from "@/components/VerdictBadge";
import { apiGet, KIND_LABEL, type ProjectSummary } from "@/lib/api";

export const dynamic = "force-dynamic";

function SectionHead({ n, title, aside }: { n: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="section-head">
      <span className="marker">§ {n}</span>
      <h2>{title}</h2>
      {aside && <span className="ml-auto text-xs text-ink-3">{aside}</span>}
    </div>
  );
}

function VerdictStrip({ p }: { p: ProjectSummary }) {
  const order = ["matched", "not_matched", "inconclusive", "blocked"];
  const counted = order.reduce((a, v) => a + (p.verdicts[v] ?? 0), 0);
  const open = Math.max(0, p.claims - counted);
  return (
    <div className="flex flex-wrap gap-1.5">
      {order
        .filter((v) => p.verdicts[v])
        .map((v) => (
          <span key={v} className="chip num">
            <span aria-hidden className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: VERDICT_STYLE[v].color }}>
              {VERDICT_STYLE[v].glyph}
            </span>
            {p.verdicts[v]} {VERDICT_STYLE[v].label.toLowerCase()}
          </span>
        ))}
      {open > 0 && <span className="chip num">{open} open</span>}
    </div>
  );
}

export default async function Home() {
  let projects: ProjectSummary[] | null = null;
  let unreachable = false;
  try {
    projects = await apiGet<ProjectSummary[]>("/api/projects");
  } catch {
    unreachable = true;
  }
  const totals = projects
    ? {
        claims: projects.reduce((a, p) => a + p.claims, 0),
        runs: projects.reduce((a, p) => a + p.runs, 0),
        deviations: projects.reduce((a, p) => a + p.deviations, 0),
      }
    : null;

  return (
    <div className="space-y-16 sm:space-y-20">
      <section className="rise">
        <p className="eyebrow">A lab manual for computational research</p>
        <h1 className="display mt-4 max-w-4xl text-[40px] sm:text-[60px]">From a published number to evidence you can check.</h1>
        <p className="lede mt-5 max-w-2xl">
          Write down what a paper claims, run the authors&apos; code on your own machine, and keep the record: the environment, every run, every change you had
          to make, and how close the result came.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href="#new" className="btn !text-surface !no-underline">
            Start a reproduction
          </a>
          <Link href="/graph" className="btn btn-ghost !no-underline">
            See how the work connects
          </Link>
        </div>
        <div className="mt-12">
          <Schematic />
        </div>
      </section>

      <section className="space-y-6">
        <SectionHead
          n="01"
          title="Reproductions"
          aside={totals && <span className="num mono">{totals.claims} claims · {totals.runs} runs · {totals.deviations} deviations</span>}
        />
        {unreachable && (
          <p role="alert" className="sheet px-5 py-4 text-sm">
            The PaperTrail API is not reachable. Start it with <code className="mono">uvicorn papertrail_api.main:app</code> in <code className="mono">backend/</code>,
            then reload.
          </p>
        )}
        {projects && projects.length === 0 && <p className="sheet px-5 py-4 text-sm text-ink-2">No records yet. Import a paper below to start the first one.</p>}
        {projects && projects.length > 0 && (
          <ol className="grid gap-4">
            {projects.map((p, i) => (
              <li key={p.slug}>
                <Link href={`/projects/${p.slug}`} className="sheet lift group grid gap-5 p-6 !text-ink !no-underline sm:grid-cols-[56px_1fr_auto] sm:p-7">
                  <span className="mono text-sm text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <p className="eyebrow">{KIND_LABEL[p.kind] ?? p.kind}</p>
                    <h3 className="title mt-2 text-[22px] group-hover:text-accent">{p.title}</h3>
                    <p className="mt-1.5 text-sm text-ink-2">
                      {p.paper.authors.slice(0, 3).join(", ")}
                      {p.paper.authors.length > 3 ? " et al." : ""}. <em>{p.paper.title}</em>
                    </p>
                    <div className="mt-4">
                      <VerdictStrip p={p} />
                    </div>
                  </div>
                  <dl className="num grid grid-cols-3 gap-x-6 gap-y-1 self-start text-right sm:grid-cols-1 sm:gap-y-3">
                    {[
                      [p.runs, "runs"],
                      [p.datasets, "datasets"],
                      [p.deviations, "deviations"],
                    ].map(([v, l]) => (
                      <div key={l as string}>
                        <dd className="text-xl font-light tracking-tight">{v}</dd>
                        <dt className="mono text-[10px] uppercase tracking-[0.08em] text-ink-3">{l}</dt>
                      </div>
                    ))}
                  </dl>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section id="new" className="scroll-mt-24 space-y-6">
        <SectionHead n="02" title="Start a reproduction" />
        <NewProjectForm />
      </section>
    </div>
  );
}
