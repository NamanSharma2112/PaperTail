import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { diffCiAssumingEqualSpread, relativeDifference, shareWithin, summarize, tCdf, tQuantile } from "../lib/stats";

const fixtures = JSON.parse(readFileSync(resolve(__dirname, "../../../packages/analysis/fixtures/stats_cases.json"), "utf8"));

const close = (a: number, b: number, rel = 1e-10, abs = 1e-10) => Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));

describe("Student t", () => {
  it("matches scipy.stats.t.ppf on the fixture grid", () => {
    const bad = fixtures.t_quantile.filter((c: { p: number; df: number; expected: number }) => !close(tQuantile(c.p, c.df), c.expected, 1e-9));
    expect(bad).toEqual([]);
    expect(fixtures.t_quantile.length).toBeGreaterThan(100);
  });
  it("cdf inverts the quantile", () => {
    for (const df of [1, 3, 10, 100]) for (const p of [0.025, 0.5, 0.9, 0.999]) expect(close(tCdf(tQuantile(p, df), df), p, 1e-10)).toBe(true);
  });
  it("rejects invalid input", () => {
    expect(() => tQuantile(1, 5)).toThrow();
    expect(() => tQuantile(0.5, 0)).toThrow();
  });
});

describe("summarize", () => {
  it("matches the Python reference", () => {
    for (const c of fixtures.summarize) {
      const s = summarize(c.values, c.confidence);
      for (const [k, v] of Object.entries(c.expected)) expect(close(s[k as keyof typeof s] as number, v as number, 1e-9, 1e-9), `${k} for ${c.values.length} values`).toBe(true);
    }
  });
  it("hand-computed case", () => {
    const s = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBeCloseTo(5, 12);
    expect(s.sd).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(s.ci_high - s.mean).toBeCloseTo(2.364624252 * (Math.sqrt(32 / 7) / Math.sqrt(8)), 8);
  });
  it("refuses fewer than two runs and non-finite values", () => {
    expect(() => summarize([81.6])).toThrow(/at least 2/);
    expect(() => summarize([1, Number.NaN])).toThrow(/finite/);
  });
});

describe("differences", () => {
  it("diff CI matches the Python reference", () => {
    for (const c of fixtures.diff_ci) {
      const a = c.args;
      const d = diffCiAssumingEqualSpread(a.repro_mean, a.repro_sd, a.n_repro, a.published_mean, a.n_published, a.confidence ?? 0.95);
      for (const [k, v] of Object.entries(c.expected)) expect(close(d[k as keyof typeof d] as number, v as number, 1e-9, 1e-9), k).toBe(true);
    }
  });
  it("share within tolerance matches", () => {
    for (const c of fixtures.share_within) expect(shareWithin(c.values, c.target, c.tolerance)).toBeCloseTo(c.expected, 12);
  });
  it("relative difference is undefined at zero", () => {
    expect(relativeDifference(1, 0)).toBeNull();
    expect(relativeDifference(81.47, 81.5)).toBeCloseTo((100 * -0.03) / 81.5, 10);
  });
});
