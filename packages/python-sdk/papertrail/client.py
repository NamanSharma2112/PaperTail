"""HTTP client for PaperTrail's SDK ingestion API, with retries and an offline journal."""
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

MAX_ARTIFACT_BYTES = 2 * 1024 * 1024
USER_AGENT = "papertrail-python/0.2.0"

ARTIFACT_TYPES = {
    ".csv": "text/csv", ".json": "application/json", ".txt": "text/plain", ".log": "text/plain", ".md": "text/markdown",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".pdf": "application/pdf",
    ".yaml": "application/x-yaml", ".yml": "application/x-yaml",
}


class PaperTrailError(Exception):
    """A request the server refused (permanent) or could not complete (transient)."""

    def __init__(self, message, status=None, code=None, transient=False):
        Exception.__init__(self, message)
        self.status = status
        self.code = code
        self.transient = transient


class Config(object):
    """Where records go. Explicit arguments win over the PAPERTRAIL_* environment variables."""

    def __init__(self, url=None, project_id=None, token=None, spool_dir=None, timeout=30.0, retries=4):
        self.url = (url or os.environ.get("PAPERTRAIL_URL") or "").rstrip("/")
        self.project_id = project_id or os.environ.get("PAPERTRAIL_PROJECT")
        self.token = token or os.environ.get("PAPERTRAIL_TOKEN")
        self.spool_dir = spool_dir or os.environ.get("PAPERTRAIL_SPOOL") or os.path.join(".papertrail", "pending")
        self.timeout = timeout
        self.retries = retries

    @property
    def complete(self):
        return bool(self.url and self.project_id and self.token)

    def missing(self):
        return [n for n, v in (("PAPERTRAIL_URL", self.url), ("PAPERTRAIL_PROJECT", self.project_id), ("PAPERTRAIL_TOKEN", self.token)) if not v]


def _insecure(url):
    host = urllib.parse.urlparse(url).hostname or ""
    return url.startswith("http://") and host not in ("localhost", "127.0.0.1", "::1")


class Client(object):
    def __init__(self, config=None, sleep=time.sleep):
        self.config = config or Config()
        self._sleep = sleep
        self._warned = False

    # ---------- transport ----------

    def _request(self, method, path, body=None, raw=None, headers=None):
        cfg = self.config
        if not cfg.complete:
            raise PaperTrailError("Not configured; set " + ", ".join(cfg.missing()))
        if _insecure(cfg.url) and not self._warned:
            sys.stderr.write("papertrail: warning: %s is not HTTPS; the token is sent in clear text\n" % cfg.url)
            self._warned = True
        data = raw if raw is not None else (json.dumps(body).encode("utf-8") if body is not None else None)
        h = {"Authorization": "Bearer " + cfg.token, "User-Agent": USER_AGENT, "Accept": "application/json"}
        if raw is None and body is not None:
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        last = None
        for attempt in range(cfg.retries + 1):
            req = urllib.request.Request(cfg.url + path, data=data, headers=h, method=method)
            try:
                with urllib.request.urlopen(req, timeout=cfg.timeout) as resp:
                    text = resp.read().decode("utf-8")
                    return json.loads(text) if text else {}
            except urllib.error.HTTPError as exc:
                payload = {}
                try:
                    payload = json.loads(exc.read().decode("utf-8", "replace") or "{}")
                except ValueError:
                    pass
                err = payload.get("error") or {}
                message = err.get("message") or "server answered %d" % exc.code
                if err.get("details"):
                    message += ": " + "; ".join("%s %s" % (d.get("path"), d.get("message")) for d in err["details"][:5])
                transient = exc.code == 429 or exc.code >= 500
                last = PaperTrailError(message, status=exc.code, code=err.get("code"), transient=transient)
                if not transient:
                    raise last
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                delay = float(retry_after) if retry_after and retry_after.isdigit() else None
            except (urllib.error.URLError, OSError, ValueError) as exc:
                last = PaperTrailError("could not reach %s: %s" % (cfg.url, getattr(exc, "reason", exc)), transient=True)
                delay = None
            if attempt < cfg.retries:
                self._sleep(delay if delay is not None else min(30.0, 0.5 * 2 ** attempt) * (0.75 + random.random() / 2))
        raise last

    # ---------- API ----------

    def create_run(self, payload):
        body = dict(payload)
        body["project_id"] = self.config.project_id
        body.setdefault("idempotency_key", uuid.uuid4().hex)
        return self._request("POST", "/api/v1/sdk/runs", body)["run"]

    def log_metrics(self, run_id, metrics):
        for i in range(0, len(metrics), 1000):
            self._request("POST", "/api/v1/sdk/runs/%s/metrics" % run_id, {"metrics": metrics[i:i + 1000]})

    def upload_artifact(self, run_id, path, name=None):
        size = os.path.getsize(path)
        if size > MAX_ARTIFACT_BYTES:
            raise PaperTrailError("%s is %d bytes; artifacts are limited to 2 MB" % (path, size))
        name = name or os.path.basename(path)
        ctype = ARTIFACT_TYPES.get(os.path.splitext(name)[1].lower(), "application/octet-stream")
        with open(path, "rb") as f:
            content = f.read()
        return self._request("POST", "/api/v1/sdk/runs/%s/artifacts" % run_id, raw=content,
                             headers={"Content-Type": ctype, "X-File-Name": urllib.parse.quote(name)})["artifact"]

    def complete_run(self, run_id, completed_at=None, duration_seconds=None, parameters=None, dataset_version=None):
        return self._request("POST", "/api/v1/sdk/runs/%s/complete" % run_id, {
            "completed_at": completed_at, "duration_seconds": duration_seconds, "parameters": parameters or None, "dataset_version": dataset_version})["run"]

    def fail_run(self, run_id, failure_summary, completed_at=None, duration_seconds=None, status="failed", parameters=None, dataset_version=None):
        return self._request("POST", "/api/v1/sdk/runs/%s/fail" % run_id, {
            "failure_summary": failure_summary[:8000] or "failed", "completed_at": completed_at, "duration_seconds": duration_seconds,
            "status": status, "parameters": parameters or None, "dataset_version": dataset_version})["run"]

    # ---------- offline journal ----------

    def spool(self, record):
        """Save a whole run (creation, metrics, artifacts, outcome) to replay later."""
        os.makedirs(self.config.spool_dir, exist_ok=True)
        path = os.path.join(self.config.spool_dir, "%d-%s.json" % (int(time.time()), uuid.uuid4().hex[:8]))
        with open(path, "w") as f:
            json.dump(record, f)
        return path

    def replay(self, record):
        """Send a journaled run. Safe to repeat: run creation is idempotent."""
        run = self.create_run(record["run"])
        if run.get("status") != "running":
            return run  # already delivered in full on an earlier attempt
        if record.get("metrics"):
            self.log_metrics(run["id"], record["metrics"])
        for a in record.get("artifacts", []):
            if os.path.exists(a["path"]):
                self.upload_artifact(run["id"], a["path"], a.get("name"))
        outcome = record.get("outcome") or {"status": "failed", "failure_summary": "the run did not report an outcome"}
        if outcome["status"] == "completed":
            return self.complete_run(run["id"], outcome.get("completed_at"), outcome.get("duration_seconds"))
        return self.fail_run(run["id"], outcome.get("failure_summary") or outcome["status"], outcome.get("completed_at"), outcome.get("duration_seconds"), outcome["status"])

    def sync(self):
        """Replay every journaled run. Returns (sent, kept, messages)."""
        sent, kept, messages = 0, 0, []
        d = self.config.spool_dir
        if not os.path.isdir(d):
            return sent, kept, messages
        for name in sorted(os.listdir(d)):
            if not name.endswith(".json"):
                continue
            path = os.path.join(d, name)
            with open(path) as f:
                record = json.load(f)
            try:
                self.replay(record)
            except PaperTrailError as exc:
                kept += 1
                messages.append("%s: %s" % (name, exc))
                continue
            os.remove(path)
            sent += 1
        return sent, kept, messages
