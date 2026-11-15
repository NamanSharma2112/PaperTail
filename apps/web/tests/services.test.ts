import { describe, expect, it } from "vitest";
import { artifactMeta, protocolUpdate, reportedMetricUpsert, sdkMetrics, sdkRunCreate } from "../lib/schemas";
import { compareGroup, type ReportedMetric } from "../lib/server/services/comparison";
import { classifyIdentifier, parseArxivAtom, parseCrossref, parseOpenAlex } from "../lib/server/services/metadata";
import { reportMarkdown, type Report } from "../lib/server/services/report";

const metric = (o: Partial<ReportedMetric> = {}): ReportedMetric => ({
  id: "m", key: "k", label: "Table 2 Cora", metric_name: "acc", metric_value: 81.5, metric_unit: "%", run_value_scale: 100, direction: "none",
  aggregation: "mean of 100 runs", reported_runs: 100, dispersion: null, dispersion_kind: null, dataset_key: null, source_reference: null,
  reported_conditions: null, provenance: "reported", run_groups: [], tolerance: null, tolerance_reason: null, blocked_reason: null,
  verdict: null, verdict_note: null, notes: null, ...o,
});
const run = (i: number, value: number | null, o: Record<string, unknown> = {}) => ({
  id: `r${i}`, name: `seed-${i}`, run_group: "g", status: "completed", seed: i, parameters: { lr: 0.01, seed: i }, dataset_version: "v1",
  git_commit: "abc", git_dirty: false, value, unit: null, ...o,
});
const codes = (g: ReturnType<typeof compareGroup>) => g.notes.map((n) => n.code);

describe("comparison rules", () => {
  it("summarises completed runs, scaled to the paper's unit", () => {
    const g = compareGroup(metric(), "g", [run(0, 0.81), run(1, 0.82), run(2, 0.815)]);
    expect(g.runs_used).toBe(3);
    expect(g.summary!.mean).toBeCloseTo(81.5, 10);
    expect(g.diff).toBeCloseTo(0, 10);
    expect(g.diff_interval).not.toBeNull();
    expect(g.diff_interval!.assumption).toMatch(/assumes/);
    expect(codes(g)).toContain("fewer_runs");
    expect(g.state).toBe("partial");
  });
  it("excludes failed, cancelled and unfinished runs and says so", () => {
    const g = compareGroup(metric(), "g", [run(0, 0.81), run(1, 0.82), run(2, 0.1, { status: "failed" }), run(3, null, { status: "running" }), run(4, null)]);
    expect(g.runs_used).toBe(2);
    expect(g.runs_excluded).toEqual({ failed: 1, cancelled: 0, running: 1, missing_metric: 1 });
    expect(codes(g)).toEqual(expect.arrayContaining(["excluded_runs", "unfinished_runs", "missing_metric"]));
  });
  it("flags one run against a multi-run mean and computes no interval", () => {
    const g = compareGroup(metric(), "g", [run(0, 0.816)]);
    expect(codes(g)).toContain("single_run_vs_aggregate");
    expect(g.summary!.sd).toBeNull();
    expect(g.diff_interval).toBeNull();
  });
  it("marks mixed configurations and datasets invalid", () => {
    const g = compareGroup(metric(), "g", [run(0, 0.81), run(1, 0.82, { parameters: { lr: 0.1, seed: 1 } })]);
    expect(codes(g)).toContain("mixed_configurations");
    expect(g.state).toBe("invalid");
    const h = compareGroup(metric(), "g", [run(0, 0.81), run(1, 0.82, { dataset_version: "v2" })]);
    expect(codes(h)).toContain("mixed_datasets");
  });
  it("seed parameters alone do not count as different configurations", () => {
    const g = compareGroup(metric(), "g", [run(0, 0.81, { parameters: { lr: 0.01, random_seed: 1 } }), run(1, 0.82, { parameters: { lr: 0.01, random_seed: 2 } })]);
    expect(codes(g)).not.toContain("mixed_configurations");
  });
  it("warns about repeated seeds, dirty trees and mixed commits", () => {
    const g = compareGroup(metric(), "g", [run(0, 0.81, { seed: 1 }), run(1, 0.82, { seed: 1, git_dirty: true, git_commit: "def" })]);
    expect(codes(g)).toEqual(expect.arrayContaining(["repeated_seeds", "dirty_tree", "mixed_code"]));
  });
  it("detects a unit mismatch when no scale factor is set", () => {
    const g = compareGroup(metric({ run_value_scale: 1 }), "g", [run(0, 0.81, { unit: "fraction" }), run(1, 0.82, { unit: "fraction" })]);
    expect(codes(g)).toContain("unit_mismatch");
    expect(g.state).toBe("invalid");
  });
  it("does not run a significance test when the paper reports a spread", () => {
    const g = compareGroup(metric({ dispersion: 0.5, dispersion_kind: "sd" }), "g", [run(0, 0.81), run(1, 0.82)]);
    expect(g.diff_interval).toBeNull();
    expect(codes(g)).toContain("published_spread");
  });
  it("is complete only with at least as many runs as the paper", () => {
    const g = compareGroup(metric({ reported_runs: 2 }), "g", [run(0, 0.81), run(1, 0.82)]);
    expect(g.state).toBe("complete");
  });
  it("reports the share of runs within tolerance and respects direction", () => {
    const g = compareGroup(metric({ tolerance: 0.5, direction: "higher" }), "g", [run(0, 0.81), run(1, 0.83)]);
    expect(g.share_within_tolerance).toBe(0.5);
    expect(g.notes.find((n) => n.code === "direction")!.text).toMatch(/better/);
  });
  it("relative difference is undefined at a zero reference", () => {
    const g = compareGroup(metric({ metric_value: 0, run_value_scale: 1 }), "g", [run(0, 0.1), run(1, 0.2)]);
    expect(g.relative_diff_percent).toBeNull();
  });
});

describe("paper identifiers and metadata", () => {
  it("classifies identifiers and URLs", () => {
    expect(classifyIdentifier("1609.02907")).toEqual({ kind: "arxiv", value: "1609.02907" });
    expect(classifyIdentifier("arXiv:1609.02907v4")).toEqual({ kind: "arxiv", value: "1609.02907" });
    expect(classifyIdentifier("https://arxiv.org/pdf/1609.02907v4.pdf")).toEqual({ kind: "arxiv", value: "1609.02907" });
    expect(classifyIdentifier("https://doi.org/10.48550/arXiv.1609.02907")).toEqual({ kind: "arxiv", value: "1609.02907" });
    expect(classifyIdentifier("cs/0112017")).toEqual({ kind: "arxiv", value: "cs/0112017" });
    expect(classifyIdentifier("https://doi.org/10.1371/journal.pbio.3003726")).toEqual({ kind: "doi", value: "10.1371/journal.pbio.3003726" });
    expect(classifyIdentifier("https://dl.acm.org/doi/10.1145/2939672.2939754")).toEqual({ kind: "doi", value: "10.1145/2939672.2939754" });
    expect(() => classifyIdentifier("a paper about graphs")).toThrow();
  });
  it("parses an arXiv Atom entry", () => {
    const xml = `<feed><entry><title>Semi-Supervised Classification with
      Graph Convolutional Networks</title><summary> We present &amp; test. </summary><published>2016-09-09T19:48:41Z</published>
      <author><name>Thomas N. Kipf</name></author><author><name>Max Welling</name></author>
      <arxiv:comment xmlns:arxiv="x">Published as a conference paper at ICLR 2017</arxiv:comment></entry></feed>`;
    const m = parseArxivAtom(xml, "1609.02907");
    expect(m).toMatchObject({ title: "Semi-Supervised Classification with Graph Convolutional Networks", authors: ["Thomas N. Kipf", "Max Welling"], publication_year: 2016, abstract: "We present & test.", pdf_url: "https://arxiv.org/pdf/1609.02907" });
    expect(() => parseArxivAtom("<feed></feed>", "9999.99999")).toThrow();
  });
  it("parses Crossref and OpenAlex records", () => {
    const c = parseCrossref({ title: ["A Title"], author: [{ given: "Ada", family: "Lovelace" }], abstract: "<jats:p>Abstract text</jats:p>", issued: { "date-parts": [[2026, 4]] }, "container-title": ["PLOS Biology"], publisher: "PLOS" }, "10.1/x");
    expect(parseCrossref({ abstract: "<jats:title>Abstract</jats:title><jats:p>Graphs are useful.</jats:p>" }, "10.1/z").abstract).toBe("Graphs are useful.");
    expect(c).toMatchObject({ title: "A Title", authors: ["Ada Lovelace"], abstract: "Abstract text", publication_year: 2026, venue: "PLOS Biology", metadata_source: "crossref" });
    const o = parseOpenAlex({ title: "T", authorships: [{ author: { display_name: "A" } }], abstract_inverted_index: { world: [1], hello: [0, 2] }, publication_year: 2020 }, "10.1/y");
    expect(o.abstract).toBe("hello world hello");
  });
});

describe("validation", () => {
  it("rejects non-finite metrics and paths in artifact names", () => {
    expect(() => sdkMetrics.parse({ metrics: [{ name: "acc", value: Number.NaN }] })).toThrow();
    expect(() => sdkMetrics.parse({ metrics: [{ name: "acc", value: Number.POSITIVE_INFINITY }] })).toThrow();
    expect(() => artifactMeta.parse({ file_name: "../x.csv", file_type: "text/csv" })).toThrow();
    expect(() => artifactMeta.parse({ file_name: "x.html", file_type: "text/html" })).toThrow();
    expect(artifactMeta.parse({ file_name: "results.csv", file_type: "text/csv" }).file_name).toBe("results.csv");
  });
  it("requires a valid project id and bounded parameters on run creation", () => {
    expect(() => sdkRunCreate.parse({ project_id: "x", name: "r" })).toThrow();
    const ok = sdkRunCreate.parse({ project_id: "11111111-1111-4111-8111-111111111111", name: "r" });
    expect(ok.run_group).toBe("default");
    expect(() => sdkRunCreate.parse({ project_id: "11111111-1111-4111-8111-111111111111", name: "r", run_group: "../x" })).toThrow();
  });
  it("protocol evidence must use a known provenance", () => {
    expect(() => protocolUpdate.parse({ version: 1, evidence: { methodology: { source: "guessed" } } })).toThrow();
    expect(protocolUpdate.parse({ version: 1, evidence: { methodology: { source: "inferred" } } }).evidence.methodology.source).toBe("inferred");
  });
  it("published results need a finite value and a valid key", () => {
    expect(() => reportedMetricUpsert.parse({ key: "bad key", label: "x", metric_name: "acc", metric_value: 1 })).toThrow();
    expect(reportedMetricUpsert.parse({ key: "t2", label: "x", metric_name: "acc", metric_value: 81.5 }).provenance).toBe("reported");
  });
});

describe("report", () => {
  it("states the conclusion, marks invalid comparisons and escapes table cells", () => {
    const m = metric({ verdict: "inconclusive", verdict_note: "needs more runs" });
    const g = compareGroup(m, "g", [run(0, 0.81), run(1, 0.82, { parameters: { lr: 0.5 } })]);
    const r = {
      generated_at: "2026-11-15T00:00:00Z",
      project: { title: "P", is_demo: true, outcome: "partial", outcome_notes: "Two of three matched.", limitations: "CPU only", code_url: "https://github.com/x/y", code_commit: "abc", primary_paper: { title: "Paper", authors: ["A"], venue: "V", publication_year: 2017, doi: null, arxiv_id: "1609.02907" } },
      protocol: { research_objective: "Check | things", evidence: { research_objective: { source: "reported", note: "Sec 1" } }, experimental_setup: { hyperparameters: { lr: 0.01 } } },
      comparisons: [{ metric: m, state: "invalid", groups: [g] }],
      datasets: [], deviations: [{ key: "D1", kind: "environment", what: "numpy | 1.18", why: null, expected_effect: null }], discrepancies: [],
      runStats: { total: 2, completed: 2, failed: 0, groups: 1 }, environments: [], configurations: [],
    } as unknown as Report;
    const md = reportMarkdown(r);
    expect(md).toContain("**Conclusion: Partially reproduced.**");
    expect(md).toContain("Demonstration data");
    expect(md).toContain("not a certification");
    expect(md).toContain("**Comparison not valid:**");
    expect(md).toContain("numpy \\| 1.18");
    expect(md).toContain("_Source: Reported by the authors — Sec 1_");
    expect(md).toContain("Researcher's conclusion: inconclusive. needs more runs");
  });
});
