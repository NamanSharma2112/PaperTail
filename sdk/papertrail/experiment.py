"""Record a run from inside your own Python code.

    from papertrail import Experiment

    with Experiment(run_set="baseline", seed=42) as experiment:
        experiment.log_params({"learning_rate": 0.001})
        ...
        experiment.log_metrics({"accuracy": 0.937})

For code you did not write, prefer `papertrail run -- <command>`: it records the same
things without editing the code, and editing the authors' code is a deviation.
"""
import datetime
import sys
import time
import traceback

from . import capture
from .client import Config, deliver


class Experiment(object):
    def __init__(self, run_set, name=None, seed=None, url=None, project=None, token=None):
        self.config = Config(url=url, project=project, token=token)
        self.record = {"run_set": run_set, "name": name, "seed": seed, "params": {}, "metrics": {},
                       "artifacts": []}
        self._start = None

    def log_params(self, params):
        self.record["params"].update(params)

    def log_metrics(self, metrics):
        self.record["metrics"].update(metrics)

    def log_artifact(self, path):
        """Record a file's path, size and SHA-256. The file is not uploaded."""
        self.record["artifacts"].append(capture.file_fingerprint(path))

    def __enter__(self):
        self._start = time.time()
        self.record["started_at"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.record["environment"] = capture.environment()
        self.record["git"] = capture.git_state()
        self.record["command"] = " ".join(sys.argv)
        return self

    def __exit__(self, exc_type, exc, tb):
        self.record["duration_seconds"] = round(time.time() - self._start, 3)
        if exc_type is None:
            self.record["status"] = "completed"
        else:
            self.record["status"] = "failed"
            self.record["log_tail"] = "".join(traceback.format_exception(exc_type, exc, tb))[-4000:]
        _, message = deliver(self.config, self.record)
        sys.stderr.write("papertrail: %s\n" % message)
        return False  # never swallow the caller's exception
