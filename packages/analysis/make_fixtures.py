"""Regenerate fixtures/stats_cases.json from the reference implementation.

    python make_fixtures.py

Run after changing papertrail_analysis/stats.py; the TypeScript tests read the file.
"""
import json
import pathlib

import numpy as np

from papertrail_analysis.stats import diff_ci_assuming_equal_spread, share_within, summarize, t_quantile

rng = np.random.default_rng(20261115)
out = {"generated_by": "packages/analysis/make_fixtures.py", "t_quantile": [], "summarize": [], "diff_ci": [], "share_within": []}

for df in [1, 2, 3, 4, 5, 7, 9, 10, 19, 29, 30, 49, 99, 199, 999, 100000]:
    for p in [0.6, 0.9, 0.95, 0.975, 0.995, 0.9995, 0.025, 0.1]:
        out["t_quantile"].append({"p": p, "df": df, "expected": t_quantile(p, df)})

samples = [
    [2, 4, 4, 4, 5, 5, 7, 9],
    [81.6, 81.6],
    [0.937, 0.921, 0.944],
    list(rng.normal(81.5, 0.65, 100).round(4)),
    list(rng.normal(70.3, 8.0, 100).round(4)),
    list(rng.uniform(0, 1, 5).round(6)),
    [1e6 + 1, 1e6 + 2, 1e6 + 3],
]
for v in samples:
    for conf in [0.95, 0.9, 0.99]:
        s = summarize(v, conf)
        out["summarize"].append({"values": [float(x) for x in v], "confidence": conf, "expected": {k: s[k] for k in ("n", "mean", "sd", "sem", "ci_low", "ci_high", "min", "median", "max")}})

for args in [
    dict(repro_mean=81.47, repro_sd=0.65, n_repro=100, published_mean=81.5, n_published=100),
    dict(repro_mean=69.63, repro_sd=8.11, n_repro=100, published_mean=70.3, n_published=100),
    dict(repro_mean=0.93, repro_sd=0.01, n_repro=5, published_mean=0.94, n_published=5),
    dict(repro_mean=10.0, repro_sd=2.0, n_repro=3, published_mean=9.0, n_published=10, confidence=0.9),
]:
    d = diff_ci_assuming_equal_spread(**args)
    out["diff_ci"].append({"args": args, "expected": {k: d[k] for k in ("diff", "se", "ci_low", "ci_high")}})

for v, target, tol in [([81.0, 81.5, 82.0, 83.0], 81.5, 0.5), ([1, 2, 3], 2, 0), ([0.5, 0.6], 0.55, 0.05)]:
    out["share_within"].append({"values": v, "target": target, "tolerance": tol, "expected": share_within(v, target, tol)})

path = pathlib.Path(__file__).parent / "fixtures" / "stats_cases.json"
path.write_text(json.dumps(out, indent=1) + "\n")
print("wrote", path, {k: len(v) for k, v in out.items() if isinstance(v, list)})
