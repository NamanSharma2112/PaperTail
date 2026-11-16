# Reproduction methodology and statistics

PaperTrail keeps four kinds of information apart and labels each one wherever it appears:

1. **What the authors reported**: values entered from the paper (`reported_metrics`), with where they come from (table or figure) and their provenance.
2. **What the reproduction produced**: runs and their metrics, sent by the SDK. These can't be edited in the browser.
3. **What was calculated**: summaries, differences and intervals, computed on request. They are never stored as facts.
4. **What the researcher concluded**: verdicts, discrepancy explanations and the project outcome. These are always typed in by a person, with a note.

## Vocabulary

| Term | Meaning |
|---|---|
| Reproduction | The authors' code and data, run again. |
| Reimplementation | New code written from the paper's description. |
| Replication | New data or a new setting, testing the same claim. |
| Published result (reported metric) | One number from the paper, e.g. "Cora test accuracy 81.5%, mean of 100 runs". |
| Run | One execution, with one seed. |
| Run group | Runs that share a configuration and differ only by seed. The unit that is compared with a published result. |
| Deviation | A change made relative to the original method, recorded before or during the work. |
| Discrepancy | A difference found in the results, with a suspected or confirmed cause. |
| Provenance | Where a protocol detail comes from: `reported` (paper), `implementation` (authors' code), `inferred`, `selected` (the researcher's choice), `unknown`. |

## The comparison

A published result is compared with **each run group** listed in its `run_groups`, or with every group that logged the metric when none are listed. Within a group:

### Which runs count

- Only `completed` runs that logged the metric (`metric_name`) are used. When a metric was logged at several steps, the value at the highest step is used.
- `failed` and `cancelled` runs are excluded and counted in a warning. Unfinished runs are excluded and counted in a note.
- Each value is multiplied by the result's `run_value_scale` (for example 100, to turn 0.815 into 81.5%).

### Summary (n runs, values x₁…xₙ)

| Quantity | Formula |
|---|---|
| mean | x̄ = Σxᵢ / n (compensated summation) |
| standard deviation | s = √( Σ(xᵢ − x̄)² / (n − 1) ), needs n ≥ 2 |
| standard error | s / √n |
| 95% CI for the mean | x̄ ± t₀.₉₇₅, ₙ₋₁ · s/√n (Student t) |
| min, median, max | as usual |
| difference | x̄ − published |
| relative difference | 100 · (x̄ − published) / \|published\|, undefined when published = 0 |
| share within tolerance | fraction of runs with \|xᵢ − published\| ≤ tolerance (only when the researcher set a tolerance) |

**Assumptions behind the CI:** the runs are independent, and their mean is roughly normally distributed. With few runs or strongly skewed values (for example the Citeseer runs that stopped early in the pilot), the interval is approximate. The individual runs are always plotted next to it so this can be seen.

### Interval for the difference

When the paper reports how many runs it averaged (`reported_runs` = m) but **no spread**, and n ≥ 2:

  se = s · √(1/n + 1/m),  CI = (x̄ − published) ± t₀.₉₇₅, ₙ₋₁ · se

This **assumes the authors' runs varied as much as the reproduced runs did**. The assumption is printed next to the interval every time. The published value is treated as a mean of m runs with unknown individual values.

When the paper does report a spread, no test is run. The spread is shown next to the reproduced SD with its kind (SD, SE, CI, range), because the paper's sampling assumptions are unknown. A significance test would claim more than the data supports.

No p-values are reported. "Not significantly different" is not evidence of a match. Whether a difference matters is decided against a tolerance that the researcher sets, ideally before running, and records with a reason.

### Compatibility checks

These appear as notes on the comparison. Notes marked **invalid** mean the numbers are still shown but the group isn't treated as a valid comparison.

| Code | Level | Rule |
|---|---|---|
| `mixed_configurations` | invalid | Runs in the group have different parameters, ignoring seed-like keys (`seed`, `random_seed`, `rng_seed`, `torch_seed`, `np_seed`). |
| `mixed_datasets` | invalid | Runs used different `dataset_version` values. |
| `unit_mismatch` | invalid | Runs log a unit different from the paper's and no scale factor is set. |
| `single_run_vs_aggregate` | warning | One run compared with a published mean of several runs. |
| `fewer_runs` | warning | Fewer runs than the paper aggregates. |
| `aggregation_unknown` | warning | The paper doesn't say how many runs its number aggregates. |
| `excluded_runs`, `missing_metric` | warning | Failed or cancelled runs, or completed runs without the metric. |
| `mixed_code` | warning | Runs come from different commits. |
| `dirty_tree` | warning | Some runs had uncommitted changes. |
| `repeated_seeds` | warning | Two runs share a seed, so they aren't independent repetitions. |
| `published_spread` | info | The paper reports a spread. It is shown, and no test is run. |
| `direction` | info | Whether the reproduced mean is better or worse, when the metric has a direction. |

### Comparison state (computed) and verdict (entered)

The **state** is computed: `not_run`, `partial` (fewer runs than reported), `complete` (at least as many runs as reported and no invalid notes), `invalid`, or `blocked` (the researcher recorded why the result can't be attempted).

The **verdict** is entered by the researcher: `matched`, `not_matched`, `inconclusive` or `blocked`, with a note. The application never derives a verdict from the numbers.

## Discrepancies

A discrepancy records a difference worth explaining:

- Category: missing information, dataset, dependency, preprocessing, hardware, hyperparameters, implementation, statistical variation, other.
- Severity.
- Explanation, with a **cause status** of `suspected`, `confirmed` or `ruled_out`. This keeps a plausible story from being read as a finding.
- Evidence and resolution status.

## The report

The report has these sections:

- Paper identity and project details.
- The protocol, with the provenance of each field.
- Datasets and deviations.
- For each published result: the authors' value and context, the reproduced summary, the difference and its interval with any stated assumption, and the compatibility notes.
- The researcher's verdict, discrepancies, overall outcome and limitations.

It exports to Markdown or, through the browser's print dialog, to PDF. Demo projects are marked as demonstration data in the report.

## Worked example: the pilot

From the bundled GCN pilot (Kipf & Welling 2017, Table 2), 100 runs per dataset. The values are the app's computed output on the demo project, which matches the pilot's independent Python analysis.

| Dataset | Published | Reproduced mean | Difference | Note |
|---|---|---|---|---|
| Cora | 81.5 | 81.47 | −0.03 | 62% of individual runs fall within ±0.5 of the published mean. |
| Citeseer | 70.3 | 69.63 (all runs), 70.75 (excluding 2 early-stopped runs) | −0.67 / +0.45 | Inconclusive. The code's early-stopping rule differs from the paper's. |
| Pubmed | 79.0 | 79.055 | +0.055 | |
| NELL | 66.0 | — | — | Blocked: the data and configuration are not in the repository. |

A single run with the repository's default seed gives 81.6 on Cora, which looks like a perfect match. That is why the comparison warns when one run is compared with a mean of many.

## Statistical implementation and its tests

- The reference implementation is `packages/analysis/papertrail_analysis/stats.py`, cross-checked against `scipy.stats`.
- The application's implementation is `apps/web/lib/stats`: a TypeScript port with a Lanczos log-gamma, a continued-fraction incomplete beta, and a Student-t quantile by bisection followed by Newton steps.
- `packages/analysis/make_fixtures.py` writes `fixtures/stats_cases.json`. `apps/web/tests/stats.test.ts` requires the TypeScript output to match every case.
- The comparison rules above are unit-tested in `apps/web/tests/services.test.ts`.
