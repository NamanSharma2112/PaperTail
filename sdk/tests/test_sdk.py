import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from papertrail import Experiment, capture
from papertrail.cli import extract_metrics, main
from papertrail.client import Config, sync


class Workspace(object):
    """A stand-in for the API that records what it is sent."""

    def __init__(self, status=201):
        self.received, self.status = [], status
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.received.append({"path": self.path, "auth": self.headers.get("Authorization"),
                                       "body": body})
                self.send_response(outer.status)
                self.end_headers()
                self.wfile.write(json.dumps({"id": len(outer.received), "run_set": body["run_set"]}).encode())

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = "http://127.0.0.1:%d" % self.server.server_port
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()


@pytest.fixture()
def workspace():
    w = Workspace()
    yield w
    w.close()


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    for name in ("PAPERTRAIL_URL", "PAPERTRAIL_PROJECT", "PAPERTRAIL_TOKEN", "PAPERTRAIL_SPOOL"):
        monkeypatch.delenv(name, raising=False)
    # Bypass any outbound proxy for the local stand-in server.
    monkeypatch.setenv("NO_PROXY", "127.0.0.1")
    monkeypatch.setenv("no_proxy", "127.0.0.1")


SCRIPT = "print('Epoch 1 accuracy= 0.5'); print('Test set results: cost= 1.00715 accuracy= 0.81600')"


def run_cli(workspace, *extra, script=SCRIPT):
    return main(["run", "--url", workspace.url, "--project", "demo", "--token", "pt_secret",
                 "--run-set", "cora", "--seed", "7", "--param", "epochs=200", "--param", "model=gcn"]
                + list(extra) + ["--", sys.executable, "-c", script])


def test_run_records_command_metrics_and_environment(workspace, capfd):
    code = run_cli(workspace, "--metric", r"test_accuracy=Test set results: .*accuracy= ([0-9.]+)",
                   "--metric", r"test_cost=cost= ([0-9.]+)")
    assert code == 0
    assert "Test set results" in capfd.readouterr().out  # output is passed through
    sent = workspace.received[0]
    assert sent["path"] == "/api/projects/demo/runs"
    assert sent["auth"] == "Bearer pt_secret"
    body = sent["body"]
    assert body["status"] == "completed" and body["exit_code"] == 0
    assert body["run_set"] == "cora" and body["seed"] == 7
    assert body["metrics"] == {"test_accuracy": 0.816, "test_cost": 1.00715}
    assert body["params"] == {"epochs": 200, "model": "gcn"}
    assert body["environment"]["python"] == ".".join(map(str, sys.version_info[:3]))
    assert "pytest" in body["environment"]["packages"]
    assert "accuracy= 0.81600" in body["log_tail"]
    assert body["command"].startswith(sys.executable + " -c ")
    assert body["started_at"].endswith("Z") and body["duration_seconds"] >= 0


def test_last_match_wins():
    metrics, missing = extract_metrics("acc= 0.1\nacc= 0.9\n", {"acc": r"acc= ([0-9.]+)", "f1": r"f1= ([0-9.]+)"})
    assert metrics == {"acc": 0.9} and missing == ["f1"]


def test_failing_command_is_recorded_as_failed_and_exit_code_is_passed_on(workspace):
    code = run_cli(workspace, script="import sys; print('boom'); sys.exit(3)")
    assert code == 3
    body = workspace.received[0]["body"]
    assert body["status"] == "failed" and body["exit_code"] == 3 and "boom" in body["log_tail"]


def test_missing_metric_makes_the_run_failed(workspace):
    code = run_cli(workspace, "--metric", r"f1=f1= ([0-9.]+)")
    assert code == 0  # the command itself succeeded
    body = workspace.received[0]["body"]
    assert body["status"] == "failed" and body["metrics"] == {}


def test_unreachable_workspace_spools_then_sync_delivers(workspace, tmp_path):
    dead = "http://127.0.0.1:9"
    code = main(["run", "--url", dead, "--project", "demo", "--token", "t", "--run-set", "cora",
                 "--", sys.executable, "-c", "print('ok')"])
    assert code == 0
    pending = os.listdir(str(tmp_path / ".papertrail" / "pending"))
    assert len(pending) == 1
    sent, kept, _ = sync(Config(url=workspace.url, project="demo", token="t"))
    assert (sent, kept) == (1, 0)
    assert workspace.received[0]["body"]["run_set"] == "cora"
    assert os.listdir(str(tmp_path / ".papertrail" / "pending")) == []


def test_rejected_upload_is_kept(tmp_path):
    w = Workspace(status=401)
    try:
        main(["run", "--url", w.url, "--project", "demo", "--token", "bad", "--run-set", "cora",
              "--", sys.executable, "-c", "print('ok')"])
    finally:
        w.close()
    assert len(os.listdir(str(tmp_path / ".papertrail" / "pending"))) == 1


def test_no_workspace_configured_spools(tmp_path):
    main(["run", "--run-set", "cora", "--", sys.executable, "-c", "print('ok')"])
    assert len(os.listdir(str(tmp_path / ".papertrail" / "pending"))) == 1


def test_experiment_context_manager(workspace, tmp_path):
    artifact = tmp_path / "results.csv"
    artifact.write_text("a,b\n1,2\n")
    with Experiment(run_set="baseline", seed=42, url=workspace.url, project="demo", token="t") as experiment:
        experiment.log_params({"learning_rate": 0.001})
        experiment.log_metrics({"accuracy": 0.937})
        experiment.log_artifact(str(artifact))
    body = workspace.received[0]["body"]
    assert body["status"] == "completed" and body["seed"] == 42
    assert body["params"] == {"learning_rate": 0.001} and body["metrics"] == {"accuracy": 0.937}
    assert body["artifacts"][0]["bytes"] == 8 and len(body["artifacts"][0]["sha256"]) == 64


def test_experiment_records_failure_and_reraises(workspace):
    with pytest.raises(RuntimeError):
        with Experiment(run_set="baseline", url=workspace.url, project="demo", token="t"):
            raise RuntimeError("diverged")
    body = workspace.received[0]["body"]
    assert body["status"] == "failed" and "diverged" in body["log_tail"]


def test_git_state_reports_commit_and_dirtiness(tmp_path):
    def git(*args):
        subprocess.run(["git"] + list(args), cwd=str(tmp_path), check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL)
    git("init", "-q")
    git("config", "user.email", "t@example.org")
    git("config", "user.name", "t")
    git("config", "commit.gpgsign", "false")
    (tmp_path / "a.txt").write_text("1")
    git("add", "a.txt")
    git("commit", "-q", "-m", "first")
    state = capture.git_state(str(tmp_path))
    assert len(state["commit"]) == 40 and state["dirty"] is False
    (tmp_path / "a.txt").write_text("2")
    assert capture.git_state(str(tmp_path))["dirty"] is True


def test_environment_has_no_identifying_fields():
    env = capture.environment()
    assert not {"hostname", "user", "env", "environ"} & set(env)


def test_commit_is_read_from_git_files_when_git_is_unavailable(tmp_path, monkeypatch):
    git_dir = tmp_path / ".git"
    (git_dir / "refs" / "heads").mkdir(parents=True)
    (git_dir / "HEAD").write_text("ref: refs/heads/main\n")
    (git_dir / "refs" / "heads" / "main").write_text("a" * 40 + "\n")
    sub = tmp_path / "pkg"
    sub.mkdir()
    monkeypatch.setattr(capture, "_git", lambda args, cwd: None)
    state = capture.git_state(str(sub))
    assert state["commit"] == "a" * 40 and state["dirty"] is None

    (git_dir / "refs" / "heads" / "main").unlink()
    (git_dir / "packed-refs").write_text("# pack-refs\n" + "b" * 40 + " refs/heads/main\n")
    assert capture.git_state(str(sub))["commit"] == "b" * 40

    monkeypatch.chdir("/")
    assert capture.git_state("/") == {}
