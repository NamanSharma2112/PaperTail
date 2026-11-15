"""Load the GCN pilot reproduction into a running PaperTrail API.

    python scripts/seed_pilot.py --api http://localhost:8000

Everything it uploads comes from pilot/gcn-kipf-welling-2017: the claims, the recorded
runs, and the deviations. Prints the new project's token.
"""
import argparse
import json
import pathlib
import sys

import httpx

PILOT = pathlib.Path(__file__).resolve().parents[2] / "pilot" / "gcn-kipf-welling-2017"
SLUG = "gcn-kipf-welling-2017"

RUN_SETS = [
    {"key": "cora", "claim": "table2-gcn-cora", "file": "cora_seeds0-99.jsonl",
     "description": "Official train.py, seeds 0-99"},
    {"key": "citeseer", "claim": "table2-gcn-citeseer", "file": "citeseer_seeds0-99.jsonl",
     "description": "Official train.py, seeds 0-99"},
    {"key": "pubmed", "claim": "table2-gcn-pubmed", "file": "pubmed_seeds0-99.jsonl",
     "description": "Official train.py, seeds 0-99"},
    {"key": "citeseer-no-early-stopping", "claim": "table2-gcn-citeseer", "exploratory": True,
     "file": "citeseer_seeds0-99_no-early-stopping.jsonl",
     "description": "Deviation D4: --early_stopping 1000, so every run trains the full 200 epochs"},
]

DEVIATIONS = [
    {"key": "D1", "kind": "environment",
     "what": "numpy 1.18.5 and setuptools 57.5.0 in place of the pinned 1.15.4 and 40.6.3",
     "why": "The repository's requirements.txt is unsatisfiable: both pins conflict with the pinned "
            "tensorflow 1.15.4",
     "expected_effect": "None expected; unverifiable, since the pinned set cannot be installed",
     "applies_to": "all runs"},
    {"key": "D2", "kind": "environment", "what": "Added protobuf==3.20.3",
     "why": "tensorflow 1.15.4 does not cap protobuf and fails to import with the 4.x release pip now selects",
     "expected_effect": "None expected", "applies_to": "all runs"},
    {"key": "D3", "kind": "code",
     "what": "The line `seed = 123` in train.py is replaced, in memory, by the run's seed",
     "why": "The script hard-codes one seed; the paper reports the mean of 100 random initialisations",
     "expected_effect": "Required to follow the paper's protocol. The seed also drives dropout",
     "applies_to": "all runs"},
    {"key": "D4", "kind": "protocol",
     "what": "--early_stopping 1000, so training always runs the full 200 epochs",
     "why": "To measure the effect of the code's early-stopping rule, which differs from the rule the "
            "paper describes and ends 2 of 100 Citeseer runs at epoch 12-13",
     "expected_effect": "Removes early stopping altogether, which is also not what the paper describes",
     "applies_to": "run set citeseer-no-early-stopping"},
]

VERDICTS = {
    "table2-gcn-cora": ("matched", "The 100-run mean is 0.03 points from the published value."),
    "table2-gcn-pubmed": ("matched", "The 100-run mean is 0.05 points from the published value."),
    "table2-gcn-citeseer": ("inconclusive",
                            "As published the code gives 69.63, pulled down by two runs that stop at epoch "
                            "12-13 at chance accuracy. With early stopping off it gives 70.75. The paper "
                            "does not say enough to choose between the readings."),
    "table2-gcn-nell": ("blocked", "Dataset and configuration are not in the official repository."),
}


def environment():
    env = {}
    for line in (PILOT / "env" / "environment.yaml").read_text().splitlines():
        key, _, value = line.partition(": ")
        env[key] = value
    packages = dict(line.split("==", 1) for line in (PILOT / "env" / "pip-freeze.txt").read_text().split()
                    if "==" in line)
    return ({"python": env["container_python"].replace("Python ", ""),
             "platform": "%s (container, %s)" % (env["container_os"], env["base_image"].split("@")[0]),
             "cpu_model": env["cpu_model"], "cpu_count": int(env["cpu_cores_visible"]), "gpus": [],
             "packages": packages},
            {"commit": env["upstream_commit"], "dirty": False, "remote": env["upstream_repo"]})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000")
    args = ap.parse_args()
    http = httpx.Client(base_url=args.api, timeout=60)
    claims = json.loads((PILOT / "paper_claims.json").read_text())
    paper = claims["paper"]

    if http.get("/api/projects/%s" % SLUG).status_code == 200:
        print("The pilot project is already loaded: %s/api/projects/%s" % (args.api, SLUG))
        return
    project = {
        "slug": SLUG, "title": "GCN (Kipf & Welling, ICLR 2017)",
        "summary": "The official code run 100 times per dataset with seeds 0-99, compared with the "
                   "'GCN (this paper)' row of Table 2.",
        "code_url": paper["official_code"], "code_commit": paper["official_code_commit_evaluated"],
        "data_note": "Cora, Citeseer and Pubmed as shipped in the repository (Planetoid split). "
                     "NELL is not in the repository."}
    r = http.post("/api/projects", json=dict(project, identifier=paper["arxiv_id"]))
    if r.status_code == 502:
        # arXiv not reachable (offline, firewall): use the metadata recorded with the pilot.
        print("arXiv lookup failed; using the paper details stored with the pilot.")
        r = http.post("/api/projects", json=dict(project, paper={
            "title": paper["title"], "authors": paper["authors"], "venue": paper["venue"],
            "arxiv_id": paper["arxiv_id"], "url": "https://arxiv.org/abs/%s" % paper["arxiv_id"],
            "metadata_source": "manual"}))
    if r.status_code != 201:
        sys.exit("could not create the project: %s %s" % (r.status_code, r.text))
    token = r.json()["token"]
    auth = {"Authorization": "Bearer " + token}

    def call(method, path, **kw):
        resp = http.request(method, "/api/projects/%s%s" % (SLUG, path), headers=auth, **kw)
        if resp.status_code >= 300:
            sys.exit("%s %s failed: %s %s" % (method, path, resp.status_code, resp.text))
        return resp

    for c in claims["claims"]:
        verdict, note = VERDICTS[c["id"]]
        call("POST", "/claims", json={
            "key": c["id"], "label": "Table 2: GCN on %s" % c["dataset"].capitalize().replace("Nell", "NELL"),
            "metric": "test accuracy", "unit": "%", "reported_value": c["reported_value"],
            "aggregation": c["reported_aggregation"], "reported_runs": 100,
            "reported_dispersion": c["reported_dispersion"], "source": c["source"],
            "blocked_reason": c.get("out_of_scope_reason", "").replace("BLOCKED: the", "The") or None,
            "verdict": verdict, "verdict_note": note})
    for d in DEVIATIONS:
        call("POST", "/deviations", json=d)

    env, git = environment()
    total = 0
    for rs in RUN_SETS:
        call("PUT", "/run-sets", json={"key": rs["key"], "claim": rs["claim"], "description": rs["description"],
                                       "metric_key": "test_accuracy", "metric_scale": 100,
                                       "exploratory": rs.get("exploratory", False)})
        runs = []
        for line in (PILOT / "results" / rs["file"]).read_text().splitlines():
            rec = json.loads(line)
            train_args = ["--dataset", rec["dataset"]] + rec.get("train_args", [])
            runs.append({
                "run_set": rs["key"], "seed": rec["seed"],
                "status": "completed" if rec["exit_code"] == 0 and rec["test_accuracy"] is not None else "failed",
                "exit_code": rec["exit_code"], "command": "python train.py " + " ".join(train_args),
                "params": {"dataset": rec["dataset"], "train_args": rec.get("train_args", [])},
                "metrics": {"test_accuracy": rec["test_accuracy"], "test_cost": rec["test_cost"],
                            "epochs_run": rec["epochs_run"], "early_stopped": int(rec["early_stopped"])},
                "environment": env, "git": git, "duration_seconds": rec["process_wall_seconds"]})
        call("POST", "/runs/batch", json={"runs": runs})
        total += len(runs)
    # One run made through the CLI itself: the unmodified train.py with its default seed,
    # wrapped by `papertrail run` inside the Python 3.7 container.
    call("PUT", "/run-sets", json={
        "key": "cora-default-seed", "claim": "table2-gcn-cora", "metric_key": "test_accuracy",
        "metric_scale": 100, "exploratory": True,
        "description": "The repository's demo as shipped: one run, default seed 123, recorded with "
                       "`papertrail run`"})
    call("POST", "/runs", json=json.loads((PILOT / "results" / "cli_run_default_seed123.json").read_text()))
    total += 1
    print("project: %s/api/projects/%s" % (args.api, SLUG))
    print("runs uploaded: %d" % total)
    print("token: %s" % token)
    print("Keep this token: it is needed to edit the project and is not shown again.")


if __name__ == "__main__":
    main()
