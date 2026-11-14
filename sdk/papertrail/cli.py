"""papertrail command line.

    papertrail run --run-set cora --seed 3 --metric test_accuracy='accuracy= ([0-9.]+)' -- python train.py
    papertrail sync
    papertrail env
"""
import argparse
import datetime
import json
import re
import shlex
import subprocess
import sys
import time

from . import capture
from .client import Config, deliver, sync

LOG_TAIL_BYTES = 8000


def _parse_value(text):
    for cast in (int, float):
        try:
            return cast(text)
        except ValueError:
            pass
    return text


def _pairs(items, what):
    out = {}
    for item in items or []:
        if "=" not in item:
            raise SystemExit("papertrail: %s must look like name=value, got %r" % (what, item))
        name, value = item.split("=", 1)
        out[name] = value
    return out


def extract_metrics(output, patterns):
    """For each name, the first group of the LAST match of its pattern, as a number."""
    metrics, missing = {}, []
    for name, pattern in patterns.items():
        matches = re.findall(pattern, output)
        if not matches:
            missing.append(name)
            continue
        last = matches[-1]
        if isinstance(last, tuple):
            last = last[0]
        try:
            metrics[name] = float(last)
        except ValueError:
            missing.append(name)
    return metrics, missing


def run_command(command, cwd=None):
    """Run the command, pass its output through unchanged, and keep a copy."""
    start = time.time()
    try:
        proc = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    except OSError as exc:
        raise SystemExit("papertrail: could not start %r: %s" % (command[0], exc))
    chunks = []
    for line in iter(proc.stdout.readline, b""):
        sys.stdout.buffer.write(line)
        sys.stdout.buffer.flush()
        chunks.append(line)
    proc.wait()
    return proc.returncode, b"".join(chunks).decode("utf-8", "replace"), time.time() - start


def cmd_run(args):
    if not args.command:
        raise SystemExit("papertrail: give the command to run after `--`")
    command = args.command[1:] if args.command[0] == "--" else args.command
    patterns = _pairs(args.metric, "--metric")
    for name, pattern in patterns.items():
        try:
            if re.compile(pattern).groups < 1:
                raise SystemExit("papertrail: the pattern for %s needs one (group) around the number" % name)
        except re.error as exc:
            raise SystemExit("papertrail: bad pattern for %s: %s" % (name, exc))

    started = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    environment = capture.environment()
    git = capture.git_state(args.cwd)
    exit_code, output, duration = run_command(command, cwd=args.cwd)

    metrics, missing = extract_metrics(output, patterns)
    if args.metrics_file:
        try:
            with open(args.metrics_file) as f:
                loaded = json.load(f)
            metrics.update({k: v for k, v in loaded.items() if isinstance(v, (int, float))})
        except (OSError, ValueError) as exc:
            sys.stderr.write("papertrail: could not read metrics file %s: %s\n" % (args.metrics_file, exc))
    # A run whose command succeeded but produced none of the expected numbers is recorded
    # as failed: a missing metric must never look like a result.
    status = "completed" if exit_code == 0 and not missing else "failed"
    for name in missing:
        sys.stderr.write("papertrail: metric %s not found in the output\n" % name)

    record = {
        "run_set": args.run_set,
        "name": args.name,
        "seed": args.seed,
        "status": status,
        "exit_code": exit_code,
        "command": " ".join(shlex.quote(part) for part in command),
        "params": {k: _parse_value(v) for k, v in _pairs(args.param, "--param").items()},
        "metrics": metrics,
        "environment": environment,
        "git": git,
        "artifacts": [capture.file_fingerprint(p) for p in args.artifact or []],
        "started_at": started,
        "duration_seconds": round(duration, 3),
        "log_tail": output[-LOG_TAIL_BYTES:],
    }
    _, message = deliver(Config(args.url, args.project, args.token), record)
    sys.stderr.write("papertrail: %s\n" % message)
    return exit_code


def cmd_sync(args):
    config = Config(args.url, args.project, args.token)
    if not config.complete:
        raise SystemExit("papertrail: set PAPERTRAIL_URL, PAPERTRAIL_PROJECT and PAPERTRAIL_TOKEN")
    sent, kept, messages = sync(config)
    for message in messages:
        sys.stderr.write("papertrail: %s\n" % message)
    print("sent %d, still pending %d" % (sent, kept))
    return 1 if kept else 0


def cmd_env(args):
    print(json.dumps({"environment": capture.environment(), "git": capture.git_state()}, indent=2))
    return 0


def build_parser():
    parser = argparse.ArgumentParser(prog="papertrail", description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="subcommand")

    def workspace(p):
        p.add_argument("--url", help="workspace address (default: PAPERTRAIL_URL)")
        p.add_argument("--project", help="project slug (default: PAPERTRAIL_PROJECT)")
        p.add_argument("--token", help="project token (default: PAPERTRAIL_TOKEN)")

    run = sub.add_parser("run", help="run a command and record it")
    workspace(run)
    run.add_argument("--run-set", required=True, help="runs that differ only by seed share a run set")
    run.add_argument("--seed", type=int)
    run.add_argument("--name")
    run.add_argument("--param", action="append", metavar="NAME=VALUE", help="a setting worth recording")
    run.add_argument("--metric", action="append", metavar="NAME=REGEX",
                     help="read a number from the output: the first group of the last match")
    run.add_argument("--metrics-file", help="JSON file of numbers written by the command")
    run.add_argument("--artifact", action="append", metavar="PATH",
                     help="record a file's size and SHA-256 (the file is not uploaded)")
    run.add_argument("--cwd", help="directory to run in")
    run.add_argument("command", nargs=argparse.REMAINDER)
    run.set_defaults(func=cmd_run)

    sync_p = sub.add_parser("sync", help="upload runs that could not be sent earlier")
    workspace(sync_p)
    sync_p.set_defaults(func=cmd_sync)

    env = sub.add_parser("env", help="print what would be recorded about this environment")
    env.set_defaults(func=cmd_env)
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 2
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
