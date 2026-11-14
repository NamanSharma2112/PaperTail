import math

import numpy as np
import pytest
from scipy import stats

from repro_stats import diff_ci_assuming_equal_spread, share_within, summarize


def test_summarize_hand_computed():
    # 2, 4, 4, 4, 5, 5, 7, 9: mean 5, sum of squares 32, sample variance 32/7.
    s = summarize([2, 4, 4, 4, 5, 5, 7, 9])
    assert s["n"] == 8
    assert s["mean"] == pytest.approx(5.0)
    assert s["sd"] == pytest.approx(math.sqrt(32 / 7))
    assert s["sem"] == pytest.approx(math.sqrt(32 / 7) / math.sqrt(8))
    # t(0.975, df=7) = 2.364624 (standard table value)
    half = 2.364624 * s["sem"]
    assert s["ci_low"] == pytest.approx(5.0 - half, abs=1e-5)
    assert s["ci_high"] == pytest.approx(5.0 + half, abs=1e-5)
    assert (s["min"], s["median"], s["max"]) == (2.0, 4.5, 9.0)


@pytest.mark.parametrize("seed,n", [(0, 5), (1, 30), (2, 100)])
def test_summarize_matches_scipy(seed, n):
    x = np.random.default_rng(seed).normal(81.5, 0.6, size=n)
    s = summarize(x, confidence=0.95)
    assert s["sd"] == pytest.approx(np.std(x, ddof=1))
    assert s["sem"] == pytest.approx(stats.sem(x))
    lo, hi = stats.t.interval(0.95, n - 1, loc=np.mean(x), scale=stats.sem(x))
    assert s["ci_low"] == pytest.approx(lo)
    assert s["ci_high"] == pytest.approx(hi)


def test_summarize_needs_two_runs():
    with pytest.raises(ValueError):
        summarize([81.6])


def test_diff_ci_hand_computed():
    # sd 1.0, 100 vs 100 runs -> se = sqrt(0.02); t(0.975, df=99) = 1.984217
    d = diff_ci_assuming_equal_spread(81.0, 1.0, 100, 81.5, 100)
    assert d["diff"] == pytest.approx(-0.5)
    assert d["se"] == pytest.approx(math.sqrt(0.02))
    assert d["ci_low"] == pytest.approx(-0.5 - 1.984217 * math.sqrt(0.02), abs=1e-5)
    assert d["ci_high"] == pytest.approx(-0.5 + 1.984217 * math.sqrt(0.02), abs=1e-5)


def test_share_within_is_inclusive():
    assert share_within([81.0, 81.5, 82.0, 83.0], 81.5, 0.5) == pytest.approx(0.75)
