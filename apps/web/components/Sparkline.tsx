/** Tiny line of a metric over steps: 2px line, end dot, axis-free. */
export function Sparkline({ points, label }: { points: [number, number][]; label: string }) {
  const W = 120, H = 28, P = 3;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => P + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * P);
  const sy = (y: number) => H - P - ((y - y0) / (y1 - y0 || 1)) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg width={W} height={H} role="img" aria-label={`${label} over ${points.length} steps, from ${ys[0].toPrecision(4)} to ${last[1].toPrecision(4)}`}>
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(last[0])} cy={sy(last[1])} r={2.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={1} />
    </svg>
  );
}
