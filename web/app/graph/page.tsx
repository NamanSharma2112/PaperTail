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
      <div className="rise">
        <p className="eyebrow">Graph · papers, claims, datasets, citations</p>
        <h1 className="display mt-4 text-[36px] sm:text-[52px]">How the work connects</h1>
        <p className="lede mt-4 max-w-3xl">
          Papers you have reproduced, the claims they make, the datasets those claims were measured on, where each dataset came from, and the papers each one cites. A
          dataset or paper used by more than one reproduction appears once, so overlaps are visible.
        </p>
      </div>
      {!graph ? (
        <p role="alert" className="sheet px-5 py-4 text-sm">
          The PaperTrail API is not reachable, so there is nothing to draw yet.
        </p>
      ) : graph.nodes.length === 0 ? (
        <p className="sheet px-5 py-4 text-sm text-ink-2">No projects yet. Import a paper on the Reproductions page and it will appear here.</p>
      ) : (
        <>
          <GraphExplorer graph={graph} />
          <ConnectionList graph={graph} />
          <p className="figcap">
            <b>FIG. 2</b>Rings from the centre: the reproduced paper; its claims and code; the datasets the claims were measured on; the papers those datasets came
            from; the papers it cites. Citation counts and reference lists come from OpenAlex and may differ from a paper&apos;s own bibliography.
          </p>
        </>
      )}
    </div>
  );
}
