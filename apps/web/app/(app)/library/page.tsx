import { BookOpen } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { ImportPaper, READING_LABEL } from "@/components/PaperActions";
import { Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { READING_STATUS } from "@/lib/schemas";
import { pageData } from "@/lib/server/page";
import { listPapers } from "@/lib/server/services/papers";

export const metadata = { title: "Paper library" };

export default async function Library({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; sort?: string }> }) {
  const sp = await searchParams;
  const papers = await pageData((db, u) => listPapers(db, u.id, sp));
  const filtered = Boolean(sp.q || sp.status);
  return (
    <>
      <PageHeader crumbs={[{ label: "Paper library" }]} title="Paper library">
        Papers you are reading or reproducing. Metadata comes from arXiv, Crossref or OpenAlex; PaperTrail stores links, never the PDFs.
      </PageHeader>
      <div className="sheet p-5"><ImportPaper compact /></div>

      <form className="mt-8 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="lib-q">Search</label>
          <input id="lib-q" name="q" defaultValue={sp.q ?? ""} placeholder="Title, author, venue, DOI" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="lib-status">Status</label>
          <Select id="lib-status" name="status" defaultValue={sp.status ?? ""} className="w-40">
            <option value="">Any</option>
            {READING_STATUS.map((s) => <option key={s} value={s}>{READING_LABEL[s]}</option>)}
          </Select>
        </div>
        <div>
          <label className="label" htmlFor="lib-sort">Sort</label>
          <Select id="lib-sort" name="sort" defaultValue={sp.sort ?? "recent"} className="w-40">
            <option value="recent">Recently added</option>
            <option value="year">Publication year</option>
            <option value="title">Title</option>
          </Select>
        </div>
        <button className="btn btn-ghost !h-[38px]" type="submit">Apply</button>
        {filtered && <Link href="/library" className="text-sm">Clear</Link>}
      </form>

      <div className="mt-6">
        {papers.length === 0 ? (
          <EmptyState icon={<BookOpen />} title={filtered ? "No papers match" : "Your library is empty"}>
            {filtered ? "Try a different search or status." : "Import a paper above using its arXiv ID, DOI or URL."}
          </EmptyState>
        ) : (
          <ul className="sheet divide-y divide-line">
            {papers.map((p) => (
              <li key={p.id}>
                <Link href={`/library/${p.id}`} className="grid gap-2 px-5 py-4 !text-ink !no-underline hover:bg-surface-2 sm:grid-cols-[1fr_auto] sm:gap-6">
                  <span className="min-w-0">
                    <span className="block font-medium leading-snug">{p.title}</span>
                    <span className="mt-0.5 block truncate text-sm text-ink-2">
                      {p.authors.slice(0, 4).join(", ")}{p.authors.length > 4 ? " et al." : ""}
                      {p.publication_year ? ` · ${p.publication_year}` : ""}{p.venue ? ` · ${p.venue}` : ""}
                    </span>
                    {p.tags.length > 0 && <span className="mt-1.5 flex flex-wrap gap-1">{p.tags.map((t) => <span key={t} className="chip !py-0 text-[11px]">{t}</span>)}</span>}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-ink-3 sm:flex-col sm:items-end">
                    <span className="chip !py-0.5">{READING_LABEL[p.reading_status]}</span>
                    {p.project_count ? <span>{p.project_count} project{p.project_count > 1 ? "s" : ""}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
