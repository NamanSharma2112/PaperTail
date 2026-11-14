import math

import pytest

from papertrail_api import paper_import

CLAIM = {"key": "t2-cora", "label": "Table 2, Cora", "metric": "test accuracy", "unit": "%",
         "reported_value": 81.5, "aggregation": "mean of 100 runs with random weight initialisations",
         "reported_runs": 100, "source": "Table 2"}


def add_runs(client, project, run_set, values, **extra):
    runs = [dict({"run_set": run_set, "seed": i, "metrics": {"test_accuracy": v}}, **extra)
            for i, v in enumerate(values)]
    r = client.post("/api/projects/%s/runs/batch" % project["slug"], json={"runs": runs},
                    headers=project["auth"])
    assert r.status_code == 201, r.text


def setup_claim(client, project, **claim_extra):
    r = client.post("/api/projects/%s/claims" % project["slug"], json=dict(CLAIM, **claim_extra),
                    headers=project["auth"])
    assert r.status_code == 201, r.text
    r = client.put("/api/projects/%s/run-sets" % project["slug"], headers=project["auth"],
                   json={"key": "cora", "claim": "t2-cora", "metric_key": "test_accuracy",
                         "metric_scale": 100})
    assert r.status_code == 200, r.text


def comparison(client, project, run_set="cora"):
    claim = client.get("/api/projects/%s" % project["slug"]).json()["claims"][0]
    return claim["comparison"], next(r for r in claim["comparison"]["run_sets"] if r["run_set"] == run_set)


def test_token_is_shown_once_and_required_for_changes(client, project):
    slug = project["slug"]
    assert "token" not in client.get("/api/projects/%s" % slug).json()
    assert client.post("/api/projects/%s/claims" % slug, json=CLAIM).status_code == 401
    wrong = {"Authorization": "Bearer pt_wrong"}
    assert client.post("/api/projects/%s/claims" % slug, json=CLAIM, headers=wrong).status_code == 401
    assert client.post("/api/projects/%s/runs" % slug, json={"run_set": "x"}).status_code == 401
    assert client.post("/api/projects/%s/claims" % slug, json=CLAIM, headers=project["auth"]).status_code == 201


def test_one_projects_token_cannot_change_another(client, project):
    other = client.post("/api/projects", json={"paper": {"title": "Other"}}).json()
    r = client.post("/api/projects/%s/claims" % other["slug"], json=CLAIM, headers=project["auth"])
    assert r.status_code == 401


def test_claim_without_runs_is_not_run(client, project):
    setup_claim(client, project)
    overall, rs = comparison(client, project)
    assert overall["state"] == "not_run"
    assert rs["n"] == 0 and rs["summary"] is None


def test_comparison_of_full_run_set(client, project):
    setup_claim(client, project, tolerance=0.5)
    values = [0.81 + 0.0002 * i for i in range(100)]  # fractions; the run set scales to percent
    add_runs(client, project, "cora", values)
    overall, rs = comparison(client, project)
    assert overall["state"] == "complete"
    mean = 100 * sum(values) / 100
    assert rs["n"] == 100
    assert rs["summary"]["mean"] == pytest.approx(mean)
    assert rs["diff"] == pytest.approx(mean - 81.5)
    assert rs["diff_relative_percent"] == pytest.approx(100 * (mean - 81.5) / 81.5)
    sd = rs["summary"]["sd"]
    assert rs["diff_interval"]["se"] == pytest.approx(sd * math.sqrt(2 / 100))
    assert "assumes" in rs["diff_interval"]["assumption"]
    within = sum(abs(100 * v - 81.5) <= 0.5 + 1e-9 for v in values) / 100
    assert rs["share_within_tolerance"] == pytest.approx(within)
    assert [n["code"] for n in rs["notes"]] == []


def test_single_run_against_a_mean_is_flagged(client, project):
    setup_claim(client, project)
    add_runs(client, project, "cora", [0.816])
    overall, rs = comparison(client, project)
    assert overall["state"] == "partial"
    assert rs["summary"]["sd"] is None and rs["diff_interval"] is None
    assert rs["diff"] == pytest.approx(0.1)
    assert "single_run_vs_aggregate" in [n["code"] for n in rs["notes"]]


def test_fewer_runs_than_reported_is_partial(client, project):
    setup_claim(client, project)
    add_runs(client, project, "cora", [0.81, 0.82, 0.815])
    overall, rs = comparison(client, project)
    assert overall["state"] == "partial"
    assert "fewer_runs_than_reported" in [n["code"] for n in rs["notes"]]


def test_failed_runs_are_excluded_and_reported(client, project):
    setup_claim(client, project)
    add_runs(client, project, "cora", [0.81, 0.82])
    add_runs(client, project, "cora", [0.10], status="failed", exit_code=1)
    _, rs = comparison(client, project)
    assert rs["n"] == 2 and rs["runs_failed"] == 1
    assert rs["summary"]["mean"] == pytest.approx(81.5)
    assert "failed_runs" in [n["code"] for n in rs["notes"]]


def test_blocked_claim_and_verdict_are_kept_separate_from_statistics(client, project):
    setup_claim(client, project)
    slug = project["slug"]
    r = client.patch("/api/projects/%s/claims/t2-cora" % slug, headers=project["auth"],
                     json={"blocked_reason": "dataset not available", "verdict": "blocked"})
    assert r.status_code == 200
    body = r.json()
    assert body["comparison"]["state"] == "blocked" and body["verdict"] == "blocked"
    # Clearing the block is an explicit null, not an omitted field.
    r = client.patch("/api/projects/%s/claims/t2-cora" % slug, headers=project["auth"],
                     json={"blocked_reason": None})
    assert r.json()["comparison"]["state"] == "not_run"
    assert r.json()["verdict"] == "blocked"  # untouched: the verdict is the researcher's


def test_exploratory_run_set_does_not_complete_a_claim(client, project):
    setup_claim(client, project)
    client.put("/api/projects/%s/run-sets" % project["slug"], headers=project["auth"],
               json={"key": "variant", "claim": "t2-cora", "metric_key": "test_accuracy",
                     "metric_scale": 100, "exploratory": True})
    add_runs(client, project, "variant", [0.81] * 100)
    overall, _ = comparison(client, project, "variant")
    assert overall["state"] == "not_run"


def test_runs_can_arrive_before_the_run_set_is_described(client, project):
    setup_claim(client, project)
    add_runs(client, project, "new-set", [0.5])
    sets = {rs["key"]: rs for rs in client.get("/api/projects/%s" % project["slug"]).json()["run_sets"]}
    assert sets["new-set"]["runs"] == 1 and sets["new-set"]["claim"] is None
    runs = client.get("/api/projects/%s/run-sets/new-set/runs" % project["slug"]).json()
    assert runs[0]["metrics"] == {"test_accuracy": 0.5}


def test_deviations_get_sequential_keys(client, project):
    slug = project["slug"]
    for kind in ("environment", "code"):
        r = client.post("/api/projects/%s/deviations" % slug, headers=project["auth"],
                        json={"kind": kind, "what": "changed something"})
        assert r.status_code == 201
    keys = [d["key"] for d in client.get("/api/projects/%s" % slug).json()["deviations"]]
    assert keys == ["D1", "D2"]
    assert client.post("/api/projects/%s/deviations" % slug, headers=project["auth"],
                       json={"kind": "other", "what": "x"}).status_code == 422


def test_report_contains_claims_runs_and_deviations(client, project):
    setup_claim(client, project)
    add_runs(client, project, "cora", [0.81, 0.82], environment={"python": "3.7.17", "platform": "Linux"},
             git={"commit": "39a4089fe72ad9f055ed6fdb9746abdcfebc4d81"})
    client.post("/api/projects/%s/deviations" % project["slug"], headers=project["auth"],
                json={"kind": "environment", "what": "numpy 1.18.5 | not 1.15.4", "why": "pins conflict"})
    text = client.get("/api/projects/%s/report.md" % project["slug"]).text
    assert "# Reproduction report: A Test Paper" in text
    assert "| cora | 2 | 81.50 |" in text
    assert "numpy 1.18.5 \\| not 1.15.4" in text
    assert "`39a4089fe72a`" in text
    assert "not yet recorded" in text


def test_identifier_classification():
    c = paper_import.classify
    assert c("1609.02907") == ("arxiv", "1609.02907")
    assert c("arXiv:1609.02907v4") == ("arxiv", "1609.02907")
    assert c("https://arxiv.org/abs/1609.02907") == ("arxiv", "1609.02907")
    assert c("https://arxiv.org/pdf/1609.02907v4.pdf") == ("arxiv", "1609.02907")
    assert c("cs/0112017") == ("arxiv", "cs/0112017")
    assert c("https://doi.org/10.48550/arXiv.1609.02907") == ("arxiv", "1609.02907")
    assert c("https://doi.org/10.1371/journal.pbio.3003726") == ("doi", "10.1371/journal.pbio.3003726")
    with pytest.raises(ValueError):
        c("not a paper")


ATOM = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <title>arXiv Query</title>
  <entry>
    <title>Semi-Supervised Classification with
      Graph Convolutional Networks</title>
    <summary> We present a scalable approach. </summary>
    <published>2016-09-09T19:48:41Z</published>
    <author><name>Thomas N. Kipf</name></author>
    <author><name>Max Welling</name></author>
    <arxiv:comment>Published as a conference paper at ICLR 2017</arxiv:comment>
  </entry>
</feed>"""


def test_arxiv_atom_parsing():
    meta = paper_import.parse_arxiv_atom(ATOM, "1609.02907")
    assert meta["title"] == "Semi-Supervised Classification with Graph Convolutional Networks"
    assert meta["authors"] == ["Thomas N. Kipf", "Max Welling"]
    assert meta["published"] == "2016-09-09"
    assert meta["venue"] == "Published as a conference paper at ICLR 2017"
    assert meta["url"] == "https://arxiv.org/abs/1609.02907"


def test_arxiv_unknown_identifier_is_an_error():
    empty = '<feed xmlns="http://www.w3.org/2005/Atom"><title>arXiv Query</title></feed>'
    with pytest.raises(paper_import.LookupError_):
        paper_import.parse_arxiv_atom(empty, "9999.99999")


def test_openalex_abstract_is_rebuilt_in_order():
    work = {"title": "T", "authorships": [{"author": {"display_name": "A"}}],
            "abstract_inverted_index": {"world": [1], "hello": [0, 2]}, "publication_date": "2020-01-01"}
    meta = paper_import.parse_openalex_work(work, "10.1/x")
    assert meta["abstract"] == "hello world hello"
    assert meta["authors"] == ["A"]


def test_create_project_from_identifier(client, monkeypatch):
    monkeypatch.setattr(paper_import, "lookup",
                        lambda identifier: paper_import.parse_arxiv_atom(ATOM, "1609.02907"))
    r = client.post("/api/projects", json={"identifier": "1609.02907"})
    assert r.status_code == 201
    body = r.json()
    assert body["slug"] == "semi-supervised-classification-with-graph-convolutional-netw"
    assert body["paper"]["arxiv_id"] == "1609.02907"
    assert body["token"].startswith("pt_")
    again = client.post("/api/projects", json={"identifier": "1609.02907"}).json()
    assert again["slug"].endswith("-2")
