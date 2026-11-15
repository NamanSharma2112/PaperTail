import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from papertrail import Client, Config, Experiment, PaperTrailError, capture
from papertrail.cli import extract_metrics, main
from papertrail.redact import redact

PROJECT = "11111111-1111-1111-1111-111111111111"
TOKEN = "pt_" + "t" * 43


class FakeWorkspace(object):
    """Stand-in for the ingestion API. `fail_next` makes the next N requests return a
    status code before behaving normally."""

    def __init__(self):
        self.requests, self.runs, self.fail_next = [], {}, []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def _reply(self, status, body):
                data = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_POST(self):
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length)
                ctype = self.headers.get("Content-Type", "")
                body = json.loads(raw) if ctype.startswith("application/json") and raw else None
                outer.requests.append({"path": self.path, "auth": self.headers.get("Authorization"), "body": body, "raw": raw, "headers": dict(self.headers)})
                if outer.fail_next:
                    return self._reply(outer.fail_next.pop(0), {"error": {"code": "x", "message": "simulated"}})
                if self.headers.get("Authorization") != "Bearer " + TOKEN:
                    return self._reply(401, {"error": {"code": "invalid_token", "message": "bad token"}})
                parts = self.path.strip("/").split("/")
                if self.path == "/api/v1/sdk/runs":
                    for r in outer.runs.values():
                        if r["idempotency_key"] == body.get("idempotency_key"):
                            return self._reply(200, {"run": r})
                    rid = "22222222-2222-2222-2222-%012d" % (len(outer.runs) + 1)
                    outer.runs[rid] = dict(body, id=rid, status="running", metrics=[], artifacts=[])
                    return self._reply(201, {"run": outer.runs[rid]})
                run = outer.runs[parts[4]]
                if parts[5] == "metrics":
                    run["metrics"] += body["metrics"]
                    return self._reply(201, {"stored": len(body["metrics"])})
                if parts[5] == "artifacts":
                    run["artifacts"].append({"name": self.headers.get("X-File-Name"), "type": ctype, "bytes": len(raw)})
                    return self._reply(201, {"artifact": {"id": "a"}})
                run["status"] = "completed" if parts[5] == "complete" else body.get("status", "failed")
                run["parameters"] = dict(run.get("parameters") or {}, **(body.get("parameters") or {}))
                run["outcome"] = body
                return self._reply(200, {"run": run})

            def log_message(self, *a):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = "http://127.0.0.1:%d" % self.server.server_port
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def only_run(self):
        assert len(self.runs) == 1, self.runs
        return list(self.runs.values())[0]


@pytest.fixture()
def ws(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    for k in ("PAPERTRAIL_URL", "PAPERTRAIL_PROJECT", "PAPERTRAIL_TOKEN", "PAPERTRAIL_SPOOL"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("NO_PROXY", "127.0.0.1")
    monkeypatch.setenv("no_proxy", "127.0.0.1")
    w = FakeWorkspace()
    yield w
    w.server.shutdown()


def client(ws, **kw):
    return Client(Config(url=ws.url, project_id=PROJECT, token=TOKEN, **kw), sleep=lambda s: None)


def test_experiment_records_params_metrics_artifacts_and_completes(ws, tmp_path):
    f = tmp_path / "results.csv"
    f.write_text("a,b\n1,2\n")
    with Experiment(name="baseline", group="cora", seed=42, client=client(ws), quiet=True) as exp:
        exp.log_params({"learning_rate": 0.001, "layers": [16, 7]})
        exp.log_metrics({"accuracy": 0.937, "f1_score": 0.921})
        exp.log_metric("loss", 0.5, step=10)
        exp.log_artifact(str(f))
    run = ws.only_run()
    assert run["project_id"] == PROJECT and run["run_group"] == "cora" and run["seed"] == 42
    assert run["status"] == "completed" and run["outcome"]["duration_seconds"] >= 0
    assert run["parameters"] == {"learning_rate": 0.001, "layers": [16, 7]}
    assert {m["name"] for m in run["metrics"]} == {"accuracy", "f1_score", "loss"}
    assert run["artifacts"] == [{"name": "results.csv", "type": "text/csv", "bytes": 8}]
    assert run["environment"]["python"] == ".".join(map(str, sys.version_info[:3]))
    assert "pytest" in run["environment"]["packages"]
    assert all(r["auth"] == "Bearer " + TOKEN for r in ws.requests)


def test_exception_marks_run_failed_with_redacted_traceback_and_reraises(ws, monkeypatch):
    monkeypatch.setenv("MY_API_KEY", "supersecretvalue123")
    with pytest.raises(RuntimeError):
        with Experiment(name="x", client=client(ws), quiet=True):
            raise RuntimeError("diverged; key supersecretvalue123 token=abc123456")
    run = ws.only_run()
    assert run["status"] == "failed"
    summary = run["outcome"]["failure_summary"]
    assert "diverged" in summary and "supersecretvalue123" not in summary and "abc123456" not in summary


def test_keyboard_interrupt_is_cancelled(ws):
    with pytest.raises(KeyboardInterrupt):
        with Experiment(name="x", client=client(ws), quiet=True):
            raise KeyboardInterrupt()
    assert ws.only_run()["status"] == "cancelled"


def test_transient_errors_are_retried_without_duplicating_the_run(ws):
    ws.fail_next = [503, 502]
    with Experiment(name="x", client=client(ws), quiet=True) as exp:
        exp.log_metric("acc", 1)
    assert ws.only_run()["status"] == "completed"
    creates = [r for r in ws.requests if r["path"] == "/api/v1/sdk/runs"]
    assert len(creates) == 3 and len({r["body"]["idempotency_key"] for r in creates}) == 1


def test_permanent_errors_are_not_retried(ws):
    c = Client(Config(url=ws.url, project_id=PROJECT, token="pt_" + "x" * 43), sleep=lambda s: None)
    with pytest.raises(PaperTrailError) as e:
        c.create_run({"name": "x"})
    assert e.value.status == 401 and not e.value.transient
    assert len(ws.requests) == 1


def test_unreachable_server_journals_then_sync_delivers(ws, tmp_path):
    dead = Client(Config(url="http://127.0.0.1:9", project_id=PROJECT, token=TOKEN, retries=1), sleep=lambda s: None)
    with Experiment(name="offline", group="g", client=dead, quiet=True) as exp:
        exp.log_metric("acc", 0.8)
    pending = os.listdir(".papertrail/pending")
    assert len(pending) == 1
    sent, kept, _ = client(ws).sync()
    assert (sent, kept) == (1, 0) and os.listdir(".papertrail/pending") == []
    run = ws.only_run()
    assert run["status"] == "completed" and run["metrics"][0]["value"] == 0.8
    # Replaying again is harmless: the run already exists and is closed.
    with open(tmp_path / "again.json", "w") as f:
        json.dump({"run": run, "metrics": [], "artifacts": [], "outcome": {"status": "completed"}}, f)


def test_not_configured_records_offline(ws):
    with Experiment(name="x", client=Client(Config()), quiet=True) as exp:
        exp.log_metric("acc", 1)
    assert len(os.listdir(".papertrail/pending")) == 1 and ws.runs == {}


def test_non_finite_metric_and_large_artifact_are_rejected(ws, tmp_path):
    big = tmp_path / "big.bin"
    big.write_bytes(b"0" * (2 * 1024 * 1024 + 1))
    with Experiment(name="x", client=client(ws), quiet=True) as exp:
        with pytest.raises(ValueError):
            exp.log_metric("acc", float("nan"))
        with pytest.raises(ValueError):
            exp.log_artifact(str(big))
    assert ws.only_run()["metrics"] == []


SCRIPT = "print('epoch 1 accuracy= 0.5'); print('Test set results: cost= 1.00715 accuracy= 0.81600')"


def cli(ws, *extra, script=SCRIPT):
    return main(["run", "--url", ws.url, "--project", PROJECT, "--token", TOKEN, "--group", "cora", "--seed", "7", "--param", "epochs=200", "--no-packages"]
                + list(extra) + ["--", sys.executable, "-c", script])


def test_cli_run_records_and_passes_output_through(ws, capfd):
    code = cli(ws, "--metric", r"test_accuracy=Test set results: .*accuracy= ([0-9.]+)", "--metric", r"test_cost=cost= ([0-9.]+)")
    assert code == 0 and "Test set results" in capfd.readouterr().out
    run = ws.only_run()
    assert run["status"] == "completed" and run["seed"] == 7 and run["parameters"] == {"epochs": 200}
    assert {m["name"]: m["value"] for m in run["metrics"]} == {"test_accuracy": 0.816, "test_cost": 1.00715}
    assert run["command"].startswith(sys.executable)


def test_cli_failing_command_is_failed_and_exit_code_passed_on(ws):
    assert cli(ws, script="import sys; print('boom'); sys.exit(3)") == 3
    run = ws.only_run()
    assert run["status"] == "failed" and "status 3" in run["outcome"]["failure_summary"] and "boom" in run["outcome"]["failure_summary"]


def test_cli_missing_metric_is_failed(ws):
    assert cli(ws, "--metric", r"f1=f1= ([0-9.]+)") == 0
    run = ws.only_run()
    assert run["status"] == "failed" and "f1" in run["outcome"]["failure_summary"]


def test_last_match_wins():
    assert extract_metrics("acc= 0.1\nacc= 0.9\n", {"acc": r"acc= ([0-9.]+)", "f1": r"f1= ([0-9.]+)"}) == ({"acc": 0.9}, ["f1"])


def test_redaction():
    t = redact("Bearer abcdefghijklmnop123 password=hunter2hunter https://me:secret@host pt_" + "z" * 43)
    assert "hunter2" not in t and "secret@" not in t and "abcdefghijklmnop123" not in t and "zzzz" not in t


def test_git_state_reports_commit_and_dirtiness(tmp_path):
    def git(*args):
        subprocess.run(["git"] + list(args), cwd=str(tmp_path), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    git("init", "-q"); git("config", "user.email", "t@example.org"); git("config", "user.name", "t"); git("config", "commit.gpgsign", "false")
    (tmp_path / "a.txt").write_text("1")
    git("add", "a.txt"); git("commit", "-q", "-m", "first")
    state = capture.git_state(str(tmp_path))
    assert len(state["commit"]) == 40 and state["dirty"] is False
    (tmp_path / "a.txt").write_text("2")
    assert capture.git_state(str(tmp_path))["dirty"] is True


def test_commit_read_from_files_without_git(tmp_path, monkeypatch):
    g = tmp_path / ".git"
    (g / "refs" / "heads").mkdir(parents=True)
    (g / "HEAD").write_text("ref: refs/heads/main\n")
    (g / "refs" / "heads" / "main").write_text("a" * 40 + "\n")
    monkeypatch.setattr(capture, "_git", lambda args, cwd: None)
    assert capture.git_state(str(tmp_path))["commit"] == "a" * 40


def test_environment_has_no_identifying_fields():
    env = capture.environment(packages=False)
    assert set(env) == {"python", "os", "platform", "hardware", "packages"}
    assert not {"hostname", "user", "home"} & set(env["hardware"])
