"""Statistics used to compare a published number with a set of reproduced runs.

Deliberately small and dependency-light (numpy for arithmetic, scipy only for the
Student-t quantile). Every function here is cross-checked against scipy.stats and
against hand-computed values in tests/test_stats.py. First written for the pilot
reproduction in pilot/gcn-kipf-welling-2017; this copy is the one the product uses.
"""
import math

import numpy as np
from scipy import stats as _st


def summarize(values, confidence=0.95):
    """Mean, sample SD (ddof=1), standard error and a Student-t CI for the mean."""
    x = np.asarray(values, dtype=float)
    n = int(x.size)
    if n < 2:
        raise ValueError("need at least 2 runs to estimate dispersion, got %d" % n)
    mean = float(x.sum() / n)
    sd = math.sqrt(float(((x - mean) ** 2).sum()) / (n - 1))
    sem = sd / math.sqrt(n)
    tcrit = float(_st.t.ppf(0.5 + confidence / 2.0, n - 1))
    return {
        "n": n,
        "mean": mean,
        "sd": sd,
        "sem": sem,
        "confidence": confidence,
        "ci_low": mean - tcrit * sem,
        "ci_high": mean + tcrit * sem,
        "min": float(x.min()),
        "median": float(np.median(x)),
        "max": float(x.max()),
    }


def diff_ci_assuming_equal_spread(repro_mean, repro_sd, n_repro, published_mean, n_published,
                                  confidence=0.95):
    """CI for (reproduced mean - published mean) when the paper gives a mean of
    n_published runs but NO dispersion.

    ASSUMPTION (not verifiable from the paper): the published runs had the same
    run-to-run SD as the reproduced runs. Under it, the standard error of the
    difference is sd * sqrt(1/n_repro + 1/n_published) with n_repro - 1 degrees of
    freedom (the SD is estimated from the reproduced runs only).
    """
    se = repro_sd * math.sqrt(1.0 / n_repro + 1.0 / n_published)
    tcrit = float(_st.t.ppf(0.5 + confidence / 2.0, n_repro - 1))
    diff = repro_mean - published_mean
    return {"diff": diff, "se": se, "ci_low": diff - tcrit * se, "ci_high": diff + tcrit * se,
            "confidence": confidence}


def share_within(values, target, tolerance):
    """Fraction of individual runs with |value - target| <= tolerance."""
    x = np.asarray(values, dtype=float)
    return float((np.abs(x - target) <= tolerance + 1e-9).mean())
