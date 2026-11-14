"""Describe the machine, interpreter, packages and code version of the current run.

Nothing here reads environment variables, user names or host names: a run record is
meant to be shared.
"""
import hashlib
import os
import platform
import subprocess
import sys


def _git(args, cwd):
    try:
        out = subprocess.run(["git"] + args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             universal_newlines=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() if out.returncode == 0 else None


def _commit_from_files(cwd):
    """Read the checked-out commit straight from .git, for machines without git installed."""
    path = os.path.abspath(cwd)
    while True:
        git_dir = os.path.join(path, ".git")
        if os.path.isdir(git_dir):
            break
        parent = os.path.dirname(path)
        if parent == path:
            return None
        path = parent
    try:
        with open(os.path.join(git_dir, "HEAD")) as f:
            head = f.read().strip()
        if not head.startswith("ref: "):
            return head or None
        ref = head[5:]
        ref_file = os.path.join(git_dir, *ref.split("/"))
        if os.path.exists(ref_file):
            with open(ref_file) as f:
                return f.read().strip() or None
        with open(os.path.join(git_dir, "packed-refs")) as f:
            for line in f:
                parts = line.split()
                if len(parts) == 2 and parts[1] == ref:
                    return parts[0]
    except OSError:
        pass
    return None


def git_state(cwd=None):
    cwd = cwd or os.getcwd()
    commit = _git(["rev-parse", "HEAD"], cwd)
    if commit is None:
        commit = _commit_from_files(cwd)
        if commit is None:
            return {}
        # Without git we cannot tell whether the working tree was modified.
        return {"commit": commit, "dirty": None, "changed_files": None, "branch": None, "remote": None,
                "note": "git was not available; commit read from .git, working-tree state unknown"}
    status = _git(["status", "--porcelain"], cwd)
    remote = _git(["config", "--get", "remote.origin.url"], cwd)
    if remote and "@" in remote and "://" in remote:
        # Drop credentials embedded in an https remote.
        scheme, rest = remote.split("://", 1)
        remote = scheme + "://" + rest.split("@", 1)[-1]
    return {
        "commit": commit,
        "dirty": bool(status),
        "changed_files": len(status.splitlines()) if status else 0,
        "branch": _git(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
        "remote": remote,
    }


def installed_packages():
    try:
        from importlib import metadata  # Python 3.8+
    except ImportError:
        try:
            import pkg_resources
        except ImportError:
            return {}
        return {d.project_name: d.version for d in pkg_resources.working_set}
    packages = {}
    for dist in metadata.distributions():
        name = dist.metadata["Name"] if dist.metadata else None
        if name:
            packages[name] = dist.version
    return packages


def _cpu_model():
    try:
        with open("/proc/cpuinfo") as f:
            for line in f:
                if line.lower().startswith("model name"):
                    return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.processor() or None


def _gpus():
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             universal_newlines=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return []
    return [line.strip() for line in out.stdout.splitlines() if line.strip()] if out.returncode == 0 else []


def environment():
    return {
        "python": platform.python_version(),
        "python_implementation": platform.python_implementation(),
        "platform": platform.platform(),
        "os": platform.system(),
        "machine": platform.machine(),
        "cpu_model": _cpu_model(),
        "cpu_count": os.cpu_count(),
        "gpus": _gpus(),
        "packages": installed_packages(),
        "executable_in_virtualenv": sys.prefix != getattr(sys, "base_prefix", sys.prefix),
    }


def file_fingerprint(path):
    """Size and SHA-256 of a file. The file itself stays on this machine."""
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return {"path": str(path), "bytes": os.path.getsize(path), "sha256": digest.hexdigest()}
