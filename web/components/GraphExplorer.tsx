"use client";

import Link from "next/link";
import { forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { select } from "d3-selection";
import "d3-transition";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { paperLink, shortLabel, type GraphEdge, type GraphNode, type NodeType, type WorkspaceGraph } from "@/lib/graph";

type SimNode = GraphNode & SimulationNodeDatum & { x: number; y: number };
type SimLink = SimulationLinkDatum<SimNode> & { relation: string; source: SimNode; target: SimNode };
type Kind = "reproduced" | "reference" | "dataset" | "code" | "claim";

const KIND_LABEL: Record<Kind, string> = {
  reproduced: "Reproduced paper",
  reference: "Cited or source paper",
  dataset: "Dataset",
  code: "Code",
  claim: "Claim",
};

const VERDICT: Record<string, { label: string; glyph: string; color: string }> = {
  matched: { label: "Matched", glyph: "✓", color: "var(--good)" },
  not_matched: { label: "Did not match", glyph: "✕", color: "var(--critical)" },
  inconclusive: { label: "Inconclusive", glyph: "?", color: "var(--warning)" },
  blocked: { label: "Blocked", glyph: "⊘", color: "var(--neutral)" },
  none: { label: "No conclusion yet", glyph: "·", color: "var(--neutral)" },
};

const DATASET_STATUS: Record<string, string> = {
  available: "Available",
  partial: "Available, differs from the paper",
  unavailable: "Not available",
};

function kindOf(n: GraphNode): Kind {
  if (n.type === "paper") return n.reproduced ? "reproduced" : "reference";
  return n.type as Kind;
}

function radius(n: GraphNode): number {
  switch (kindOf(n)) {
    case "reproduced":
      return 17;
    case "reference":
      return 4.5 + Math.min(6, 1.2 * Math.log10((n.cited_by_count ?? 0) + 1));
    case "dataset":
      return 10;
    case "code":
      return 10;
    case "claim":
      return 9;
  }
}

/** Papers that a dataset was drawn from: shown with their label, on the middle ring. */
function sourceIds(graph: WorkspaceGraph): Set<string> {
  return new Set(graph.edges.filter((e) => e.relation !== "cites" && e.relation !== "reports" && e.relation !== "implements" && e.relation !== "measured on").map((e) => e.target));
}

const DEG = Math.PI / 180;

function circularMean(angles: number[]): number {
  const x = angles.reduce((a, t) => a + Math.cos(t), 0);
  const y = angles.reduce((a, t) => a + Math.sin(t), 0);
  return Math.atan2(y, x);
}

/** Push sorted angles apart until neighbours are at least `gap` radians apart. */
function spread(items: { angle: number }[], gap: number) {
  items.sort((a, b) => a.angle - b.angle);
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 1; i < items.length; i++) {
      const d = items[i].angle - items[i - 1].angle;
      if (d < gap) {
        const push = (gap - d) / 2;
        items[i - 1].angle -= push;
        items[i].angle += push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/**
 * One reproduced paper: a radial tree around it. Claims and code on the first ring, each
 * dataset in line with the claims measured on it, each source paper outside its
 * datasets, cited papers on the outer ring.
 */
function radialPositions(nodes: SimNode[], links: SimLink[], sources: Set<string>) {
  const centre = nodes.find((n) => kindOf(n) === "reproduced")!;
  centre.x = 0;
  centre.y = 0;
  const pos = (n: SimNode, r: number, a: number) => {
    n.x = r * Math.cos(a);
    n.y = r * Math.sin(a);
  };
  const linked = (id: string, relation: string, outgoing: boolean) =>
    links.filter((l) => l.relation === relation && (outgoing ? l.source.id === id : l.target.id === id)).map((l) => (outgoing ? l.target : l.source));

  // Inner ring: claims grouped by dataset, then code, on the upper 220°: the centre
  // paper's label is wider than the ring and sits below it.
  const claims = nodes.filter((n) => kindOf(n) === "claim");
  const datasetOf = (c: SimNode) => linked(c.id, "measured on", true)[0]?.label ?? "~";
  claims.sort((a, b) => datasetOf(a).localeCompare(datasetOf(b)));
  const inner = [...claims, ...nodes.filter((n) => kindOf(n) === "code")];
  const arcStart = 160 * DEG;
  const arc = 220 * DEG;
  inner.forEach((n, i) => pos(n, 140, arcStart + (arc * (i + 0.5)) / inner.length));
  const angleOf = new Map<string, number>(inner.map((n) => [n.id, Math.atan2(n.y, n.x)]));

  // Datasets: in line with their claims; unclaimed ones fill the remaining arc.
  const datasets = nodes.filter((n) => kindOf(n) === "dataset").map((n) => {
    const claimAngles = linked(n.id, "measured on", false).map((c) => angleOf.get(c.id)).filter((a): a is number => a !== undefined);
    return { n, angle: claimAngles.length ? circularMean(claimAngles) : arcStart + arc };
  });
  datasets.forEach((d) => (d.angle = d.angle < 0 ? d.angle + 2 * Math.PI : d.angle));
  spread(datasets, 24 * DEG);
  datasets.forEach((d) => {
    pos(d.n, 230, d.angle);
    angleOf.set(d.n.id, d.angle);
  });

  // Source papers: outside the datasets drawn from them.
  const srcs = nodes
    .filter((n) => sources.has(n.id))
    .map((n) => {
      const dsAngles = links.filter((l) => l.target.id === n.id && sources.has(l.target.id) && kindOf(l.source) === "dataset").map((l) => angleOf.get(l.source.id)!).filter((a) => a !== undefined);
      return { n, angle: dsAngles.length ? circularMean(dsAngles) : 0 };
    });
  srcs.forEach((d) => (d.angle = d.angle < 0 ? d.angle + 2 * Math.PI : d.angle));
  spread(srcs, 34 * DEG);
  srcs.forEach((d) => pos(d.n, 320, d.angle));

  // Cited papers: evenly round the outside, oldest first, clockwise from the top.
  const refs = nodes.filter((n) => kindOf(n) === "reference" && !sources.has(n.id)).sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  refs.forEach((n, i) => pos(n, 420, -90 * DEG + (2 * Math.PI * i) / refs.length));

  // Anything else (a second reproduced paper's leftovers cannot occur here) stays at 0,0.
}

/**
 * Lay the graph out once, synchronously, so the first frame is already settled.
 * One reproduced paper: a radial tree. Several: a force layout in rings.
 * Afterwards each node is held near its place, so a dragged node springs back gently.
 */
function layout(graph: WorkspaceGraph) {
  const sources = sourceIds(graph);
  const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n, x: 0, y: 0 }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links: SimLink[] = graph.edges
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => ({ source: byId.get(e.source)!, target: byId.get(e.target)!, relation: e.relation }));
  const reproducedCount = nodes.filter((n) => kindOf(n) === "reproduced").length;

  if (reproducedCount === 1) {
    radialPositions(nodes, links, sources);
  } else {
    const ring = (n: SimNode) => {
      const k = kindOf(n);
      if (k === "reproduced") return 90;
      if (k === "claim" || k === "code") return 120;
      if (k === "dataset") return 185;
      if (sources.has(n.id)) return 250;
      return 330;
    };
    const warm = forceSimulation<SimNode>(nodes)
      .force("link", forceLink<SimNode, SimLink>(links).distance((l) => (l.relation === "cites" ? 320 : 70)).strength((l) => (l.relation === "cites" ? 0.02 : 0.25)))
      .force("charge", forceManyBody<SimNode>().strength((n) => (kindOf(n) === "reproduced" ? -400 : -120)))
      // The centre papers' labels are wide, so they get the most room.
      .force("collide", forceCollide<SimNode>((n) => radius(n) + (kindOf(n) === "reproduced" ? 85 : kindOf(n) === "reference" ? 16 : 30)).iterations(3))
      .force("radial", forceRadial<SimNode>(ring, 0, 0).strength(0.9))
      .stop();
    for (let i = 0; i < 500; i++) warm.tick();
  }

  const home = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const sim = forceSimulation<SimNode>(nodes)
    .force("homeX", forceX<SimNode>((n) => home.get(n.id)!.x).strength(0.08))
    .force("homeY", forceY<SimNode>((n) => home.get(n.id)!.y).strength(0.08))
    .force("collide", forceCollide<SimNode>((n) => radius(n) + 6))
    .alpha(0)
    .stop();
  return { nodes, links, sim, byId, sources };
}

function NodeShape({ n, dim }: { n: SimNode; dim: boolean }) {
  const r = radius(n);
  const kind = kindOf(n);
  if (kind === "reproduced") {
    return (
      <>
        <circle r={r + 5} fill="none" stroke="var(--series-1)" strokeWidth={1.5} opacity={dim ? 0.3 : 0.55} />
        <circle r={r} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
        <path d="M-6 0.5 L-1.8 4.5 L6 -4" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  }
  if (kind === "reference") {
    return <circle r={r} fill="var(--surface)" stroke="var(--series-1)" strokeWidth={1.75} />;
  }
  if (kind === "dataset") {
    const unavailable = n.status === "unavailable";
    return (
      <rect
        x={-r}
        y={-r}
        width={2 * r}
        height={2 * r}
        rx={3.5}
        fill={unavailable ? "var(--surface)" : "var(--series-2)"}
        stroke={unavailable ? "var(--series-2)" : "var(--surface)"}
        strokeWidth={unavailable ? 2 : 2}
      />
    );
  }
  if (kind === "code") {
    return <rect x={-r * 0.78} y={-r * 0.78} width={r * 1.56} height={r * 1.56} rx={2.5} transform="rotate(45)" fill="var(--series-3)" stroke="var(--surface)" strokeWidth={2} />;
  }
  const v = VERDICT[n.verdict ?? "none"];
  return (
    <>
      <circle r={r} fill={v.color} stroke="var(--surface)" strokeWidth={2} />
      <text textAnchor="middle" dy="0.35em" fontSize={10} fontWeight={700} fill="#fff" style={{ pointerEvents: "none" }}>
        {v.glyph}
      </text>
    </>
  );
}

function LegendShape({ kind }: { kind: Kind }) {
  const n = { type: kind === "reproduced" || kind === "reference" ? "paper" : kind, reproduced: kind === "reproduced", cited_by_count: 1000, verdict: "matched", status: "available", label: "", id: "", degree: 0 } as GraphNode;
  const scale = kind === "reproduced" ? 0.55 : 0.8;
  return (
    <svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden>
      <g transform={`scale(${scale})`}>
        <NodeShape n={{ ...n, x: 0, y: 0 } as SimNode} dim={false} />
      </g>
    </svg>
  );
}

export function GraphExplorer({ graph }: { graph: WorkspaceGraph }) {
  const { nodes, links, sim, byId, sources } = useMemo(() => layout(graph), [graph]);
  const svgRef = useRef<SVGSVGElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [, setFrame] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<Kind>>(new Set());
  const [query, setQuery] = useState("");
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);

  const neighbors = useMemo(() => {
    const m = new Map<string, { node: SimNode; relation: string; outgoing: boolean }[]>();
    for (const l of links) {
      if (!m.has(l.source.id)) m.set(l.source.id, []);
      if (!m.has(l.target.id)) m.set(l.target.id, []);
      m.get(l.source.id)!.push({ node: l.target, relation: l.relation, outgoing: true });
      m.get(l.target.id)!.push({ node: l.source, relation: l.relation, outgoing: false });
    }
    return m;
  }, [links]);

  const visible = useCallback((n: SimNode) => !hidden.has(kindOf(n)), [hidden]);
  const focus = hovered ?? selected;
  const focusSet = useMemo(() => {
    if (!focus) return null;
    return new Set([focus, ...(neighbors.get(focus) ?? []).map((x) => x.node.id)]);
  }, [focus, neighbors]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes.filter((n) => visible(n) && n.label.toLowerCase().includes(q)).slice(0, 6);
  }, [query, nodes, visible]);

  // Pan and zoom on the background; nodes handle their own pointer events.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .filter((ev: Event & { button?: number; ctrlKey?: boolean; type: string; target: EventTarget | null }) => {
        if ((ev.target as Element | null)?.closest?.("[data-node]")) return false;
        return (!ev.ctrlKey || ev.type === "wheel") && !ev.button;
      })
      .on("zoom", (ev) => setTransform({ x: ev.transform.x, y: ev.transform.y, k: ev.transform.k }));
    zoomRef.current = z;
    select(svg).call(z).on("dblclick.zoom", null);
    return () => {
      select(svg).on(".zoom", null);
    };
  }, []);

  const fit = useCallback(
    (ids?: string[], animate = true) => {
      const svg = svgRef.current;
      const z = zoomRef.current;
      if (!svg || !z) return;
      const pick = nodes.filter((n) => visible(n) && (!ids || ids.includes(n.id)));
      if (pick.length === 0) return;
      const pad = 40;
      const top = (toolbarRef.current?.offsetHeight ?? 80) + 24; // room for the search box and filters
      const minX = Math.min(...pick.map((n) => n.x - radius(n)));
      const maxX = Math.max(...pick.map((n) => n.x + radius(n)));
      const minY = Math.min(...pick.map((n) => n.y - radius(n)));
      const maxY = Math.max(...pick.map((n) => n.y + radius(n)));
      const { width, height } = svg.getBoundingClientRect();
      const labelRoom = 26; // labels hang below nodes
      const k = Math.max(0.3, Math.min(ids ? 2 : 1.6, (width - 2 * pad) / Math.max(1, maxX - minX), (height - top - pad - labelRoom) / Math.max(1, maxY - minY)));
      const t = zoomIdentity
        .translate(width / 2 - (k * (minX + maxX)) / 2, top + (height - top - pad - labelRoom) / 2 - (k * (minY + maxY)) / 2)
        .scale(k);
      const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const sel = select(svg);
      if (animate && !reduce) {
        sel.transition().duration(320).call(z.transform, t);
      } else {
        sel.call(z.transform, t);
      }
    },
    [nodes, visible],
  );

  useEffect(() => {
    fit(undefined, false);
  }, [fit]);

  // Re-render while the simulation is warm (after a drag), at most once per frame.
  useEffect(() => {
    let raf = 0;
    sim.on("tick", () => {
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        setFrame((f) => f + 1);
      });
    });
    return () => {
      sim.on("tick", null);
      sim.stop();
      cancelAnimationFrame(raf);
    };
  }, [sim]);

  function toGraph(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - transform.x) / transform.k, y: (clientY - rect.top - transform.y) / transform.k };
  }

  function onNodePointerDown(e: React.PointerEvent, n: SimNode) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { id: n.id, startX: e.clientX, startY: e.clientY, moved: false };
  }

  function onNodePointerMove(e: React.PointerEvent, n: SimNode) {
    const d = drag.current;
    if (!d || d.id !== n.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    if (!d.moved) {
      d.moved = true;
      sim.alphaTarget(0.12).restart();
    }
    const p = toGraph(e.clientX, e.clientY);
    n.fx = p.x;
    n.fy = p.y;
  }

  function onNodePointerUp(e: React.PointerEvent, n: SimNode) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      sim.alphaTarget(0);
      n.fx = null;
      n.fy = null;
    } else {
      setSelected((s) => (s === n.id ? null : n.id));
    }
  }

  function selectAndCenter(id: string) {
    setSelected(id);
    setQuery("");
    fit([id, ...(neighbors.get(id) ?? []).map((x) => x.node.id)]);
  }

  function toggleKind(kind: Kind) {
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const showLabel = (n: SimNode) => {
    const kind = kindOf(n);
    if (focusSet) return focusSet.has(n.id);
    if (kind !== "reference") return true;
    return sources.has(n.id) || transform.k > 1.6;
  };

  const hoveredNode = hovered ? byId.get(hovered) : null;
  const selectedNode = selected ? byId.get(selected) : null;
  const kinds: Kind[] = ["reproduced", "reference", "dataset", "code", "claim"];
  const counts = Object.fromEntries(kinds.map((k) => [k, nodes.filter((n) => kindOf(n) === k).length])) as Record<Kind, number>;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
        <div ref={toolbarRef} className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-wrap items-start gap-2 [&>*]:pointer-events-auto">
          <div className="relative w-full max-w-[260px]">
            <label htmlFor="graph-search" className="sr-only">
              Find a paper, dataset or claim
            </label>
            <input
              id="graph-search"
              className="field !py-1.5 shadow-sm"
              placeholder="Find a paper, dataset, claim…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) selectAndCenter(matches[0].id);
                if (e.key === "Escape") setQuery("");
              }}
            />
            {matches.length > 0 && (
              <ul className="panel-in absolute mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm shadow-lg">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2" onClick={() => selectAndCenter(m.id)}>
                      <LegendShape kind={kindOf(m)} />
                      <span className="truncate">{m.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show or hide kinds of node">
            {kinds
              .filter((k) => counts[k] > 0)
              .map((k) => {
                const off = hidden.has(k);
                return (
                  <button
                    key={k}
                    onClick={() => toggleKind(k)}
                    aria-pressed={!off}
                    className={`press inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${
                      off ? "border-line bg-surface text-ink-3 line-through" : "border-line bg-surface text-ink"
                    }`}
                  >
                    <span className={off ? "opacity-40" : ""}>
                      <LegendShape kind={k} />
                    </span>
                    {KIND_LABEL[k]}
                    <span className="num text-ink-3">{counts[k]}</span>
                  </button>
                );
              })}
          </div>
        </div>

        <svg
          ref={svgRef}
          className="block h-[calc(100vh-220px)] min-h-[520px] w-full cursor-grab touch-none select-none active:cursor-grabbing"
          role="img"
          aria-label={`Graph of ${counts.reproduced} reproduced papers, ${counts.reference} cited papers, ${counts.dataset} datasets, ${counts.code} code repositories and ${counts.claim} claims. The same connections are listed below the graph.`}
          onClick={(e) => {
            if (!(e.target as Element).closest("[data-node]")) setSelected(null);
          }}
          onPointerMove={(e) => {
            const rect = svgRef.current!.getBoundingClientRect();
            setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }}
          onPointerLeave={() => setPointer(null)}
        >
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
            <g>
              {links.map((l, i) => {
                if (!visible(l.source) || !visible(l.target)) return null;
                const on = focus && (l.source.id === focus || l.target.id === focus);
                const faded = focusSet && !on;
                return (
                  <line
                    key={i}
                    className="fade"
                    x1={l.source.x}
                    y1={l.source.y}
                    x2={l.target.x}
                    y2={l.target.y}
                    stroke={on ? "var(--edge-strong)" : "var(--edge)"}
                    strokeWidth={(on ? 1.6 : l.relation === "cites" ? 1 : 1.4) / Math.sqrt(transform.k)}
                    opacity={faded ? 0.25 : 1}
                  />
                );
              })}
            </g>
            {focus &&
              links
                .filter((l) => (l.source.id === focus || l.target.id === focus) && visible(l.source) && visible(l.target))
                .map((l, i) => (
                  <text
                    key={i}
                    x={(l.source.x + l.target.x) / 2}
                    y={(l.source.y + l.target.y) / 2}
                    textAnchor="middle"
                    dy="-0.4em"
                    fontSize={10 / Math.sqrt(transform.k)}
                    fill="var(--text-muted)"
                    stroke="var(--surface)"
                    strokeWidth={3 / Math.sqrt(transform.k)}
                    paintOrder="stroke"
                    style={{ pointerEvents: "none" }}
                  >
                    {l.relation}
                  </text>
                ))}
            {nodes
              .filter(visible)
              .sort((a, b) => (kindOf(a) === "reference" ? 0 : 1) - (kindOf(b) === "reference" ? 0 : 1))
              .map((n, i) => {
                const dim = !!focusSet && !focusSet.has(n.id);
                const isSel = selected === n.id;
                const r = radius(n);
                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`}>
                    <g
                      data-node
                      className="node-in fade cursor-pointer"
                      style={{ animationDelay: `${Math.min(i * 14, 420)}ms` }}
                      opacity={dim ? 0.2 : 1}
                      onPointerEnter={() => setHovered(n.id)}
                      onPointerLeave={() => setHovered((h) => (h === n.id ? null : h))}
                      onPointerDown={(e) => onNodePointerDown(e, n)}
                      onPointerMove={(e) => onNodePointerMove(e, n)}
                      onPointerUp={(e) => onNodePointerUp(e, n)}
                    >
                      {/* hit target larger than the mark */}
                      <circle r={r + 8} fill="transparent" />
                      {isSel && <circle r={r + 9} fill="none" stroke="var(--text-primary)" strokeWidth={1.5 / Math.sqrt(transform.k)} />}
                      <NodeShape n={n} dim={dim} />
                    </g>
                    {showLabel(n) && (
                      <text
                        className="fade"
                        y={r + (kindOf(n) === "reproduced" ? 20 : 13)}
                        textAnchor="middle"
                        fontSize={(kindOf(n) === "reproduced" ? 12.5 : 11) / Math.sqrt(transform.k)}
                        fontWeight={kindOf(n) === "reproduced" || kindOf(n) === "dataset" ? 600 : 500}
                        fill={kindOf(n) === "reference" ? "var(--text-secondary)" : "var(--text-primary)"}
                        stroke="var(--surface)"
                        strokeWidth={3.5 / Math.sqrt(transform.k)}
                        paintOrder="stroke"
                        opacity={dim ? 0.2 : 1}
                        style={{ pointerEvents: "none" }}
                      >
                        {shortLabel(kindOf(n) === "claim" ? claimShort(n.label) : n.label, kindOf(n) === "reproduced" ? 44 : 30)}
                      </text>
                    )}
                  </g>
                );
              })}
          </g>
        </svg>

        {hoveredNode && pointer && !drag.current && (
          <div
            className="panel-in pointer-events-none absolute z-20 max-w-[280px] rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(pointer.x + 14, (svgRef.current?.clientWidth ?? 600) - 290), top: pointer.y + 14 }}
          >
            <div className="flex items-center gap-1.5 text-ink-3">
              <LegendShape kind={kindOf(hoveredNode)} />
              {KIND_LABEL[kindOf(hoveredNode)]}
            </div>
            <div className="mt-0.5 font-semibold text-ink">{hoveredNode.label}</div>
            <div className="num mt-0.5 text-ink-2">{summaryLine(hoveredNode, neighbors.get(hoveredNode.id)?.length ?? 0)}</div>
          </div>
        )}

        <div className="absolute bottom-3 left-3 z-10 flex overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
          {[
            { label: "Zoom in", text: "+", act: () => svgRef.current && zoomRef.current && select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 1.3) },
            { label: "Zoom out", text: "−", act: () => svgRef.current && zoomRef.current && select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 1 / 1.3) },
            { label: "Fit everything", text: "Fit", act: () => fit() },
          ].map((b) => (
            <button key={b.label} aria-label={b.label} title={b.label} onClick={b.act} className="press min-w-9 border-r border-line px-2.5 py-1.5 text-sm font-semibold text-ink-2 last:border-r-0 hover:bg-surface-2 hover:text-ink">
              {b.text}
            </button>
          ))}
        </div>
        <p className="pointer-events-none absolute bottom-3 right-3 hidden text-xs text-ink-3 sm:block">Drag to pan · scroll to zoom · click a node for details</p>
      </div>

      <aside className="space-y-4">
        {selectedNode ? (
          <Inspector key={selectedNode.id} node={selectedNode} links={neighbors.get(selectedNode.id) ?? []} onSelect={selectAndCenter} onClose={() => setSelected(null)} />
        ) : (
          <Overview graph={graph} nodes={nodes} counts={counts} onSelect={selectAndCenter} />
        )}
      </aside>
    </div>
  );
}

/** "Table 2: GCN on Cora" -> "Cora": the full text is in the tooltip and the panel. */
function claimShort(label: string): string {
  const m = label.match(/\bon ([^:]+)$/);
  return m ? m[1] : label;
}

function summaryLine(n: GraphNode, links: number): string {
  const kind = kindOf(n);
  if (kind === "claim") {
    const v = VERDICT[n.verdict ?? "none"].label;
    const unit = n.unit ?? "";
    const rep = n.reproduced_value ?? null;
    return `Reported ${n.reported}${unit}${rep !== null ? ` · reproduced ${rep.toFixed(2)}${unit}` : ""} · ${v}`;
  }
  if (kind === "dataset") return `${DATASET_STATUS[n.status ?? "available"]} · ${links} connections`;
  if (kind === "code") return n.commit ? `Commit ${n.commit.slice(0, 10)}` : "Repository";
  const parts = [n.year ? String(n.year) : null, n.cited_by_count ? `${n.cited_by_count.toLocaleString()} citations (OpenAlex)` : null, `${links} connections here`];
  return parts.filter(Boolean).join(" · ");
}

function Inspector({
  node,
  links,
  onSelect,
  onClose,
}: {
  node: SimNode;
  links: { node: SimNode; relation: string; outgoing: boolean }[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const kind = kindOf(node);
  const href = node.type === "paper" ? paperLink(node) : node.url ?? null;
  const project = node.type === "claim" ? node.project : node.reproduced ? node.projects?.[0] : undefined;
  return (
    <div className="panel-in rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
          <LegendShape kind={kind} />
          {KIND_LABEL[kind]}
        </div>
        <button onClick={onClose} aria-label="Close details" className="press -mr-1 -mt-1 rounded-md px-2 py-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
          ✕
        </button>
      </div>
      <h2 className="mt-1.5 text-[15px] font-semibold leading-snug">{node.label}</h2>
      {node.authors && node.authors.length > 0 && (
        <p className="mt-1 text-xs text-ink-2">
          {node.authors.slice(0, 4).join(", ")}
          {node.authors.length > 4 ? " et al." : ""}
          {node.year ? ` · ${node.year}` : ""}
        </p>
      )}

      <dl className="num mt-3 space-y-1.5 text-sm">
        {node.type === "paper" && node.cited_by_count != null && (
          <Row label="Citations" value={`${node.cited_by_count.toLocaleString()} (OpenAlex)`} />
        )}
        {node.type === "dataset" && <Row label="Status" value={DATASET_STATUS[node.status ?? "available"]} />}
        {node.type === "code" && node.commit && <Row label="Commit" value={<code className="font-mono text-xs">{node.commit.slice(0, 12)}</code>} />}
        {node.type === "claim" && (
          <>
            <Row label="Reported" value={`${node.reported}${node.unit ?? ""} ${node.metric ?? ""}`} />
            <Row label="Reproduced" value={node.reproduced_value != null ? `${node.reproduced_value.toFixed(2)}${node.unit ?? ""} (mean of ${node.runs} runs)` : "Not run"} />
            <Row
              label="Conclusion"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: VERDICT[node.verdict ?? "none"].color }}>
                    {VERDICT[node.verdict ?? "none"].glyph}
                  </span>
                  {VERDICT[node.verdict ?? "none"].label}
                </span>
              }
            />
          </>
        )}
      </dl>
      {node.note && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-2">{node.note}</p>}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {project && <Link href={`/projects/${project}`}>Open reproduction</Link>}
        {href && (
          <a href={href} target="_blank" rel="noreferrer">
            {node.type === "paper" ? (node.arxiv_id ? "arXiv" : "Publisher") : "Source"} ↗
          </a>
        )}
      </div>

      <h3 className="mt-4 border-t border-line pt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Connected to {links.length}</h3>
      <ul className="mt-2 max-h-[340px] space-y-0.5 overflow-y-auto pr-1">
        {links
          .slice()
          .sort((a, b) => a.relation.localeCompare(b.relation))
          .map((l, i) => (
            <li key={i}>
              <button onClick={() => onSelect(l.node.id)} className="press flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-surface-2">
                <span className="mt-0.5 shrink-0">
                  <LegendShape kind={kindOf(l.node)} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] text-ink-3">{l.outgoing ? l.relation : `${l.relation} (from)`}</span>
                  <span className="block truncate">{l.node.label}</span>
                </span>
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function Overview({
  graph,
  nodes,
  counts,
  onSelect,
}: {
  graph: WorkspaceGraph;
  nodes: SimNode[];
  counts: Record<Kind, number>;
  onSelect: (id: string) => void;
}) {
  const hubs = nodes.slice().sort((a, b) => b.degree - a.degree).slice(0, 5);
  const shared = nodes.filter((n) => (n.type === "dataset" || n.type === "paper") && (n.projects?.length ?? 0) > 1);
  const sources = nodes.filter((n) => kindOf(n) === "reference" && graph.edges.some((e) => e.target === n.id && e.relation !== "cites"));
  return (
    <div className="panel-in space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">In this workspace</h2>
        <div className="num mt-3 grid grid-cols-2 gap-3">
          <Stat value={counts.reproduced} label="reproduced papers" />
          <Stat value={counts.reference} label="cited or source papers" />
          <Stat value={counts.dataset} label="datasets" />
          <Stat value={graph.edges.length} label="connections" />
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Where the data comes from</h2>
        {sources.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">No dataset sources recorded yet.</p>
        ) : (
          <ul className="mt-2 space-y-0.5">
            {sources.map((n) => (
              <NodeButton key={n.id} n={n} onSelect={onSelect} detail={`source of ${graph.edges.filter((e) => e.target === n.id && e.relation !== "cites").length} dataset(s)`} />
            ))}
          </ul>
        )}
        {shared.length > 0 && (
          <p className="mt-3 text-xs text-ink-2">
            {shared.length} {shared.length === 1 ? "item is" : "items are"} shared by more than one reproduction.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Most connected</h2>
        <ul className="mt-2 space-y-0.5">
          {hubs.map((n) => (
            <NodeButton key={n.id} n={n} onSelect={onSelect} detail={`${n.degree} connections`} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-ink-2">{label}</div>
    </div>
  );
}

function NodeButton({ n, onSelect, detail }: { n: GraphNode; onSelect: (id: string) => void; detail: string }) {
  return (
    <li>
      <button onClick={() => onSelect(n.id)} className="press flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-surface-2">
        <span className="mt-0.5 shrink-0">
          <LegendShape kind={kindOf(n)} />
        </span>
        <span className="min-w-0">
          <span className="block truncate">{n.label}</span>
          <span className="num block text-[11px] text-ink-3">{detail}</span>
        </span>
      </button>
    </li>
  );
}

export function ConnectionList({ graph }: { graph: WorkspaceGraph }) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const rows = graph.edges
    .map((e: GraphEdge) => ({ from: byId.get(e.source), to: byId.get(e.target), relation: e.relation }))
    .filter((r) => r.from && r.to);
  return (
    <details className="rounded-2xl border border-line bg-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold">All {rows.length} connections as a list</summary>
      <div className="mt-3 max-h-[420px] overflow-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th className="py-1.5 pr-3 font-semibold">From</th>
              <th className="py-1.5 pr-3 font-semibold">Relation</th>
              <th className="py-1.5 font-semibold">To</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-3">{r.from!.label}</td>
                <td className="py-1.5 pr-3 text-ink-2">{r.relation}</td>
                <td className="py-1.5">{r.to!.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export type { NodeType };
