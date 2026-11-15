import { z } from "zod";

// Shared request schemas: used by route handlers to validate input and by forms for types.

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const url = z.string().trim().max(2000).url().refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL");
const optUrl = z.union([url, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
const key = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/, "Letters, digits, _ . - (max 80)");

export const PROVENANCE = ["reported", "implementation", "inferred", "selected", "unknown"] as const;
export const provenance = z.enum(PROVENANCE);
export const PROVENANCE_LABEL: Record<(typeof PROVENANCE)[number], string> = {
  reported: "Reported by the authors",
  implementation: "From the official implementation",
  inferred: "Inferred by the researcher",
  selected: "Chosen by the researcher",
  unknown: "Not reported / unknown",
};

export const PROJECT_STATUS = ["planning", "in_progress", "completed", "blocked", "archived"] as const;
export const PROJECT_OUTCOME = ["successful", "partial", "blocked", "inconclusive", "not_reproduced"] as const;
export const READING_STATUS = ["to_read", "reading", "read", "reproducing", "reproduced"] as const;
export const VERDICT = ["matched", "not_matched", "inconclusive", "blocked"] as const;
export const RUN_STATUS = ["pending", "running", "completed", "failed", "cancelled"] as const;
export const DISCREPANCY_CATEGORY = [
  "missing_information",
  "dataset_difference",
  "dependency_conflict",
  "preprocessing_difference",
  "hardware_difference",
  "hyperparameter_difference",
  "implementation_difference",
  "statistical_variation",
  "other",
] as const;
export const SEVERITY = ["low", "medium", "high", "critical"] as const;
export const CAUSE_STATUS = ["suspected", "confirmed", "ruled_out"] as const;
export const RESOLUTION = ["open", "investigating", "resolved", "wont_fix"] as const;

export const paperImport = z.object({ identifier: text(500).min(3, "Enter an arXiv ID, DOI or paper URL") });

export const paperUpdate = z.object({
  reading_status: z.enum(READING_STATUS).optional(),
  tags: z.array(text(40).min(1)).max(20).optional(),
  notes: optText(10000),
});

export const projectCreate = z.object({
  title: text(300).min(1, "Give the project a title"),
  description: optText(5000),
  paper_id: z.string().uuid().nullish(),
  kind: z.enum(["computational_reproduction", "reimplementation", "replication"]).default("computational_reproduction"),
  code_url: optUrl,
  code_commit: optText(80),
});

export const projectUpdate = z.object({
  title: text(300).min(1).optional(),
  description: optText(5000),
  kind: z.enum(["computational_reproduction", "reimplementation", "replication"]).optional(),
  status: z.enum(PROJECT_STATUS).optional(),
  outcome: z.enum(PROJECT_OUTCOME).nullish(),
  outcome_notes: optText(10000),
  limitations: optText(10000),
  code_url: optUrl,
  code_commit: optText(80),
});

export const PROTOCOL_FIELDS = [
  "research_objective",
  "hypothesis",
  "methodology",
  "model_information",
  "dataset_information",
  "preprocessing",
  "training_procedure",
  "evaluation_method",
  "assumptions",
] as const;

const evidenceEntry = z.object({ source: provenance, note: optText(2000), link: optUrl });

export const protocolUpdate = z.object({
  research_objective: optText(20000),
  hypothesis: optText(20000),
  methodology: optText(20000),
  model_information: optText(20000),
  dataset_information: optText(20000),
  preprocessing: optText(20000),
  training_procedure: optText(20000),
  evaluation_method: optText(20000),
  assumptions: optText(20000),
  experimental_setup: z
    .object({
      hyperparameters: z.record(z.string().max(80), z.union([z.string().max(500), z.number(), z.boolean()])).default({}),
      seeds: optText(2000),
      splits: optText(2000),
      hardware: optText(2000),
      frameworks: optText(2000),
    })
    .default({ hyperparameters: {}, seeds: null, splits: null, hardware: null, frameworks: null }),
  evidence: z.record(z.string().max(80), evidenceEntry).default({}),
  // Optimistic concurrency: the version the editor started from.
  version: z.number().int().min(1),
});

export const datasetUpsert = z.object({
  key,
  name: text(200).min(1),
  status: z.enum(["available", "partial", "unavailable"]).default("available"),
  url: optUrl,
  version: optText(200),
  note: optText(5000),
  sources: z
    .array(z.object({ relation: text(40).min(1), title: text(1000).min(1), arxiv_id: optText(40), doi: optText(200), year: z.number().int().nullish() }))
    .max(20)
    .default([]),
});

export const reportedMetricUpsert = z.object({
  key,
  label: text(300).min(1),
  metric_name: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_./ -]{0,79}$/, "Use the metric name your runs log"),
  metric_value: z.number().finite(),
  metric_unit: optText(20),
  run_value_scale: z.number().positive().finite().default(1),
  direction: z.enum(["higher", "lower", "none"]).default("none"),
  aggregation: optText(1000),
  reported_runs: z.number().int().min(1).nullish(),
  dispersion: z.number().min(0).finite().nullish(),
  dispersion_kind: z.enum(["sd", "se", "ci95", "range", "other"]).nullish(),
  dataset_key: optText(80),
  source_reference: optText(1000),
  reported_conditions: optText(5000),
  provenance: provenance.default("reported"),
  run_groups: z.array(key).max(20).default([]),
  tolerance: z.number().min(0).finite().nullish(),
  tolerance_reason: optText(2000),
  blocked_reason: optText(5000),
  verdict: z.enum(VERDICT).nullish(),
  verdict_note: optText(5000),
  notes: optText(5000),
});

export const deviationCreate = z.object({
  kind: z.enum(["environment", "code", "data", "protocol"]),
  what: text(5000).min(1),
  why: optText(5000),
  expected_effect: optText(5000),
  applies_to: optText(500),
});

export const discrepancyCreate = z.object({
  run_id: z.string().uuid().nullish(),
  reported_metric_id: z.string().uuid().nullish(),
  category: z.enum(DISCREPANCY_CATEGORY),
  title: text(300).min(1),
  description: optText(10000),
  severity: z.enum(SEVERITY).default("medium"),
  explanation: optText(10000),
  cause_status: z.enum(CAUSE_STATUS).default("suspected"),
  evidence: optText(10000),
  resolution_status: z.enum(RESOLUTION).default("open"),
  notes: optText(10000),
});
export const discrepancyUpdate = discrepancyCreate.partial();

export const runUpdate = z.object({
  notes: optText(10000),
  run_group: key.optional(),
  status: z.literal("cancelled").optional(),
});

export const tokenCreate = z.object({
  name: text(80).min(1).default("token"),
  expires_in_days: z.number().int().min(1).max(365).nullish(),
});

export const profileUpdate = z.object({
  display_name: text(120),
  affiliation: optText(200),
});

// ---------- SDK ingestion ----------

const jsonScalar = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);
const metricName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_./ -]{0,79}$/);

export const sdkRunCreate = z.object({
  project_id: z.string().uuid(),
  name: text(200).min(1),
  run_group: key.default("default"),
  idempotency_key: z.string().max(100).nullish(),
  seed: z.number().int().nullish(),
  parameters: z.record(z.string().max(120), z.union([jsonScalar, z.array(jsonScalar).max(100)])).default({}),
  git: z
    .object({ repository: optText(500), commit: optText(80), dirty: z.boolean().nullish() })
    .default({ repository: null, commit: null, dirty: null }),
  dataset_version: optText(500),
  environment: z
    .object({
      python: optText(40),
      os: optText(200),
      platform: optText(300),
      hardware: z.record(z.string().max(60), z.union([z.string().max(300), z.number(), z.array(z.string().max(300)).max(16), z.null()])).default({}),
      packages: z.record(z.string().max(120), z.string().max(80)).default({}),
    })
    .default({ python: null, os: null, platform: null, hardware: {}, packages: {} }),
  command: optText(4000),
  started_at: z.string().datetime({ offset: true }).nullish(),
});

export const sdkMetrics = z.object({
  metrics: z
    .array(z.object({ name: metricName, value: z.number().finite(), unit: optText(20), step: z.number().int().min(0).nullish() }))
    .min(1)
    .max(1000),
});

export const sdkComplete = z.object({
  completed_at: z.string().datetime({ offset: true }).nullish(),
  duration_seconds: z.number().min(0).finite().nullish(),
});

export const sdkFail = z.object({
  failure_summary: text(8000).min(1),
  completed_at: z.string().datetime({ offset: true }).nullish(),
  duration_seconds: z.number().min(0).finite().nullish(),
  status: z.enum(["failed", "cancelled"]).default("failed"),
});

export const ARTIFACT_MAX_BYTES = 2 * 1024 * 1024;
export const ARTIFACT_TYPES = [
  "text/plain",
  "text/csv",
  "application/json",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "application/pdf",
  "application/x-yaml",
  "application/octet-stream",
] as const;
export const artifactMeta = z.object({
  file_name: z
    .string()
    .min(1)
    .max(255)
    .refine((n) => !/[\\/]/.test(n) && n !== "." && n !== "..", "File name must not contain a path"),
  file_type: z.enum(ARTIFACT_TYPES),
});
