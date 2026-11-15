import { Network } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { ConnectionList, GraphExplorer } from "@/components/GraphExplorer";
import { EmptyState } from "@/components/ui/misc";
import type { WorkspaceGraph } from "@/lib/graph";
import { pageData } from "@/lib/server/page";
import { buildGraph } from "@/lib/server/services/graph";

export const metadata = { title: "Graph" };

export default async function GraphPage() {
  const graph = (await pageData(buildGraph)) as unknown as WorkspaceGraph;
  return (
    <div className="space-y-8">
      <PageHeader crumbs={[{ label: "Graph" }]} eyebrow="Papers, claims, datasets, citations" title="How the work connects">
        The papers you are reproducing, the results they report, the datasets those results were measured on, where each dataset came from, and the papers each one cites. Anything shared between projects appears once.
      </PageHeader>
      {graph.nodes.length === 0 ? (
        <EmptyState icon={<Network />} title="Nothing to draw yet">Create a project with a paper, add published results and datasets, and they will appear here.</EmptyState>
      ) : (
        <>
          <GraphExplorer graph={graph} />
          <ConnectionList graph={graph} />
          <p className="figcap"><b>FIG.</b>Citation counts and reference lists come from OpenAlex where imported and may differ from a paper&apos;s own bibliography.</p>
        </>
      )}
    </div>
  );
}
