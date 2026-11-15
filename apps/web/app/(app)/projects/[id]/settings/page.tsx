import { DeleteProject, ProjectSettingsForm, TokenManager } from "@/components/ProjectActions";
import { SectionHead } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { getProject } from "@/lib/server/services/projects";
import { listTokens } from "@/lib/server/services/tokens";

export default async function ProjectSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await pageData(async (db) => {
    const project = await getProject(db, id);
    return { project, tokens: project.role === "viewer" ? [] : await listTokens(db, id) };
  });
  const canEdit = d.project.role !== "viewer";
  return (
    <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
      <section className="space-y-4">
        <SectionHead n="01" title="Project" />
        <div className="sheet p-6"><ProjectSettingsForm project={d.project} canEdit={canEdit} /></div>
      </section>
      <div className="space-y-12">
        {canEdit && (
          <section className="space-y-4">
            <SectionHead n="02" title="Ingestion tokens" />
            <p className="text-sm text-ink-2">The Python package uses a token to send runs to this project only. Tokens are stored as hashes, shown once, and can be revoked at any time.</p>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <div className="sheet p-5"><TokenManager projectId={id} tokens={d.tokens as any} appUrl={process.env.APP_URL ?? "http://localhost:3000"} /></div>
          </section>
        )}
        {d.project.role === "owner" && (
          <section className="space-y-4">
            <SectionHead n="03" title="Danger zone" />
            <div className="rounded-[14px] border border-[color-mix(in_oklab,var(--critical)_40%,var(--border))] p-5">
              <p className="mb-4 text-sm text-ink-2">Deleting a project removes all of its data. It cannot be undone.</p>
              <DeleteProject id={id} title={d.project.title} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
