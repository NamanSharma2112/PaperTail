import "server-only";
import type { Db } from "../db";
import { diffCiAssumingEqualSpread, relativeDifference, shareWithin, summarize, type DiffInterval, type Summary } from "../../stats";
import { projectRole, rows } from "./common";

/**
 * Published-versus-reproduced comparison. Separates four kinds of information, as the
 * product requires: the authors' reported value (reported_metrics), independent results
 * (runs), calculated summaries (this module), and the researcher's interpretation
 * (verdict, which this module never sets).
 */

export type ReportedMetric = {
  id: string;
  key: string;
  label: string;
  metric_name: string;
  metric_value: number;
  metric_unit: string | null;
  run_value_scale: number;
  direction: "higher" | "lower" | "none";
  aggregation: string | null;
  reported_runs: number | null;
  dispersion: number | null;
  dispersion_kind: string | null;
  dataset_key: string | null;
  source_reference: string | null;
  reported_conditions: string | null;
  provenance: string;
  run_groups: string[];
  tolerance: number | null;
  tolerance_reason: string | null;
  blocked_reason: string | null;
  verdict: string | null;
  verdict_note: string | null;
  notes: string | null;
};

export type Note = { code: string; level: "info" | "warning" | "invalid"; text: string };

export type GroupComparison = {
  run_group: string;
  runs_total: number;
  runs_used: number;
  runs_excluded: { failed: number; cancelled: number; running: number; missing_metric: number };
  points: { run_id: string; name: string; seed: number | null; value: number }[];
  summary: (Summary | { n: 1; mean: number; sd: null; sem: null; ci_low: null; ci_high: null; min: number; median: number; max: number; confidence: null }) | null;
  diff: number | null;
  relative_diff_percent: number | null;
  diff_interval: (DiffInterval & { assumption: string }) | null;
  share_within_tolerance: number | null;
  notes: Note[];
  state: "not_run" | "partial" | "complete" | "invalid";
};

type RunForComparison = {
  id: string;
  name: string;
  run_group: string;
  status: string;
  seed: number | null;
  parameters: Record<string, unknown>;
  dataset_version: string | null;
  git_commit: string | null;
  git_dirty: boolean | null;
  value: number | null;
  unit: string | null;
};

const SEED_KEYS = /^(seed|random_seed|rng_seed|torch_seed|np_seed)$/i;

/** Pure: compare one reported metric with one group of runs. Exported for tests. */
export function compareGroup(m: ReportedMetric, group: string, runs: RunForComparison[]): GroupComparison {
  const notes: Note[] = [];
  const completed = runs.filter((r) => r.status === "completed");
  const withValue = completed.filter((r) => r.value !== null && Number.isFinite(r.value));
  const excluded = {
    failed: runs.filter((r) => r.status === "failed").length,
    cancelled: runs.filter((r) => r.status === "cancelled").length,
    running: runs.filter((r) => r.status === "running" || r.status === "pending").length,
    missing_metric: completed.length - withValue.length,
  };
  const points = withValue.map((r) => ({ run_id: r.id, name: r.name, seed: r.seed, value: (r.value as number) * m.run_value_scale }));
  const values = points.map((p) => p.value);
  const n = values.length;
  const base: GroupComparison = {
    run_group: group,
    runs_total: runs.length,
    runs_used: n,
    runs_excluded: excluded,
    points,
    summary: null,
    diff: null,
    relative_diff_percent: null,
    diff_interval: null,
    share_within_tolerance: null,
    notes,
    state: "not_run",
  };
  if (excluded.failed + excluded.cancelled) notes.push({ code: "excluded_runs", level: "warning", text: `${excluded.failed} failed and ${excluded.cancelled} cancelled run(s) are excluded.` });
  if (excluded.running) notes.push({ code: "unfinished_runs", level: "info", text: `${excluded.running} run(s) have not finished and are not included.` });
  if (excluded.missing_metric) notes.push({ code: "missing_metric", level: "warning", text: `${excluded.missing_metric} completed run(s) did not log "${m.metric_name}".` });
  if (n === 0) return base;

  // --- compatibility checks: when these fail, the numbers are shown but marked invalid.
  const paramSig = (r: RunForComparison) =>
    JSON.stringify(Object.fromEntries(Object.entries(r.parameters ?? {}).filter(([k]) => !SEED_KEYS.test(k)).sort(([a], [b]) => a.localeCompare(b))));
  const sigs = new Set(withValue.map(paramSig));
  if (sigs.size > 1) {
    notes.push({ code: "mixed_configurations", level: "invalid", text: "Runs in this group were logged with different parameters (other than the seed). Summarising them together mixes configurations; split them into separate run groups." });
  }
  const datasets = new Set(withValue.map((r) => r.dataset_version ?? "∅"));
  if (datasets.size > 1) notes.push({ code: "mixed_datasets", level: "invalid", text: "Runs in this group used different dataset versions." });
  const commits = new Set(withValue.map((r) => r.git_commit ?? "∅"));
  if (commits.size > 1) notes.push({ code: "mixed_code", level: "warning", text: "Runs in this group come from different code commits." });
  if (withValue.some((r) => r.git_dirty)) notes.push({ code: "dirty_tree", level: "warning", text: "Some runs had uncommitted code changes, so the commit alone does not identify the code that ran." });
  const seeds = withValue.map((r) => r.seed).filter((s): s is number => s !== null);
  if (seeds.length !== new Set(seeds).size) notes.push({ code: "repeated_seeds", level: "warning", text: "Some runs share a seed, so they are not independent repetitions." });
  const units = new Set(withValue.map((r) => r.unit).filter(Boolean));
  if (m.metric_unit && units.size && !(units.size === 1 && units.has(m.metric_unit)) && m.run_value_scale === 1) {
    notes.push({ code: "unit_mismatch", level: "invalid", text: `Runs log "${m.metric_name}" in ${[...units].join(", ")} but the paper reports ${m.metric_unit}. Set the scale factor on the published result.` });
  }
  const invalid = notes.some((x) => x.level === "invalid");

  // --- statistics
  if (n === 1) {
    base.summary = { n: 1, mean: values[0], sd: null, sem: null, ci_low: null, ci_high: null, min: values[0], median: values[0], max: values[0], confidence: null };
    if (m.reported_runs && m.reported_runs > 1) {
      notes.push({ code: "single_run_vs_aggregate", level: "warning", text: `One run is being compared with a published mean of ${m.reported_runs} runs. A single run is not evidence that the mean reproduces.` });
    } else {
      notes.push({ code: "single_run", level: "info", text: "Only one run, so run-to-run variation is unknown." });
    }
  } else {
    base.summary = summarize(values);
  }
  const mean = base.summary.mean;
  base.diff = mean - m.metric_value;
  base.relative_diff_percent = relativeDifference(mean, m.metric_value);
  if (m.reported_runs === null) {
    notes.push({ code: "aggregation_unknown", level: "warning", text: "The published result does not say how many runs it aggregates, so the protocols cannot be matched." });
  } else if (n < m.reported_runs) {
    notes.push({ code: "fewer_runs", level: "warning", text: `${n} run(s) recorded; the paper aggregates ${m.reported_runs}.` });
  }
  if (n >= 2 && m.reported_runs && m.reported_runs >= 1) {
    if (m.dispersion === null) {
      base.diff_interval = {
        ...diffCiAssumingEqualSpread(mean, (base.summary as Summary).sd, n, m.metric_value, m.reported_runs),
        assumption: `The paper reports no spread. This interval assumes its ${m.reported_runs} run(s) varied as much as the reproduced runs did.`,
      };
    } else {
      notes.push({ code: "published_spread", level: "info", text: `The paper reports a spread of ${m.dispersion} (${m.dispersion_kind ?? "kind not stated"}); compare it with the reproduced SD by eye. No significance test is run, because the paper's sampling assumptions are not known.` });
    }
  }
  if (m.tolerance !== null) base.share_within_tolerance = shareWithin(values, m.metric_value, m.tolerance);
  if (m.direction !== "none" && base.diff !== null && base.diff !== 0) {
    const better = m.direction === "higher" ? base.diff > 0 : base.diff < 0;
    notes.push({ code: "direction", level: "info", text: `For this metric ${m.direction} is better; the reproduced mean is ${better ? "better" : "worse"} than published.` });
  }
  base.state = invalid ? "invalid" : m.reported_runs && n >= m.reported_runs ? "complete" : "partial";
  return base;
}

export async function compareProject(db: Db, projectId: string) {
  await projectRole(db, projectId);
  const metrics = await rows<ReportedMetric>(db, "select * from reported_metrics where project_id = $1 order by created_at", [projectId]);
  const runs = await rows<RunForComparison & { metric_name: string | null }>(
    db,
    `select r.id, r.name, r.run_group, r.status, r.seed, r.parameters, r.dataset_version, r.git_commit, r.git_dirty,
            m.metric_name, m.metric_value as value, m.metric_unit as unit
       from experiment_runs r
       left join lateral (
         select distinct on (metric_name) metric_name, metric_value, metric_unit from run_metrics
          where run_id = r.id order by metric_name, metric_step desc nulls last, created_at desc
       ) m on true
      where r.project_id = $1`,
    [projectId],
  );
  const byRun = new Map<string, { run: RunForComparison; values: Map<string, { value: number; unit: string | null }> }>();
  for (const r of runs) {
    if (!byRun.has(r.id)) byRun.set(r.id, { run: { ...r, value: null, unit: null }, values: new Map() });
    if (r.metric_name) byRun.get(r.id)!.values.set(r.metric_name, { value: Number(r.value), unit: r.unit });
  }
  return metrics.map((m) => {
    if (m.blocked_reason) return { metric: m, state: "blocked" as const, groups: [] as GroupComparison[] };
    const groupsWithMetric = new Set([...byRun.values()].filter((x) => x.values.has(m.metric_name)).map((x) => x.run.run_group));
    const groups = (m.run_groups.length ? m.run_groups : [...groupsWithMetric]).sort();
    const comparisons = groups.map((g) =>
      compareGroup(
        m,
        g,
        [...byRun.values()].filter((x) => x.run.run_group === g).map((x) => ({ ...x.run, value: x.values.get(m.metric_name)?.value ?? null, unit: x.values.get(m.metric_name)?.unit ?? null })),
      ),
    );
    const state = comparisons.length === 0 || comparisons.every((c) => c.state === "not_run") ? "not_run" : comparisons.some((c) => c.state === "complete") ? "complete" : comparisons.some((c) => c.state === "partial") ? "partial" : "invalid";
    return { metric: m, state, groups: comparisons };
  });
}
