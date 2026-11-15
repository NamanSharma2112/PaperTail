import { ConnectionList, GraphExplorer } from "@/components/GraphExplorer";
import { apiGet } from "@/lib/api";
import type { WorkspaceGraph } from "@/lib/graph";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  let graph: WorkspaceGraph | null = null;
  try {
    graph = await apiGet<WorkspaceGraph>("/api/graph");
  } catch {
    graph = null;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">How the work connects</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Papers you have reproduced, the claims they make, the datasets those claims were measured on, where each dataset came from, and the papers each one cites. A
          dataset or paper used by more than one reproduction appears once, so overlaps are visible.
        </p>
      </div>
      {!graph ? (
        <p role="alert" className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          The PaperTrail API is not reachable, so there is nothing to draw yet.
        </p>
      ) : graph.nodes.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-2">No projects yet. Import a paper on the Reproductions page and it will appear here.</p>
      ) : (
        <>
          <GraphExplorer graph={graph} />
          <ConnectionList graph={graph} />
          <p className="text-xs text-ink-3">Citation counts and reference lists come from OpenAlex and may differ from a paper&apos;s own bibliography.</p>
        </>
      )}
    </div>
  );
}
