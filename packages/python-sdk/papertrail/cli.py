"""papertrail command line.

    papertrail run --group cora --seed 3 --metric 'test_accuracy=accuracy= ([0-9.]+)' -- python train.py
    papertrail sync
    papertrail env

Configuration comes from PAPERTRAIL_URL, PAPERTRAIL_PROJECT and PAPERTRAIL_TOKEN (or flags).
"""
import argparse
import json
import re
import shlex
import subprocess
import sys

from . import capture
from .client import Client, Config
from .experiment import Experiment
from .redact import redact

LOG_TAIL_BYTES = 6000


def _parse_value(text):
    for cast in (int, float):
        try:
            return cast(text)
        except ValueError:
            pass
    return {"true": True, "false": False}.get(text.lower(), text)


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
    try:
        proc = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    except OSError as exc:
        raise SystemExit("papertrail: could not start %r: %s" % (command[0], exc))
    chunks = []
    try:
        for line in iter(proc.stdout.readline, b""):
            sys.stdout.buffer.write(line)
            sys.stdout.buffer.flush()
            chunks.append(line)
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        proc.wait()
        raise
    return proc.returncode, b"".join(chunks).decode("utf-8", "replace")


def _config(args):
    return Config(url=args.url, project_id=args.project, token=args.token)


def cmd_run(args):
    command = args.command[1:] if args.command and args.command[0] == "--" else args.command
    if not command:
        raise SystemExit("papertrail: give the command to run after `--`")
    patterns = _pairs(args.metric, "--metric")
    for name, pattern in patterns.items():
        try:
            if re.compile(pattern).groups < 1:
                raise SystemExit("papertrail: the pattern for %s needs one (group) around the number" % name)
        except re.error as exc:
            raise SystemExit("papertrail: bad pattern for %s: %s" % (name, exc))

    exit_code = 0
    exp = Experiment(
        name=args.name or (args.group + (" seed %s" % args.seed if args.seed is not None else "")),
        group=args.group, seed=args.seed, dataset_version=args.dataset_version,
        command=" ".join(shlex.quote(c) for c in command), client=Client(_config(args)), capture_packages=not args.no_packages,
    )
    with exp:
        exp.log_params({k: _parse_value(v) for k, v in _pairs(args.param, "--param").items()})
        exit_code, output = run_command(command, cwd=args.cwd)
        metrics, missing = extract_metrics(output, patterns)
        if args.metrics_file:
            try:
                with open(args.metrics_file) as f:
                    loaded = json.load(f)
                metrics.update({k: v for k, v in loaded.items() if isinstance(v, (int, float)) and not isinstance(v, bool)})
            except (OSError, ValueError) as exc:
                sys.stderr.write("papertrail: could not read metrics file %s: %s\n" % (args.metrics_file, exc))
        exp.log_metrics(metrics)
        for path in args.artifact or []:
            try:
                exp.log_artifact(path)
            except (OSError, ValueError) as exc:
                sys.stderr.write("papertrail: artifact %s not attached: %s\n" % (path, exc))
        tail = redact(output[-LOG_TAIL_BYTES:])
        # A command that succeeded without printing the expected numbers is reported as
        # failed: a missing metric must never look like a result.
        if exit_code != 0:
            exp.mark_failed("command exited with status %d\n\n%s" % (exit_code, tail))
        elif missing:
            exp.mark_failed("command succeeded but these metrics were not found in its output: %s\n\n%s" % (", ".join(missing), tail))
    return exit_code


def cmd_sync(args):
    client = Client(_config(args))
    if not client.config.complete:
        raise SystemExit("papertrail: set " + ", ".join(client.config.missing()))
    sent, kept, messages = client.sync()
    for m in messages:
        sys.stderr.write("papertrail: %s\n" % m)
    print("sent %d, still pending %d" % (sent, kept))
    return 1 if kept else 0


def cmd_env(args):
    print(json.dumps({"environment": capture.environment(), "git": capture.git_state()}, indent=2))
    return 0


def build_parser():
    parser = argparse.ArgumentParser(prog="papertrail", description="Record research runs in a PaperTrail project.")
    sub = parser.add_subparsers(dest="subcommand")

    def workspace(p):
        p.add_argument("--url", help="workspace address (default: PAPERTRAIL_URL)")
        p.add_argument("--project", help="project id (default: PAPERTRAIL_PROJECT)")
        p.add_argument("--token", help="ingestion token (default: PAPERTRAIL_TOKEN; prefer the variable, flags show up in shell history)")

    run = sub.add_parser("run", help="run a command and record it")
    workspace(run)
    run.add_argument("--group", default="default", help="runs that differ only by seed share a group")
    run.add_argument("--seed", type=int)
    run.add_argument("--name")
    run.add_argument("--param", action="append", metavar="NAME=VALUE", help="a setting worth recording")
    run.add_argument("--metric", action="append", metavar="NAME=REGEX", help="read a number from the output: the first group of the last match")
    run.add_argument("--metrics-file", help="JSON file of numbers written by the command")
    run.add_argument("--artifact", action="append", metavar="PATH", help="attach a small file (2 MB max)")
    run.add_argument("--dataset-version", help="dataset identifier, version or hash")
    run.add_argument("--no-packages", action="store_true", help="do not record installed packages")
    run.add_argument("--cwd", help="directory to run in")
    run.add_argument("command", nargs=argparse.REMAINDER)
    run.set_defaults(func=cmd_run)

    sync = sub.add_parser("sync", help="send runs that were recorded offline")
    workspace(sync)
    sync.set_defaults(func=cmd_sync)

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
