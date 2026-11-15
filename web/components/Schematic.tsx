/**
 * FIG. 1: the reproduction workflow as a technical drawing. Every annotation is a real
 * number from the GCN pilot, so the picture doubles as a worked example.
 */

type Station = { n: string; name: string; notes: [string, string] };

const STATIONS: Station[] = [
  { n: "01", name: "Paper", notes: ["Kipf & Welling", "ICLR 2017"] },
  { n: "02", name: "Claim", notes: ["81.5% on Cora", "mean of 100 runs"] },
  { n: "03", name: "Runs", notes: ["100 seeds, code as", "published, env pinned"] },
  { n: "04", name: "Compare", notes: ["81.47%, Δ −0.03 pp", "95% CI ±0.13"] },
  { n: "05", name: "Report", notes: ["matched, with", "4 deviations logged"] },
];

const INK = "var(--text-primary)";
const MUTED = "var(--text-muted)";
const LINE = "var(--border-strong)";

function Glyph({ i, x, y }: { i: number; x: number; y: number }) {
  const s = { fill: "none", stroke: INK, strokeWidth: 1.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  switch (i) {
    case 0: // paper with folded corner and text lines
      return (
        <g transform={`translate(${x},${y})`}>
          <path d="M-18 -24 H8 L18 -14 V24 H-18 Z" {...s} fill="var(--surface)" />
          <path d="M8 -24 V-14 H18" {...s} />
          {[-10, -3, 4, 11].map((ly, k) => (
            <line key={k} x1={-11} x2={k === 3 ? 2 : 11} y1={ly} y2={ly} stroke={MUTED} strokeWidth={1.2} />
          ))}
        </g>
      );
    case 1: // a single highlighted number
      return (
        <g transform={`translate(${x},${y})`}>
          <rect x={-24} y={-16} width={48} height={32} rx={6} {...s} fill="var(--surface)" />
          <text textAnchor="middle" dy="0.36em" fontSize={13} fontWeight={600} fill={INK} className="num">
            81.5
          </text>
          <circle cx={24} cy={-16} r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
        </g>
      );
    case 2: // a column of runs
      return (
        <g transform={`translate(${x},${y})`}>
          {[
            [-14, -14], [-2, -18], [10, -12], [-10, -2], [4, -4], [15, 2],
            [-16, 10], [-3, 8], [9, 14], [0, 20], [-11, 19], [16, -20],
          ].map(([dx, dy], k) => (
            <circle key={k} cx={dx} cy={dy} r={3} fill="var(--series-1)" fillOpacity={0.8} stroke="var(--surface)" strokeWidth={1.2} />
          ))}
        </g>
      );
    case 3: // runs against the published line
      return (
        <g transform={`translate(${x},${y})`}>
          <line x1={-26} x2={26} y1={16} y2={16} stroke={LINE} strokeWidth={1} />
          {[-20, -12, -7, -3, 0, 2, 5, 9, 14, 21].map((dx, k) => (
            <circle key={k} cx={dx} cy={4 + (k % 3) * 4 - 4} r={2.6} fill="var(--series-1)" fillOpacity={0.75} />
          ))}
          <line x1={-6} x2={6} y1={4} y2={4} stroke={INK} strokeWidth={2} />
          <line x1={0} x2={0} y1={-6} y2={14} stroke={INK} strokeWidth={2} />
          <line x1={1.5} x2={1.5} y1={-22} y2={18} stroke="var(--text-secondary)" strokeWidth={1.2} />
        </g>
      );
    default: // report with a tick
      return (
        <g transform={`translate(${x},${y})`}>
          <rect x={-18} y={-24} width={36} height={48} rx={3} {...s} fill="var(--surface)" />
          <line x1={-10} x2={10} y1={-13} y2={-13} stroke={MUTED} strokeWidth={1.2} />
          <line x1={-10} x2={4} y1={-6} y2={-6} stroke={MUTED} strokeWidth={1.2} />
          <circle cx={0} cy={11} r={8} fill="var(--good)" />
          <path d="M-3.6 11.2 L-1 13.8 L4 8.4" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
  }
}

function Arrow({ x1, y1, x2, y2, delay }: { x1: number; y1: number; x2: number; y2: number; delay: number }) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const horizontal = y1 === y2;
  return (
    <g>
      <line
        className="draw"
        style={{ ["--len" as string]: len, animationDelay: `${delay}ms` } as React.CSSProperties}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={LINE}
        strokeWidth={1.2}
      />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--surface)" strokeWidth={1.4} strokeDasharray="0 0 3 4" opacity={0.9} />
      <path
        d={horizontal ? `M${x2 - 6} ${y2 - 4} L${x2} ${y2} L${x2 - 6} ${y2 + 4}` : `M${x2 - 4} ${y2 - 6} L${x2} ${y2} L${x2 + 4} ${y2 - 6}`}
        fill="none"
        stroke={LINE}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

function Label({ s, x, y, anchor }: { s: Station; x: number; y: number; anchor: "middle" | "start" }) {
  return (
    <g>
      <text x={x} y={y} textAnchor={anchor} fontSize={10.5} letterSpacing="0.08em" fill={MUTED} className="mono">
        {s.n}
        <tspan dx={6} fill={INK} fontWeight={500}>
          {s.name.toUpperCase()}
        </tspan>
      </text>
      <text x={x} y={y + 21} textAnchor={anchor} fontSize={12.5} fill="var(--text-secondary)" className="num">
        {s.notes[0]}
      </text>
      <text x={x} y={y + 38} textAnchor={anchor} fontSize={12.5} fill="var(--text-secondary)" className="num">
        {s.notes[1]}
      </text>
    </g>
  );
}

export function Schematic() {
  return (
    <figure className="sheet plate dot-grid overflow-hidden px-4 pb-4 pt-6 sm:px-6">
      {/* wide */}
      <svg viewBox="0 0 1000 230" className="hidden w-full sm:block" role="img" aria-labelledby="fig1-cap">
        {STATIONS.map((s, i) => {
          const x = 100 + i * 200;
          return (
            <g key={s.n} className="rise" style={{ animationDelay: `${i * 90}ms` }}>
              <circle cx={x} cy={78} r={44} fill="var(--surface)" stroke={LINE} strokeWidth={1} strokeDasharray="2 4" />
              <Glyph i={i} x={x} y={78} />
              <Label s={s} x={x} y={156} anchor="middle" />
            </g>
          );
        })}
        {STATIONS.slice(1).map((_, i) => (
          <Arrow key={i} x1={100 + i * 200 + 52} y1={78} x2={100 + (i + 1) * 200 - 52} y2={78} delay={250 + i * 120} />
        ))}
      </svg>
      {/* narrow */}
      <svg viewBox="0 0 340 560" className="w-full sm:hidden" role="img" aria-labelledby="fig1-cap">
        {STATIONS.map((s, i) => {
          const y = 56 + i * 112;
          return (
            <g key={s.n} className="rise" style={{ animationDelay: `${i * 90}ms` }}>
              <circle cx={52} cy={y} r={40} fill="var(--surface)" stroke={LINE} strokeWidth={1} strokeDasharray="2 4" />
              <Glyph i={i} x={52} y={y} />
              <Label s={s} x={112} y={y - 16} anchor="start" />
            </g>
          );
        })}
        {STATIONS.slice(1).map((_, i) => (
          <Arrow key={i} x1={52} y1={56 + i * 112 + 46} x2={52} y2={56 + (i + 1) * 112 - 46} delay={250 + i * 120} />
        ))}
      </svg>
      <figcaption id="fig1-cap" className="figcap mt-3 border-t border-line pt-3">
        <b>FIG. 1</b>A reproduction in five steps, annotated with the GCN pilot: one number from the paper, the 100 runs that test it, and the record that
        says how close they came.
      </figcaption>
    </figure>
  );
}
