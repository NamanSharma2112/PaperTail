import Link from "next/link";
import { PageHeader } from "@/components/AppShell";
import { NewProjectForm } from "@/components/NewProjectForm";
import { pageData } from "@/lib/server/page";
import { listPapers } from "@/lib/server/services/papers";

export const metadata = { title: "New project" };

export default async function NewProject({ searchParams }: { searchParams: Promise<{ paper?: string }> }) {
  const { paper } = await searchParams;
  const papers = await pageData((db, u) => listPapers(db, u.id, { sort: "recent" }));
  return (
    <>
      <PageHeader crumbs={[{ href: "/projects", label: "Research projects" }, { label: "New" }]} title="New reproduction project">
        One project tests the claims of one paper. Need a paper first? <Link href="/library">Import it in the library</Link>.
      </PageHeader>
      <div className="sheet max-w-2xl p-6 sm:p-8"><NewProjectForm papers={papers} preselect={paper} /></div>
    </>
  );
}
