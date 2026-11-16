# SDK guide

`papertrail` records what a research run was (code commit, environment, seed, parameters, command) and what it produced (metrics, small files). It sends that record to a PaperTrail project.

- It uses only the Python standard library and works on Python 3.7 and later. It installs into the research code's own environment without changing its dependencies.
- It never runs anything the server sends. The server never runs your code.
- If the server can't be reached, the run is saved locally and sent later.

## Install

From a checkout of this repository:

```bash
pip install ./packages/python-sdk
```

Or straight from GitHub, if the repository is accessible to you:

```bash
pip install "git+https://github.com/NamanSharma2112/PaperTail#subdirectory=packages/python-sdk"
```

## Configure

In the project's **Settings** tab, create an ingestion token. It is shown once, so copy it then. Set:

```bash
export PAPERTRAIL_URL=https://your-papertrail.example      # or http://localhost:3000
export PAPERTRAIL_PROJECT=<project id from the Experiments tab>
export PAPERTRAIL_TOKEN=pt_...
```

On Windows PowerShell:

```powershell
$env:PAPERTRAIL_URL="http://localhost:3000"; $env:PAPERTRAIL_PROJECT="<id>"; $env:PAPERTRAIL_TOKEN="pt_..."
```

Keep the token out of code and out of Git. A token can write runs to one project only. Revoke it in Settings if it leaks.

## Option 1: wrap an unchanged command (recommended for a reproduction)

Editing the authors' training script to add logging is itself a change to their method. The CLI avoids that:

```bash
papertrail run --group cora --seed 3 \
  --param dataset=cora --param epochs=200 \
  --metric 'test_accuracy=Test set results:.*accuracy= ([0-9.]+)' \
  -- python train.py --dataset cora --seed 3
```

| Option | Meaning |
|---|---|
| `--group` | Run group. Runs that share a configuration and differ only by seed share a group, and are summarised together. |
| `--seed` | Recorded seed. Pass the same value to the command yourself. |
| `--name` | Run name (default: group and seed). |
| `--param NAME=VALUE` | A setting worth recording. Repeatable. |
| `--metric NAME=REGEX` | Read a number from the command's output: the first capture group of the **last** match. Repeatable. |
| `--metrics-file PATH` | A JSON object of numbers the command writes, read after it finishes. |
| `--artifact PATH` | Attach a small file (2 MB maximum). Repeatable. |
| `--dataset-version` | Dataset identifier, version or hash. |
| `--no-packages` | Don't record installed packages. |
| `--cwd` | Directory to run in. |

The CLI passes the command's output through unchanged and exits with the command's exit code. A non-zero exit is recorded as a failed run with the redacted last part of the output. So is a command that succeeds without printing a requested `--metric`: a missing number must never look like a result. Ctrl+C stops the command and records the run as cancelled.

Other commands:

```bash
papertrail env     # print what would be recorded about this environment
papertrail sync    # send runs saved offline
```

## Option 2: the `Experiment` context manager

For your own reimplementation:

```python
from papertrail import Experiment

for seed in range(10):
    with Experiment(name=f"cora seed {seed}", group="cora", seed=seed) as exp:
        exp.log_params({"learning_rate": 0.01, "hidden": 16, "dropout": 0.5})
        exp.set_dataset_version("planetoid-cora@kipf-2017")
        acc = train_and_evaluate(seed)          # your code
        exp.log_metric("test_accuracy", acc)
        exp.log_artifact("predictions.csv")
```

| Method | Notes |
|---|---|
| `Experiment(name, group="default", seed=None, dataset_version=None, command=None, capture_packages=True, quiet=False, url=, project_id=, token=)` | Arguments override the environment variables. |
| `log_param(name, value)`, `log_params(dict)` | Scalars or short lists. Sent when the run ends, so parameters logged mid-run are kept. |
| `log_metric(name, value, step=None, unit=None)`, `log_metrics(dict, step=None, unit=None)` | Finite numbers only. NaN and infinity raise `ValueError`. When a metric is logged at several steps, comparisons use the highest step. |
| `log_artifact(path, name=None)` | Up to 2 MB per file. Allowed types: text, CSV, JSON, Markdown, YAML, PNG, JPEG, SVG, PDF, binary. |
| `set_dataset_version(v)` | |
| `mark_failed(summary, status="failed")` | End the run as failed (or `"cancelled"`) without raising. |

An exception inside the `with` block marks the run failed, records a redacted traceback, and is **re-raised**: the SDK never hides your errors. `KeyboardInterrupt` marks it cancelled.

## What is recorded

- **Git**: repository URL (credentials stripped), commit, and whether the working tree has uncommitted changes. If the `git` executable is missing, the SDK reads the `.git` directory directly.
- **Environment**: Python version, OS, platform, CPU count and machine type, GPU names if `nvidia-smi` is available, and installed packages with versions (disable with `capture_packages=False` / `--no-packages`).
- **Run**: command line (redacted), start and end time, duration, seed, parameters, exit status.

## Secrets and redaction

Before anything is sent, the SDK masks:

- credentials in URLs (`https://user:pass@host`);
- PaperTrail tokens (`pt_…`), GitHub tokens (`ghp_…` and similar), AWS access key ids, `Bearer …` values;
- `key=value` or `key: value` pairs where the key is api_key, access_key, token, secret, password or passwd;
- the **values** of environment variables whose names contain TOKEN, SECRET, PASSWORD, PASSWD, API_KEY, ACCESS_KEY or PRIVATE (values of 8 characters or more), wherever those values appear.

**Limitation:** a secret written literally in your source code can still appear in a traceback line, and redaction can't recognise every format. Keep secrets in environment variables, and check failure summaries before sharing a report.

## Offline use and retries

- Each request is retried up to four times with backoff on network errors, 429 and 5xx. `Retry-After` is respected.
- Run creation carries an idempotency key, so a retried request never creates a duplicate run.
- If the workspace isn't configured or can't be reached, the whole record (run, metrics, artifacts, outcome) is written to `.papertrail/pending/` in the working directory. `papertrail sync` sends it later. Add `.papertrail/` to your `.gitignore`.

## Troubleshooting

| Message | Cause |
|---|---|
| `invalid_token` (401) | Wrong token, revoked, or expired. Create a new one. |
| `wrong_project` (403) | `PAPERTRAIL_PROJECT` is not the token's project. |
| `run_closed` (409) | Metrics or files sent after the run finished. |
| `quota_exceeded` (413) | The project's artifact storage is full. Keep large files locally. |
| "recording offline" | Configuration missing or server unreachable. Run `papertrail sync` later. |
