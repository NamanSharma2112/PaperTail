import { DiscrepancyPanel } from "@/components/DiscrepancyPanel";
import { SectionHead } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { rows } from "@/lib/server/services/common";
import { getProject } from "@/lib/server/services/projects";
import { listDiscrepancies } from "@/lib/server/services/records";

export default async function DiscrepanciesTab({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ run?: string }> }) {
  const { id } = await params;
  const { run } = await searchParams;
  const d = await pageData(async (db) => ({
    project: await getProject(db, id),
    items: await listDiscrepancies(db, id),
    runs: await rows<{ id: string; label: string }>(db, "select id, name || ' (' || run_group || ')' as label from experiment_runs where project_id = $1 order by created_at desc limit 300", [id]),
    metrics: await rows<{ id: string; label: string }>(db, "select id, label from reported_metrics where project_id = $1 order by created_at", [id]),
  }));
  const canEdit = d.project.role !== "viewer";
  return (
    <div className="space-y-6">
      <SectionHead n="01" title="Discrepancies" />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <DiscrepancyPanel projectId={id} items={d.items as any} runs={d.runs} metrics={d.metrics} canEdit={canEdit} openForRun={run && d.runs.some((r) => r.id === run) ? run : undefined} />
    </div>
  );
}
