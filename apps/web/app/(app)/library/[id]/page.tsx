import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { DeletePaper, PaperEditor } from "@/components/PaperActions";
import { buttonVariants } from "@/components/ui/button";
import { SectionHead, StatusBadge } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { getPaper } from "@/lib/server/services/papers";

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const paper = await pageData((db) => getPaper(db, /^[0-9a-f-]{36}$/i.test(id) ? id : "00000000-0000-0000-0000-000000000000"));
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/library", label: "Paper library" }, { label: paper.title.length > 50 ? paper.title.slice(0, 50) + "…" : paper.title }]}
        eyebrow={[paper.venue, paper.publication_year].filter(Boolean).join(" · ") || "Paper"}
        title={paper.title}
        actions={<Link href={`/projects/new?paper=${paper.id}`} className={`${buttonVariants()} !text-surface !no-underline`}>Create reproduction project</Link>}
      >
        {paper.authors.join(", ")}
      </PageHeader>
      <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-8">
          <section className="space-y-3">
            <SectionHead title="Abstract" />
            <p className="text-[15px] leading-relaxed text-ink-2">{paper.abstract ?? "No abstract in the metadata source."}</p>
          </section>
          <section className="space-y-3">
            <SectionHead title="Identifiers and links" />
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[120px_1fr]">
              {paper.doi && <><dt className="label !mb-0 pt-0.5">DOI</dt><dd><a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer">{paper.doi} <ExternalLink className="inline size-3" /></a></dd></>}
              {paper.arxiv_id && <><dt className="label !mb-0 pt-0.5">arXiv</dt><dd><a href={`https://arxiv.org/abs/${paper.arxiv_id}`} target="_blank" rel="noreferrer">{paper.arxiv_id} <ExternalLink className="inline size-3" /></a></dd></>}
              {paper.landing_url && <><dt className="label !mb-0 pt-0.5">Landing page</dt><dd className="break-all"><a href={paper.landing_url} target="_blank" rel="noreferrer">{paper.landing_url.replace(/^https?:\/\//, "")}</a></dd></>}
              {paper.pdf_url && <><dt className="label !mb-0 pt-0.5">Public PDF</dt><dd className="break-all"><a href={paper.pdf_url} target="_blank" rel="noreferrer">{paper.pdf_url.replace(/^https?:\/\//, "")}</a></dd></>}
              {paper.publisher && <><dt className="label !mb-0 pt-0.5">Publisher</dt><dd>{paper.publisher}</dd></>}
              <dt className="label !mb-0 pt-0.5">Metadata from</dt><dd className="mono text-xs">{paper.metadata_source}</dd>
            </dl>
          </section>
          <section className="space-y-3">
            <SectionHead title="Reproduction projects" />
            {paper.projects.length === 0 ? (
              <p className="text-sm text-ink-2">Not linked to a project yet.</p>
            ) : (
              <ul className="sheet divide-y divide-line">
                {paper.projects.map((p) => (
                  <li key={p.id}><Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 !text-ink !no-underline hover:bg-surface-2"><span>{p.title}</span><StatusBadge status={p.status} /></Link></li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <div className="sheet p-5"><PaperEditor paper={paper} /></div>
          <DeletePaper id={paper.id} title={paper.title} />
        </aside>
      </div>
    </>
  );
}
