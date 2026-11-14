"""Compare a claim with the run sets recorded against it.

The output states what was computed and under which assumptions. It never decides
whether a claim "reproduced": that is the researcher's verdict, stored on the claim.
"""
from typing import Optional

from . import stats
from .models import Claim, RunSet


def run_values(run_set: RunSet) -> list[dict]:
    """Completed runs that logged the compared metric, in the claim's unit."""
    out = []
    if not run_set.metric_key:
        return out
    for run in run_set.runs:
        value = (run.metrics or {}).get(run_set.metric_key)
        if run.status == "completed" and isinstance(value, (int, float)) and not isinstance(value, bool):
            out.append({"run_id": run.id, "seed": run.seed, "value": float(value) * run_set.metric_scale})
    return out


def compare_run_set(claim: Claim, run_set: RunSet) -> dict:
    points = run_values(run_set)
    values = [p["value"] for p in points]
    n = len(values)
    failed = sum(1 for r in run_set.runs if r.status != "completed")
    result: dict = {
        "run_set": run_set.key,
        "description": run_set.description,
        "exploratory": run_set.exploratory,
        "runs_recorded": len(run_set.runs),
        "runs_failed": failed,
        "runs_without_metric": len(run_set.runs) - failed - n,
        "n": n,
        "points": points,
        "summary": None,
        "diff": None,
        "diff_relative_percent": None,
        "diff_interval": None,
        "share_within_tolerance": None,
        "notes": [],
    }
    notes: list[dict] = result["notes"]
    if n == 0:
        result["state"] = "not_run"
        return result

    reported_runs: Optional[int] = claim.reported_runs
    if n == 1:
        mean = values[0]
        result["summary"] = {"n": 1, "mean": mean, "sd": None, "sem": None, "ci_low": None,
                             "ci_high": None, "min": mean, "median": mean, "max": mean,
                             "confidence": None}
        if reported_runs and reported_runs > 1:
            notes.append({"code": "single_run_vs_aggregate", "level": "warning",
                          "text": "One run is being compared with a published mean of %d runs. "
                                  "A single run says little about whether the mean reproduces."
                                  % reported_runs})
        else:
            notes.append({"code": "single_run", "level": "info",
                          "text": "Only one run recorded, so run-to-run variation is unknown."})
    else:
        result["summary"] = stats.summarize(values)
        mean = result["summary"]["mean"]

    result["diff"] = mean - claim.reported_value
    if claim.reported_value != 0:
        result["diff_relative_percent"] = 100.0 * result["diff"] / claim.reported_value

    if reported_runs and n < reported_runs:
        result["state"] = "partial"
        if n > 1:
            notes.append({"code": "fewer_runs_than_reported", "level": "warning",
                          "text": "%d runs recorded; the paper aggregates %d." % (n, reported_runs)})
    else:
        result["state"] = "complete"
    if reported_runs is None:
        notes.append({"code": "aggregation_not_stated", "level": "info",
                      "text": "The claim does not record how many runs the paper aggregated, so "
                              "the comparison cannot check that the protocols match."})

    if n > 1 and reported_runs and claim.reported_dispersion is None:
        s = result["summary"]
        result["diff_interval"] = dict(
            stats.diff_ci_assuming_equal_spread(s["mean"], s["sd"], n, claim.reported_value, reported_runs),
            assumption="The paper reports no dispersion. This interval assumes its %d runs varied "
                       "as much from run to run as the reproduced runs did." % reported_runs)
    if failed:
        notes.append({"code": "failed_runs", "level": "warning",
                      "text": "%d run(s) failed and are excluded from the statistics." % failed})
    if claim.tolerance is not None:
        result["share_within_tolerance"] = stats.share_within(values, claim.reported_value, claim.tolerance)
    return result


def compare_claim(claim: Claim) -> dict:
    run_sets = [compare_run_set(claim, rs) for rs in claim.run_sets]
    primary = [r for r in run_sets if not r["exploratory"]]
    if claim.blocked_reason:
        state = "blocked"
    elif not primary or all(r["state"] == "not_run" for r in primary):
        state = "not_run"
    elif any(r["state"] == "complete" for r in primary):
        state = "complete"
    else:
        state = "partial"
    return {"claim": claim.key, "state": state, "run_sets": run_sets}
