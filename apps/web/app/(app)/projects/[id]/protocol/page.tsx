import { ProtocolEditor, type Protocol } from "@/components/ProtocolEditor";
import { DatasetList, DeviationList } from "@/components/RecordLists";
import { SectionHead } from "@/components/ui/misc";
import { pageData } from "@/lib/server/page";
import { getProject } from "@/lib/server/services/projects";
import { getProtocol } from "@/lib/server/services/protocol";
import { listDatasets, listDeviations } from "@/lib/server/services/records";

export default async function ProtocolTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await pageData(async (db) => ({
    project: await getProject(db, id),
    protocol: (await getProtocol(db, id)) as unknown as Protocol,
    datasets: await listDatasets(db, id),
    deviations: await listDeviations(db, id),
  }));
  const canEdit = d.project.role !== "viewer";
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <SectionHead n="01" title="Experimental setup" />
        <ProtocolEditor projectId={id} initial={d.protocol} canEdit={canEdit} section="setup" />
      </section>
      <section className="space-y-4">
        <SectionHead n="02" title="Datasets" />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <DatasetList projectId={id} datasets={d.datasets as any} canEdit={canEdit} />
      </section>
      <section className="space-y-4">
        <SectionHead n="03" title="Deviations from the original" />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <DeviationList projectId={id} deviations={d.deviations as any} canEdit={canEdit} />
      </section>
    </div>
  );
}
