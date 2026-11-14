import os
import tempfile

# Must be set before papertrail_api.db is imported. Tests run on a throwaway SQLite file
# unless TEST_DATABASE_URL names another database (for example a scratch PostgreSQL).
# Every test drops and recreates all tables, so never point this at real data.
_tmp = tempfile.mkdtemp(prefix="papertrail-test-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or "sqlite:///%s/test.db" % _tmp

import pytest
from fastapi.testclient import TestClient

from papertrail_api.db import Base, engine
from papertrail_api.main import app


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


PAPER = {"title": "A Test Paper", "authors": ["A. Author", "B. Author"], "venue": "TestConf 2020",
         "url": "https://example.org/paper"}


@pytest.fixture()
def project(client):
    r = client.post("/api/projects", json={"paper": PAPER, "code_url": "https://example.org/code",
                                           "code_commit": "abc123"})
    assert r.status_code == 201, r.text
    body = r.json()
    return {"slug": body["slug"], "auth": {"Authorization": "Bearer " + body["token"]}}
