import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { EmptyState, StatusBadge } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { rows } from "@/lib/server/services/common";
import { listPapers } from "@/lib/server/services/papers";

export const metadata = { title: "Search" };

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 200);
  const { papers, projects } = await pageData(async (db, u) => {
    if (!q) return { papers: [], projects: [] };
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    return {
      papers: await listPapers(db, u.id, { q }),
      projects: await rows<{ id: string; title: string; status: string }>(db, "select id, title, status from projects where title ilike $1 or coalesce(description,'') ilike $1 order by updated_at desc limit 50", [like]),
    };
  });
  return (
    <>
      <PageHeader crumbs={[{ label: "Search" }]} title={q ? `Results for “${q}”` : "Search"} />
      {!q ? (
        <p className="text-sm text-ink-2">Type in the search box above.</p>
      ) : papers.length + projects.length === 0 ? (
        <EmptyState title="Nothing found">No paper or project matches “{q}”.</EmptyState>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="eyebrow mb-3">Projects · {projects.length}</h2>
            <ul className="sheet divide-y divide-line">
              {projects.map((p) => <li key={p.id}><Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 !text-ink !no-underline hover:bg-surface-2">{p.title}<StatusBadge status={p.status} /></Link></li>)}
              {!projects.length && <li className="px-5 py-3 text-sm text-ink-3">None</li>}
            </ul>
          </section>
          <section>
            <h2 className="eyebrow mb-3">Papers · {papers.length}</h2>
            <ul className="sheet divide-y divide-line">
              {papers.map((p) => <li key={p.id}><Link href={`/library/${p.id}`} className="block px-5 py-3 !text-ink !no-underline hover:bg-surface-2">{p.title}<span className="block text-xs text-ink-3">{p.authors.slice(0, 3).join(", ")}</span></Link></li>)}
              {!papers.length && <li className="px-5 py-3 text-sm text-ink-3">None</li>}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
