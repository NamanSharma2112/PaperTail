"""Remove secrets from text before it leaves the machine (failure messages, log tails)."""
import os
import re

_SUBSTITUTIONS = [
    (re.compile(r"pt_[A-Za-z0-9_-]{20,}"), "[redacted]"),                                  # PaperTrail tokens
    (re.compile(r"(?i)\b(bearer)\s+[A-Za-z0-9._~+/=-]{12,}"), r"\1 [redacted]"),
    (re.compile(r"(?i)\b(api[_-]?key|access[_-]?key|token|secret|password|passwd)(\s*[=:]\s*)\S+"), r"\1\2[redacted]"),
    (re.compile(r"://[^/\s:@]+:[^@\s/]+@"), "://[redacted]@"),                             # credentials in URLs
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[redacted]"),                                   # AWS access key ids
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"), "[redacted]"),                         # GitHub tokens
]
_SECRET_ENV_NAME = re.compile(r"(TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE)", re.I)


def redact(text):
    if not text:
        return text
    for name, value in os.environ.items():
        if value and len(value) >= 8 and _SECRET_ENV_NAME.search(name):
            text = text.replace(value, "[redacted]")
    for pattern, replacement in _SUBSTITUTIONS:
        text = pattern.sub(replacement, text)
    return text
