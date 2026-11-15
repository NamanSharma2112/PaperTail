import type { Claim } from "@/lib/api";
import { fmt, signed } from "@/lib/api";
import { StripPlot } from "./StripPlot";
import { VerdictBadge } from "./VerdictBadge";

export function ClaimCard({ claim, index, datasetName }: { claim: Claim; index: string; datasetName?: string }) {
  const unit = claim.unit ?? "";
  const runSets = claim.comparison.run_sets;
  const assumption = runSets.find((rs) => rs.diff_interval)?.diff_interval?.assumption;
  const notes = runSets.flatMap((rs) => rs.notes.map((n) => ({ ...n, runSet: rs.run_set })));

  return (
    <section className="sheet p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-4">
          <span className="mono pt-1.5 text-xs text-ink-3">{index}</span>
          <div>
            <h3 className="title text-[21px]">{claim.label}</h3>
            <p className="mt-1 text-sm text-ink-2">
              Reported{" "}
              <span className="num font-medium text-ink">
                {fmt(claim.reported_value, 1)}
                {unit}
              </span>{" "}
              {claim.metric}
              {datasetName && <> · measured on {datasetName}</>}
              {claim.provenance === "inferred" && " · inferred by the researcher, not stated by the authors"}
            </p>
          </div>
        </div>
        <VerdictBadge verdict={claim.verdict} />
      </div>

      <dl className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="label !mb-0 pt-0.5">Aggregation</dt>
        <dd className="text-ink-2">{claim.aggregation ?? "Not stated"}</dd>
        <dt className="label !mb-0 pt-0.5">Spread reported</dt>
        <dd className="text-ink-2">
          {claim.reported_dispersion !== null
            ? `${fmt(claim.reported_dispersion)}${unit} (${claim.dispersion_kind ?? "kind not stated"})`
            : "None"}
        </dd>
        <dt className="label !mb-0 pt-0.5">Source</dt>
        <dd className="text-ink-2">{claim.source ?? "Not recorded"}</dd>
        {claim.tolerance !== null && (
          <>
            <dt className="label !mb-0 pt-0.5">Tolerance</dt>
            <dd className="text-ink-2">
              ±{fmt(claim.tolerance)}
              {unit}
              {claim.tolerance_reason ? ` (${claim.tolerance_reason})` : ""}
            </dd>
          </>
        )}
      </dl>

      {claim.blocked_reason ? (
        <p className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-3 text-sm">
          <span className="font-medium">Could not be attempted.</span> {claim.blocked_reason}
        </p>
      ) : runSets.every((rs) => rs.n === 0) ? (
        <p className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-3 text-sm text-ink-2">No runs recorded for this claim yet.</p>
      ) : (
        <>
          <figure className="dot-grid mt-6 rounded-xl border border-line p-4 sm:p-5">
            <StripPlot runSets={runSets} published={claim.reported_value} unit={unit} />
            <figcaption className="figcap mt-3 border-t border-line pt-3">
              <b>FIG. {index}</b>Each dot is one recorded run{datasetName ? ` on ${datasetName}` : ""}. The dark tick and bar are the mean and its 95% interval;
              the vertical line is the published {fmt(claim.reported_value, 1)}
              {unit}.
            </figcaption>
          </figure>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="mono border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
                  <th className="py-1.5 pr-3 font-semibold">Run set</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Runs</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Mean</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">SD</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">95% CI of mean</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Difference</th>
                  <th className="py-1.5 text-right font-semibold">95% CI of difference</th>
                </tr>
              </thead>
              <tbody className="num">
                {runSets.map((rs) => (
                  <tr key={rs.run_set} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-3">
                      {rs.run_set}
                      {rs.exploratory && <span className="ml-1.5 text-xs text-ink-3">exploratory</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {rs.n}
                      {rs.runs_failed > 0 && <span className="text-ink-3"> (+{rs.runs_failed} failed)</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{fmt(rs.summary?.mean)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(rs.summary?.sd)}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {rs.summary && rs.summary.ci_low !== null
                        ? `${fmt(rs.summary.ci_low)} to ${fmt(rs.summary.ci_high)}`
                        : "–"}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-semibold">{signed(rs.diff)}</td>
                    <td className="py-1.5 text-right">
                      {rs.diff_interval ? `${signed(rs.diff_interval.ci_low)} to ${signed(rs.diff_interval.ci_high)}` : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {assumption && <p className="mt-2 text-xs text-ink-3">Interval for the difference: {assumption}</p>}
          {notes.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {notes.map((n, i) => (
                <li key={i} className="flex gap-2 rounded-xl bg-surface-2 px-4 py-2.5 text-sm">
                  <span aria-hidden className="font-bold" style={{ color: n.level === "warning" ? "var(--warning)" : "var(--neutral)" }}>
                    {n.level === "warning" ? "▲" : "●"}
                  </span>
                  <span>
                    <span className="font-semibold">{n.runSet}:</span> {n.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {claim.verdict_note && (
        <p className="mt-6 border-t border-line pt-4 text-[15px]">
          <span className="label !inline !text-[10.5px]">Conclusion</span>{" "}
          <span className="text-ink-2">{claim.verdict_note}</span>
        </p>
      )}
    </section>
  );
}
