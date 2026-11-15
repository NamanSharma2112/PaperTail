import Link from "next/link";
import { LinkPaper } from "@/components/ProjectActions";
import { ProtocolEditor, type Protocol } from "@/components/ProtocolEditor";
import { SectionHead } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { listPapers } from "@/lib/server/services/papers";
import { getProject } from "@/lib/server/services/projects";
import { getProtocol } from "@/lib/server/services/protocol";

export default async function PaperTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await pageData(async (db, u) => ({ project: await getProject(db, id), protocol: (await getProtocol(db, id)) as unknown as Protocol, library: await listPapers(db, u.id) }));
  const paper = d.project.primary_paper;
  const canEdit = d.project.role !== "viewer";
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <SectionHead n="01" title="The paper" />
        {paper ? (
          <div className="sheet p-6">
            <p className="eyebrow">{[paper.venue, paper.publication_year].filter(Boolean).join(" · ")}</p>
            <h3 className="title mt-2 text-[22px]"><Link href={`/library/${paper.id}`} className="!text-ink">{paper.title}</Link></h3>
            <p className="mt-1 text-sm text-ink-2">{paper.authors.join(", ")}</p>
            {paper.abstract && <p className="mt-4 text-sm leading-relaxed text-ink-2">{paper.abstract}</p>}
            <p className="mt-4 flex flex-wrap gap-4 text-sm">
              {paper.arxiv_id && <a href={`https://arxiv.org/abs/${paper.arxiv_id}`} target="_blank" rel="noreferrer">arXiv {paper.arxiv_id}</a>}
              {paper.doi && <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer">doi:{paper.doi}</a>}
            </p>
          </div>
        ) : (
          <div className="sheet p-6 text-sm text-ink-2">
            <p>No paper linked yet.</p>
            {canEdit && <LinkPaper projectId={id} papers={d.library.map((p) => ({ id: p.id, title: p.title }))} />}
          </div>
        )}
      </section>
      <section className="space-y-4">
        <SectionHead n="02" title="Original methodology" aside="Describe it as the paper does; mark where each statement comes from." />
        <ProtocolEditor projectId={id} initial={d.protocol} canEdit={canEdit} section="methodology" />
      </section>
    </div>
  );
}
