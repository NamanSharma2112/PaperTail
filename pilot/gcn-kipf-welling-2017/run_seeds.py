"""Run the official tkipf/gcn train.py once per seed and record the outcome.

The upstream script hard-codes `seed = 123`. The paper reports the mean over 100 runs
with random weight initialisations, so the seed has to vary. This driver changes exactly
one line of train.py in memory (deviation D3) and executes everything else as published.

Usage (inside the pilot container, cwd = <upstream repo>/gcn):
    python run_seeds.py --dataset cora --seeds 0-99 --out /out/cora.jsonl

--train-args passes extra flags to train.py unchanged (e.g. "--early_stopping 1000");
they are recorded with every run.
"""
import argparse
import json
import os
import re
import shlex
import subprocess
import sys
import time

SEED_LINE = "seed = 123\n"
CHILD = r"""
import os, shlex, sys
src = open('train.py').read()
assert src.count({seed_line!r}) == 1, 'upstream train.py changed: seed line not found exactly once'
src = src.replace({seed_line!r}, 'seed = %d\n' % int(os.environ['GCN_SEED']))
sys.argv = ['train.py', '--dataset', os.environ['GCN_DATASET']] + shlex.split(os.environ['GCN_ARGS'])
exec(compile(src, 'train.py', 'exec'), {{'__name__': '__main__'}})
"""

TEST_RE = re.compile(r"Test set results: cost= ([0-9.]+) accuracy= ([0-9.]+)")


def parse_seeds(spec):
    seeds = []
    for part in spec.split(","):
        if "-" in part:
            lo, hi = part.split("-")
            seeds.extend(range(int(lo), int(hi) + 1))
        else:
            seeds.append(int(part))
    return seeds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, choices=["cora", "citeseer", "pubmed"])
    ap.add_argument("--seeds", required=True, help="e.g. 0-99 or 123,123,123")
    ap.add_argument("--out", required=True)
    ap.add_argument("--train-args", default="", help="extra flags passed to train.py verbatim")
    args = ap.parse_args()

    child = CHILD.format(seed_line=SEED_LINE)
    with open(args.out, "a") as out:
        for seed in parse_seeds(args.seeds):
            env = dict(os.environ, GCN_SEED=str(seed), GCN_DATASET=args.dataset,
                       GCN_ARGS=args.train_args)
            t0 = time.time()
            proc = subprocess.run([sys.executable, "-c", child], env=env,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  universal_newlines=True)
            wall = time.time() - t0
            m = TEST_RE.search(proc.stdout)
            rec = {
                "dataset": args.dataset,
                "seed": seed,
                "train_args": shlex.split(args.train_args),
                "exit_code": proc.returncode,
                "test_accuracy": float(m.group(2)) if m else None,
                "test_cost": float(m.group(1)) if m else None,
                "epochs_run": proc.stdout.count("Epoch:"),
                "early_stopped": "Early stopping..." in proc.stdout,
                "process_wall_seconds": round(wall, 2),
            }
            if m is None:
                rec["stderr_tail"] = proc.stderr[-2000:]
            out.write(json.dumps(rec) + "\n")
            out.flush()


if __name__ == "__main__":
    main()
