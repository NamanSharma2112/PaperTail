"""Send run records to a PaperTrail workspace, or keep them on disk until that works."""
import json
import os
import time
import urllib.error
import urllib.request
import uuid


class Config(object):
    """Where records go. Arguments win over PAPERTRAIL_URL / _PROJECT / _TOKEN."""

    def __init__(self, url=None, project=None, token=None, spool_dir=None):
        self.url = (url or os.environ.get("PAPERTRAIL_URL") or "").rstrip("/")
        self.project = project or os.environ.get("PAPERTRAIL_PROJECT")
        self.token = token or os.environ.get("PAPERTRAIL_TOKEN")
        self.spool_dir = spool_dir or os.environ.get("PAPERTRAIL_SPOOL") or os.path.join(".papertrail", "pending")

    @property
    def complete(self):
        return bool(self.url and self.project and self.token)


class UploadError(Exception):
    def __init__(self, message, permanent=False):
        Exception.__init__(self, message)
        self.permanent = permanent


def post_run(config, record, timeout=30):
    request = urllib.request.Request(
        "%s/api/projects/%s/runs" % (config.url, config.project),
        data=json.dumps(record).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer %s" % config.token},
        method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        # A 4xx will fail the same way next time; anything else is worth retrying later.
        raise UploadError("server answered %d: %s" % (exc.code, detail), permanent=400 <= exc.code < 500)
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise UploadError("could not reach %s: %s" % (config.url, exc))


def spool(config, record):
    os.makedirs(config.spool_dir, exist_ok=True)
    path = os.path.join(config.spool_dir, "%d-%s.json" % (int(time.time()), uuid.uuid4().hex[:8]))
    with open(path, "w") as f:
        json.dump(record, f)
    return path


def deliver(config, record):
    """Upload a record; on failure keep it on disk. Returns (uploaded, message)."""
    if not config.complete:
        path = spool(config, record)
        return False, "No workspace configured (PAPERTRAIL_URL, PAPERTRAIL_PROJECT, PAPERTRAIL_TOKEN); saved to %s" % path
    try:
        result = post_run(config, record)
        return True, "Recorded run %s in run set %s" % (result.get("id"), result.get("run_set"))
    except UploadError as exc:
        path = spool(config, record)
        return False, "Upload failed (%s); saved to %s. Send it later with `papertrail sync`." % (exc, path)


def sync(config):
    """Upload everything in the spool. Returns (sent, kept, messages)."""
    sent, kept, messages = 0, 0, []
    if not os.path.isdir(config.spool_dir):
        return sent, kept, messages
    for name in sorted(os.listdir(config.spool_dir)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(config.spool_dir, name)
        with open(path) as f:
            record = json.load(f)
        try:
            post_run(config, record)
        except UploadError as exc:
            kept += 1
            messages.append("%s: %s" % (name, exc))
            continue
        os.remove(path)
        sent += 1
    return sent, kept, messages
