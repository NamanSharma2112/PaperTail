import type { RunSetComparison } from "@/lib/api";
import { fmt } from "@/lib/api";

const W = 760;
const LEFT = 196;
const RIGHT = 104;
const TOP = 30;
const ROW = 48;
const BOTTOM = 26;

function niceTicks(lo: number, hi: number, target = 5): number[] {
  const span = hi - lo || 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= target + 1) ?? 10 * mag;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
}

/** Deterministic vertical jitter so the plot is identical on every render. */
function jitter(i: number): number {
  return (((i * 2654435761) % 1000) / 1000 - 0.5) * 24;
}

/**
 * One row per run set. Every dot is one run; the dark tick and bar are the mean and
 * its 95% confidence interval; the vertical line is the value the paper reports.
 */
export function StripPlot({ runSets, published, unit }: { runSets: RunSetComparison[]; published: number; unit: string }) {
  const rows = runSets.filter((rs) => rs.n > 0);
  if (rows.length === 0) return null;
  const all = rows.flatMap((rs) => rs.points.map((p) => p.value)).concat(published);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = Math.max((max - min) * 0.06, 0.05);
  const lo = min - pad;
  const hi = max + pad;
  const plotW = W - LEFT - RIGHT;
  const x = (v: number) => LEFT + ((v - lo) / (hi - lo)) * plotW;
  const H = TOP + rows.length * ROW + BOTTOM;
  const ticks = niceTicks(lo, hi);
  const digits = hi - lo < 5 ? 1 : 0;
  const px = x(published);
  const labelOnLeft = px > LEFT + plotW * 0.6;
  const hasBoth = rows.some((r) => r.exploratory) && rows.some((r) => !r.exploratory);

  return (
    <div>
      {hasBoth && (
        <div className="mb-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--series-1)" }} />
            Follows the paper's protocol
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--series-2)" }} />
            Exploratory: something changed on purpose
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[640px]"
          role="img"
          aria-label={`Individual runs compared with the published value ${published}${unit}. ${rows
            .map((r) => `${r.run_set}: ${r.n} runs, mean ${fmt(r.summary?.mean)}${unit}`)
            .join("; ")}.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={TOP} y2={H - BOTTOM} stroke="var(--grid)" strokeWidth={1} />
              <text x={x(t)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--text-muted)" className="num">
                {t.toFixed(digits)}
              </text>
            </g>
          ))}

          {rows.map((rs, r) => {
            const cy = TOP + r * ROW + ROW / 2;
            const color = rs.exploratory ? "var(--series-2)" : "var(--series-1)";
            const s = rs.summary!;
            return (
              <g key={rs.run_set}>
                <text x={0} y={cy - 2} fontSize={12} fontWeight={600} fill="var(--text-primary)">
                  {rs.run_set.length > 28 ? rs.run_set.slice(0, 27) + "…" : rs.run_set}
                </text>
                <text x={0} y={cy + 13} fontSize={11} fill="var(--text-muted)">
                  {rs.n} {rs.n === 1 ? "run" : "runs"}
                  {rs.exploratory ? " · exploratory" : ""}
                </text>
                {rs.points.map((p, i) => (
                  <circle
                    key={p.run_id}
                    cx={x(p.value)}
                    cy={cy + (rs.n > 1 ? jitter(i) : 0)}
                    r={4}
                    fill={color}
                    fillOpacity={0.75}
                    stroke="var(--surface)"
                    strokeWidth={1.5}
                  >
                    <title>{`${p.seed !== null ? `seed ${p.seed}` : `run ${p.run_id}`}: ${p.value.toFixed(1)}${unit}`}</title>
                  </circle>
                ))}
                {s.ci_low !== null && s.ci_high !== null && (
                  <line x1={x(s.ci_low)} x2={x(s.ci_high)} y1={cy} y2={cy} stroke="var(--text-primary)" strokeWidth={2} />
                )}
                {rs.n > 1 && (
                  <line x1={x(s.mean)} x2={x(s.mean)} y1={cy - 15} y2={cy + 15} stroke="var(--text-primary)" strokeWidth={2.5}>
                    <title>{`mean ${s.mean.toFixed(2)}${unit}`}</title>
                  </line>
                )}
                <text x={W} y={cy - 2} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--text-primary)" className="num">
                  {rs.n > 1 ? "mean " : ""}
                  {s.mean.toFixed(2)}
                </text>
                <text x={W} y={cy + 13} textAnchor="end" fontSize={11} fill="var(--text-muted)" className="num">
                  {s.sd !== null ? `SD ${s.sd.toFixed(2)}` : "single run"}
                </text>
              </g>
            );
          })}

          <line x1={px} x2={px} y1={TOP - 8} y2={H - BOTTOM} stroke="var(--text-secondary)" strokeWidth={1.5} />
          <text
            x={labelOnLeft ? px - 6 : px + 6}
            y={TOP - 14}
            textAnchor={labelOnLeft ? "end" : "start"}
            fontSize={12}
            fontWeight={600}
            fill="var(--text-secondary)"
            className="num"
          >
            Published {published.toFixed(1)}
            {unit}
          </text>
        </svg>
      </div>
    </div>
  );
}
