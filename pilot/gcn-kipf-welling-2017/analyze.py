"""Compare the paper's reported numbers with the recorded runs.

    python analyze.py            # prints a table, writes results/summary.json
"""
import json
import pathlib

from repro_stats import diff_ci_assuming_equal_spread, share_within, summarize

HERE = pathlib.Path(__file__).parent
PUBLISHED_RUNS = 100  # Section 6.1: "mean accuracy of 100 runs"


def load(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


# Run sets: the first three follow the paper's stated protocol with the code as published
# (apart from deviations D1-D3). The last is exploratory and changes one training flag (D4).
RUN_SETS = [
    {"id": "cora", "claim": "table2-gcn-cora", "file": "cora_seeds0-99.jsonl",
     "exploratory": False},
    {"id": "citeseer", "claim": "table2-gcn-citeseer", "file": "citeseer_seeds0-99.jsonl",
     "exploratory": False},
    {"id": "pubmed", "claim": "table2-gcn-pubmed", "file": "pubmed_seeds0-99.jsonl",
     "exploratory": False},
    {"id": "citeseer/no-ES", "claim": "table2-gcn-citeseer",
     "file": "citeseer_seeds0-99_no-early-stopping.jsonl", "exploratory": True,
     "note": "D4: --early_stopping 1000, i.e. always train the full 200 epochs"},
]


def compare(claim, run_set):
    row = {"run_set": run_set["id"], "claim_id": claim["id"], "dataset": claim["dataset"],
           "published_percent": claim["reported_value"], "exploratory": run_set["exploratory"]}
    if "note" in run_set:
        row["note"] = run_set["note"]
    path = HERE / "results" / run_set["file"]
    runs = load(path) if path.exists() else []
    ok = [r for r in runs if r["exit_code"] == 0 and r["test_accuracy"] is not None]
    row.update(runs_recorded=len(runs), runs_failed=len(runs) - len(ok))
    if len(ok) < 2:
        row.update(status="not_run")
        return row
    acc = [100.0 * r["test_accuracy"] for r in ok]
    s = summarize(acc)
    d = diff_ci_assuming_equal_spread(s["mean"], s["sd"], s["n"],
                                      claim["reported_value"], PUBLISHED_RUNS)
    row.update(
        status="complete" if len(ok) == PUBLISHED_RUNS else "partial",
        reproduced=s,
        diff_pp=d["diff"],
        diff_relative_percent=100.0 * d["diff"] / claim["reported_value"],
        diff_ci_assuming_equal_spread=d,
        published_inside_reproduced_ci=s["ci_low"] <= claim["reported_value"] <= s["ci_high"],
        share_of_single_runs_within_0p5pp=share_within(acc, claim["reported_value"], 0.5),
        early_stopped_share=sum(r["early_stopped"] for r in ok) / len(ok),
        runs_stopped_before_epoch_50=sum(r["epochs_run"] < 50 for r in ok),
        mean_epochs_run=sum(r["epochs_run"] for r in ok) / len(ok),
    )
    return row


def main():
    claims = {c["id"]: c for c in json.loads((HERE / "paper_claims.json").read_text())["claims"]}
    out = [compare(claims[rs["claim"]], rs) for rs in RUN_SETS]
    for claim in claims.values():
        if not claim["in_scope"]:
            out.append({"run_set": None, "claim_id": claim["id"], "dataset": claim["dataset"],
                        "published_percent": claim["reported_value"], "status": "blocked",
                        "reason": claim["out_of_scope_reason"]})

    (HERE / "results" / "summary.json").write_text(json.dumps(out, indent=2) + "\n")

    print("%-15s %9s %5s %7s %6s %16s %7s %16s %8s %7s" % (
        "run set", "published", "runs", "mean", "sd", "95% CI of mean", "diff pp",
        "95% CI of diff*", "1-run+-.5", "<50 ep"))
    for r in out:
        if r["status"] in ("blocked", "not_run"):
            print("%-15s %9.1f   %s" % (r["run_set"] or r["dataset"], r["published_percent"],
                                        r["status"].upper()))
            continue
        s, d = r["reproduced"], r["diff_ci_assuming_equal_spread"]
        print("%-15s %9.1f %5d %7.2f %6.2f %16s %+7.2f %16s %8.0f%% %7d" % (
            r["run_set"], r["published_percent"], s["n"], s["mean"], s["sd"],
            "[%.2f, %.2f]" % (s["ci_low"], s["ci_high"]), r["diff_pp"],
            "[%+.2f, %+.2f]" % (d["ci_low"], d["ci_high"]),
            100 * r["share_of_single_runs_within_0p5pp"], r["runs_stopped_before_epoch_50"]))
    print("* assumes the paper's 100 runs had the same run-to-run SD as ours; the paper reports none.")
    print("  '1-run+-.5' = share of individual runs within 0.5 points of the published value;")
    print("  '<50 ep' = runs the early-stopping rule ended before epoch 50.")


if __name__ == "__main__":
    main()
