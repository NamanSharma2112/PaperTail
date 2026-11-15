export type NodeType = "paper" | "dataset" | "code" | "claim";

export type GraphNode = {
  id: string;
  type: NodeType;
  label: string;
  degree: number;
  projects?: string[];
  // paper
  reproduced?: boolean;
  arxiv_id?: string | null;
  doi?: string | null;
  year?: number | null;
  cited_by_count?: number | null;
  authors?: string[];
  url?: string | null;
  // dataset
  status?: "available" | "partial" | "unavailable";
  note?: string | null;
  // code
  commit?: string | null;
  // claim
  project?: string;
  verdict?: "matched" | "not_matched" | "inconclusive" | "blocked" | null;
  state?: string;
  reported?: number;
  reproduced_value?: number | null;
  unit?: string | null;
  metric?: string;
  runs?: number;
};

export type GraphEdge = { source: string; target: string; relation: string };

export type WorkspaceGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: Record<string, number>;
};

export function paperLink(n: GraphNode): string | null {
  if (n.arxiv_id) return `https://arxiv.org/abs/${n.arxiv_id}`;
  if (n.doi) return `https://doi.org/${n.doi}`;
  return n.url ?? null;
}

export function shortLabel(text: string, max = 34): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}
