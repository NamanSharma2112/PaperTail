export type Paper = {
  title: string;
  authors: string[];
  abstract: string | null;
  arxiv_id: string | null;
  doi: string | null;
  venue: string | null;
  published: string | null;
  url: string | null;
};

export type Summary = {
  n: number;
  mean: number;
  sd: number | null;
  sem: number | null;
  ci_low: number | null;
  ci_high: number | null;
  min: number;
  median: number;
  max: number;
};

export type RunSetComparison = {
  run_set: string;
  description: string | null;
  exploratory: boolean;
  state: "not_run" | "partial" | "complete";
  runs_recorded: number;
  runs_failed: number;
  n: number;
  points: { run_id: number; seed: number | null; value: number }[];
  summary: Summary | null;
  diff: number | null;
  diff_relative_percent: number | null;
  diff_interval: { ci_low: number; ci_high: number; assumption: string } | null;
  share_within_tolerance: number | null;
  notes: { code: string; level: "info" | "warning"; text: string }[];
};

export type Verdict = "matched" | "not_matched" | "inconclusive" | "blocked";

export type Claim = {
  key: string;
  label: string;
  metric: string;
  unit: string | null;
  reported_value: number;
  aggregation: string | null;
  reported_runs: number | null;
  reported_dispersion: number | null;
  dispersion_kind: string | null;
  source: string | null;
  provenance: "reported" | "inferred";
  tolerance: number | null;
  tolerance_reason: string | null;
  blocked_reason: string | null;
  verdict: Verdict | null;
  verdict_note: string | null;
  dataset_key: string | null;
  comparison: { state: "blocked" | "not_run" | "partial" | "complete"; run_sets: RunSetComparison[] };
};

export type Deviation = {
  key: string;
  kind: "environment" | "code" | "data" | "protocol";
  what: string;
  why: string | null;
  expected_effect: string | null;
  applies_to: string | null;
};

export type DatasetRecord = {
  key: string;
  name: string;
  status: "available" | "partial" | "unavailable";
  url: string | null;
  version: string | null;
  note: string | null;
  sources: { relation: string; title: string; arxiv_id?: string | null; doi?: string | null; year?: number | null }[];
};

export type RunSet = {
  key: string;
  claim: string | null;
  description: string | null;
  exploratory: boolean;
  runs: number;
  failed: number;
};

export type ProjectSummary = {
  slug: string;
  title: string;
  kind: string;
  paper: Paper;
  created_at: string;
  claims: number;
  claim_states: Record<string, number>;
  verdicts: Record<string, number>;
  runs: number;
  deviations: number;
  datasets: number;
  references: number;
};

export type Project = Omit<ProjectSummary, "claims" | "deviations" | "datasets"> & {
  datasets: DatasetRecord[];
  summary: string | null;
  code_url: string | null;
  code_commit: string | null;
  data_note: string | null;
  claims: Claim[];
  run_sets: RunSet[];
  deviations: Deviation[];
};

const API = process.env.PAPERTRAIL_API_URL ?? "http://127.0.0.1:8000";

/** Server-side read. Returns null for 404 and throws when the API is unreachable. */
export async function apiGet<T>(path: string): Promise<T | null> {
  const response = await fetch(`${API}${path}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API answered ${response.status} for ${path}`);
  return (await response.json()) as T;
}

export const KIND_LABEL: Record<string, string> = {
  computational_reproduction: "Computational reproduction",
  reimplementation: "Reimplementation",
  replication: "Independent replication",
};

export function fmt(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? "–" : value.toFixed(digits);
}

export function signed(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "–";
  const text = Math.abs(value).toFixed(digits);
  return (value < 0 && Number(text) !== 0 ? "−" : "+") + text;
}
