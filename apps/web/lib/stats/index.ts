/**
 * Comparison statistics. TypeScript port of packages/analysis/papertrail_analysis/stats.py,
 * which is the reference implementation; tests/stats.test.ts checks this port against
 * packages/analysis/fixtures/stats_cases.json, generated from the Python module with scipy.
 *
 * Pure functions, no I/O, no React. Formulas (n runs x_1..x_n):
 *   mean = Σx / n
 *   sd   = sqrt(Σ(x − mean)² / (n − 1))                       (needs n ≥ 2)
 *   sem  = sd / √n
 *   CI   = mean ± t(1 − α/2, n − 1) · sem                       Student t
 * Assumptions for the CI: runs are independent and their mean is roughly normal. With
 * few runs and skewed values the interval is approximate.
 */

// ---------- special functions ----------

// Lanczos approximation (g = 7, n = 9); relative error ~1e-15 for x > 0.
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Continued fraction for the incomplete beta function (modified Lentz).
function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 10000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnFront = logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(lnFront) * betacf(a, b, x)) / a;
  return 1 - (Math.exp(lnFront) * betacf(b, a, 1 - x)) / b;
}

/** Upper tail P(T > t) for t ≥ 0, computed directly to keep precision far in the tail. */
function tUpperTail(t: number, df: number): number {
  return 0.5 * incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** Student t cumulative distribution function. */
export function tCdf(t: number, df: number): number {
  const upper = tUpperTail(Math.abs(t), df);
  return t >= 0 ? 1 - upper : upper;
}

/** Student t quantile: the t with P(T ≤ t) = p. Bisection on the upper tail, then
 * Newton steps; agrees with scipy.stats.t.ppf to ~1e-12 relative on the fixture grid. */
export function tQuantile(p: number, df: number): number {
  if (!(df > 0)) throw new RangeError("degrees of freedom must be positive");
  if (!(p > 0 && p < 1)) throw new RangeError("p must be in (0, 1)");
  if (p === 0.5) return 0;
  if (p < 0.5) return -tQuantile(1 - p, df);
  const q = 1 - p; // target upper-tail probability
  let lo = 0;
  let hi = 1;
  while (tUpperTail(hi, df) > q) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-15 * hi; i++) {
    const mid = (lo + hi) / 2;
    if (tUpperTail(mid, df) > q) lo = mid;
    else hi = mid;
  }
  let t = (lo + hi) / 2;
  // Newton refinement on log tail probability.
  const logC = logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
  for (let i = 0; i < 3; i++) {
    const pdf = Math.exp(logC - ((df + 1) / 2) * Math.log1p((t * t) / df));
    const f = tUpperTail(t, df) - q;
    if (pdf === 0) break;
    const next = t + f / pdf;
    if (!Number.isFinite(next) || next <= 0) break;
    t = next;
  }
  return t;
}

// ---------- summaries ----------

export type Summary = {
  n: number;
  mean: number;
  sd: number;
  sem: number;
  confidence: number;
  ci_low: number;
  ci_high: number;
  min: number;
  median: number;
  max: number;
};

function assertFinite(values: number[]) {
  for (const v of values) if (typeof v !== "number" || !Number.isFinite(v)) throw new RangeError("values must be finite numbers");
}

/** Mean, sample SD (n − 1), standard error and Student-t CI for the mean. Needs n ≥ 2. */
export function summarize(values: number[], confidence = 0.95): Summary {
  assertFinite(values);
  const n = values.length;
  if (n < 2) throw new RangeError(`need at least 2 runs to estimate dispersion, got ${n}`);
  if (!(confidence > 0 && confidence < 1)) throw new RangeError("confidence must be in (0, 1)");
  // Two-pass algorithm with a compensation term, for numerical stability.
  const mean0 = values.reduce((a, b) => a + b, 0) / n;
  let ss = 0;
  let comp = 0;
  for (const v of values) {
    ss += (v - mean0) ** 2;
    comp += v - mean0;
  }
  const mean = mean0 + comp / n;
  const variance = (ss - (comp * comp) / n) / (n - 1);
  const sd = Math.sqrt(Math.max(variance, 0));
  const sem = sd / Math.sqrt(n);
  const tcrit = tQuantile(0.5 + confidence / 2, n - 1);
  const sorted = [...values].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { n, mean, sd, sem, confidence, ci_low: mean - tcrit * sem, ci_high: mean + tcrit * sem, min: sorted[0], median, max: sorted[n - 1] };
}

export type DiffInterval = { diff: number; se: number; ci_low: number; ci_high: number; confidence: number };

/**
 * CI for (reproduced mean − published mean) when the paper reports a mean of
 * nPublished runs but no dispersion. ASSUMPTION, not checkable from the paper: the
 * published runs varied as much as the reproduced ones. se = sd · sqrt(1/n_r + 1/n_p),
 * with n_r − 1 degrees of freedom (the SD comes from the reproduced runs only).
 */
export function diffCiAssumingEqualSpread(
  reproMean: number,
  reproSd: number,
  nRepro: number,
  publishedMean: number,
  nPublished: number,
  confidence = 0.95,
): DiffInterval {
  if (nRepro < 2 || nPublished < 1) throw new RangeError("need n_repro ≥ 2 and n_published ≥ 1");
  const se = reproSd * Math.sqrt(1 / nRepro + 1 / nPublished);
  const tcrit = tQuantile(0.5 + confidence / 2, nRepro - 1);
  const diff = reproMean - publishedMean;
  return { diff, se, ci_low: diff - tcrit * se, ci_high: diff + tcrit * se, confidence };
}

/** Fraction of individual runs with |value − target| ≤ tolerance (inclusive). */
export function shareWithin(values: number[], target: number, tolerance: number): number {
  assertFinite(values);
  if (values.length === 0) return NaN;
  return values.filter((v) => Math.abs(v - target) <= tolerance + 1e-9).length / values.length;
}

/** Relative difference in percent; undefined when the reference is zero. */
export function relativeDifference(value: number, reference: number): number | null {
  if (reference === 0) return null;
  return (100 * (value - reference)) / Math.abs(reference);
}
