"""Record a run from inside your own Python code.

    from papertrail import Experiment

    with Experiment(name="baseline", group="cora", seed=42) as exp:
        exp.log_params({"learning_rate": 0.001})
        ...
        exp.log_metrics({"accuracy": 0.937})
        exp.log_artifact("results.csv")

For code you did not write, prefer `papertrail run -- <command>`: it records the same
things without editing the code, and editing the authors' code is itself a deviation.
"""
import datetime
import os
import sys
import time
import traceback
import uuid

from . import capture
from .client import MAX_ARTIFACT_BYTES, Client, Config, PaperTrailError
from .redact import redact


def _now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _scalar(v):
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v if not isinstance(v, str) else v[:2000]
    if isinstance(v, (list, tuple)):
        return [_scalar(x) for x in list(v)[:100]]
    return str(v)[:2000]


class Experiment(object):
    """One run. Sends its record when the block ends; if the server cannot be reached the
    record is saved under .papertrail/pending and sent later by `papertrail sync`."""

    def __init__(self, name, group="default", seed=None, project_id=None, url=None, token=None,
                 dataset_version=None, command=None, capture_packages=True, client=None, quiet=False):
        self.client = client or Client(Config(url=url, project_id=project_id, token=token))
        self.name = name
        self.group = group
        self.seed = seed
        self.dataset_version = dataset_version
        self.command = command
        self.capture_packages = capture_packages
        self.quiet = quiet
        self.params = {}
        self.metrics = []
        self.artifacts = []
        self.run_id = None
        self.offline = False
        self._start = None
        self._started_at = None
        self._idempotency = uuid.uuid4().hex
        self._forced = None

    # ---------- logging ----------

    def log_params(self, params):
        for k, v in dict(params).items():
            self.params[str(k)[:120]] = _scalar(v)

    def log_param(self, name, value):
        self.log_params({name: value})

    def log_metric(self, name, value, step=None, unit=None):
        value = float(value)
        if value != value or value in (float("inf"), float("-inf")):
            raise ValueError("metric %s is not a finite number: %r" % (name, value))
        self.metrics.append({"name": str(name), "value": value, "step": step, "unit": unit})

    def log_metrics(self, metrics, step=None, unit=None):
        for k, v in dict(metrics).items():
            self.log_metric(k, v, step=step, unit=unit)

    def log_artifact(self, path, name=None):
        """Attach a small file (2 MB at most). Its size and SHA-256 are recorded too."""
        size = os.path.getsize(path)
        if size > MAX_ARTIFACT_BYTES:
            raise ValueError("%s is %d bytes; artifacts are limited to 2 MB" % (path, size))
        self.artifacts.append({"path": os.path.abspath(path), "name": name or os.path.basename(path), "sha256": capture.file_fingerprint(path)["sha256"]})

    def set_dataset_version(self, version):
        self.dataset_version = str(version)

    def mark_failed(self, summary, status="failed"):
        """Report the run as failed (or cancelled) when the block ends, without raising."""
        self._forced = {"status": status, "failure_summary": redact(summary)[-8000:]}

    # ---------- lifecycle ----------

    def _run_payload(self):
        env = capture.environment(packages=self.capture_packages)
        git = capture.git_state()
        return {
            "name": self.name, "run_group": self.group, "seed": self.seed, "idempotency_key": self._idempotency,
            "parameters": self.params, "dataset_version": self.dataset_version,
            "git": {"repository": git.get("remote"), "commit": git.get("commit"), "dirty": git.get("dirty")},
            "environment": env, "command": self.command or " ".join(sys.argv)[:4000], "started_at": self._started_at,
        }

    def _say(self, msg):
        if not self.quiet:
            sys.stderr.write("papertrail: %s\n" % msg)

    def __enter__(self):
        self._start = time.time()
        self._started_at = _now()
        if not self.client.config.complete:
            self.offline = True
            self._say("not configured (%s); recording offline" % ", ".join(self.client.config.missing()))
            return self
        try:
            self.run_id = self.client.create_run(self._run_payload())["id"]
            self._say("run %s started" % self.run_id)
        except PaperTrailError as exc:
            if not exc.transient:
                raise
            self.offline = True
            self._say("%s; recording offline" % exc)
        return self

    def _outcome(self, exc_type, exc, tb):
        duration = round(time.time() - self._start, 3)
        if exc_type is None and self._forced:
            return dict(self._forced, completed_at=_now(), duration_seconds=duration)
        if exc_type is None:
            return {"status": "completed", "completed_at": _now(), "duration_seconds": duration}
        status = "cancelled" if issubclass(exc_type, KeyboardInterrupt) else "failed"
        summary = redact("".join(traceback.format_exception(exc_type, exc, tb))[-6000:])
        return {"status": status, "failure_summary": summary, "completed_at": _now(), "duration_seconds": duration}

    def __exit__(self, exc_type, exc, tb):
        outcome = self._outcome(exc_type, exc, tb)
        record = {"run": None, "metrics": self.metrics, "artifacts": self.artifacts, "outcome": outcome}
        try:
            if self.offline or self.run_id is None:
                raise PaperTrailError("offline", transient=True)
            if self.metrics:
                self.client.log_metrics(self.run_id, self.metrics)
            for a in self.artifacts:
                self.client.upload_artifact(self.run_id, a["path"], a["name"])
            if outcome["status"] == "completed":
                self.client.complete_run(self.run_id, outcome["completed_at"], outcome["duration_seconds"], self.params, self.dataset_version)
            else:
                self.client.fail_run(self.run_id, outcome["failure_summary"], outcome["completed_at"], outcome["duration_seconds"], outcome["status"], self.params, self.dataset_version)
            self._say("run %s %s" % (self.run_id, outcome["status"]))
        except PaperTrailError as err:
            record["run"] = self._run_payload()
            path = self.client.spool(record)
            self._say("could not send the run (%s); saved to %s. Send it later with `papertrail sync`." % (err, path) if str(err) != "offline" else "saved to %s; send it with `papertrail sync`" % path)
        return False  # never swallow the caller's exception
