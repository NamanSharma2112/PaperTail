import { AlertTriangle, BookOpen, FlaskConical } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, SectionHead, Stat, StatGrid, StatusBadge } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { dashboard } from "@/lib/server/services/dashboard";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const { data, user } = await pageData(async (db, u) => ({ data: await dashboard(db, u.id), user: u }));
  const t = data.totals;
  return (
    <>
      <PageHeader eyebrow="Workspace" title={`Hello, ${user.name.split(" ")[0]}`} />
      <StatGrid cols={5}>
        <Stat value={t.papers} label="papers in library" />
        <Stat value={t.active_projects} label="active projects" sub={`${t.projects} in total`} />
        <Stat value={t.runs} label="experiment runs" />
        <Stat value={t.completed_runs} label="completed runs" sub={t.failed_runs ? `${t.failed_runs} failed` : undefined} />
        <Stat value={t.open_discrepancies} label="open discrepancies" />
      </StatGrid>

      {t.projects === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={<BookOpen />}
            title="Start with a paper"
            action={<div className="flex flex-wrap justify-center gap-2"><Link href="/library" className={buttonVariants({ variant: "secondary" })}>Import a paper</Link><Link href="/projects/new" className={`${buttonVariants()} !text-surface`}>Create a project</Link></div>}
          >
            Import the paper you want to reproduce, then create a project for it. Runs you record with the Python package will show up here.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-12 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
          <section className="space-y-4">
            <SectionHead n="01" title="Needs attention" />
            {data.attention.length === 0 ? (
              <p className="sheet px-5 py-4 text-sm text-ink-2">Nothing flagged. Failed runs, open high-severity discrepancies and runs without a published result to compare with appear here.</p>
            ) : (
              <ul className="sheet divide-y divide-line">
                {data.attention.map((a, i) => (
                  <li key={i}>
                    <Link href={`/projects/${a.id}`} className="flex items-start gap-3 px-5 py-3.5 !text-ink !no-underline hover:bg-surface-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" aria-hidden />
                      <span className="min-w-0"><span className="block font-medium">{a.title}</span><span className="text-sm text-ink-2">{a.reason}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <SectionHead n="02" title="Recent runs" className="pt-6" aside={<Link href="/experiments" className="mono">all runs →</Link>} />
            {data.recentRuns.length === 0 ? (
              <EmptyState icon={<FlaskConical />} title="No runs yet">Create an ingestion token in a project&apos;s settings and run your experiment with the papertrail package.</EmptyState>
            ) : (
              <ul className="sheet divide-y divide-line">
                {data.recentRuns.map((r) => (
                  <li key={r.id as string}>
                    <Link href={`/projects/${r.project_id}/experiments/${r.id}`} className="flex items-center gap-3 px-5 py-3 !text-ink !no-underline hover:bg-surface-2">
                      <StatusBadge status={r.status as string} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.name as string} <span className="mono text-xs font-normal text-ink-3">{r.run_group as string}</span></span>
                        <span className="block truncate text-xs text-ink-3">{r.project_title as string}</span>
                      </span>
                      <span className="text-xs text-ink-3">{timeAgo(r.at as string)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="space-y-4">
            <SectionHead n="03" title="Recent activity" />
            {data.activity.length === 0 ? (
              <p className="sheet px-5 py-4 text-sm text-ink-2">No activity yet.</p>
            ) : (
              <ol className="sheet space-y-0 px-5 py-2">
                {data.activity.map((a) => (
                  <li key={a.id as string} className="relative border-l border-line py-2.5 pl-4">
                    <span aria-hidden className="absolute -left-[4.5px] top-[15px] size-2 rounded-full border border-line-strong bg-surface" />
                    <p className="text-sm">{a.summary as string}</p>
                    <p className="text-xs text-ink-3"><Link href={`/projects/${a.project_id}`} className="!text-ink-3">{a.project_title as string}</Link> · {timeAgo(a.created_at as string)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </>
  );
}
