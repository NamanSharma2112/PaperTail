from sqlalchemy import inspect, text

PLANETOID = {"relation": "split from", "title": "Revisiting Semi-Supervised Learning with Graph Embeddings",
             "arxiv_id": "1603.08861", "year": 2016}


def make_project(client, title, arxiv_id, code_url):
    r = client.post("/api/projects", json={"paper": {"title": title, "arxiv_id": arxiv_id, "authors": ["A"]},
                                           "code_url": code_url})
    body = r.json()
    return body["slug"], {"Authorization": "Bearer " + body["token"]}


def test_datasets_claims_references_and_graph(client):
    a, auth_a = make_project(client, "Paper A", "1111.11111", "https://github.com/x/a")
    b, auth_b = make_project(client, "Paper B", "2222.22222", "https://github.com/x/b")

    # Both projects use Cora; names are matched case-insensitively.
    assert client.put("/api/projects/%s/datasets" % a, headers=auth_a,
                      json={"key": "cora", "name": "Cora", "sources": [PLANETOID]}).status_code == 200
    assert client.put("/api/projects/%s/datasets" % b, headers=auth_b,
                      json={"key": "c", "name": "cora", "status": "partial"}).status_code == 200
    client.put("/api/projects/%s/datasets" % a, headers=auth_a,
               json={"key": "nell", "name": "NELL", "status": "unavailable"})
    client.post("/api/projects/%s/claims" % a, headers=auth_a,
                json={"key": "t2", "label": "Table 2 Cora", "metric": "acc", "reported_value": 81.5,
                      "dataset_key": "cora"})

    # Paper A cites Paper B (by arXiv ID) and the Planetoid paper (by DOI form of the same arXiv ID).
    r = client.post("/api/projects/%s/references" % a, headers=auth_a, json={"source": "openalex", "references": [
        {"title": "Paper B, as OpenAlex spells it", "arxiv_id": "2222.22222", "cited_by_count": 5},
        {"title": "Revisiting semi-supervised learning with graph embeddings", "doi": "10.48550/arxiv.1603.08861",
         "cited_by_count": 1437},
    ]})
    assert r.json() == {"references": 2}
    assert len(client.get("/api/projects/%s/references" % a).json()) == 2

    g = client.get("/api/graph").json()
    nodes = {n["id"]: n for n in g["nodes"]}
    edges = {(e["source"], e["target"], e["relation"]) for e in g["edges"]}

    cora = [n for n in g["nodes"] if n["type"] == "dataset" and n["label"].lower() == "cora"]
    assert len(cora) == 1 and cora[0]["projects"] == sorted([a, b])
    assert ("paper:1111.11111", "paper:2222.22222", "cites") in edges
    assert nodes["paper:2222.22222"]["reproduced"] is True
    # The Planetoid paper appears once although it arrived as a dataset source and as a citation.
    planetoid = [n for n in g["nodes"] if n["type"] == "paper" and "Revisiting" in n["label"]]
    assert len(planetoid) == 1
    assert planetoid[0]["cited_by_count"] == 1437
    assert (cora[0]["id"], planetoid[0]["id"], "split from") in edges
    assert ("claim:%s:t2" % a, cora[0]["id"], "measured on") in edges
    assert ("code:https://github.com/x/a", "paper:1111.11111", "implements") in edges
    assert g["counts"]["reproduced_paper"] == 2 and g["counts"]["dataset"] == 2

    # Deleting a dataset unlinks the claims measured on it.
    assert client.delete("/api/projects/%s/datasets/cora" % a, headers=auth_a).status_code == 204
    claim = client.get("/api/projects/%s" % a).json()["claims"][0]
    assert claim["dataset_key"] is None


def test_dataset_and_reference_writes_need_the_token(client):
    a, _ = make_project(client, "Paper A", "1111.11111", None)
    assert client.put("/api/projects/%s/datasets" % a, json={"key": "x", "name": "X"}).status_code == 401
    assert client.post("/api/projects/%s/references" % a, json={"references": []}).status_code == 401


def test_report_lists_datasets(client):
    a, auth = make_project(client, "Paper A", "1111.11111", None)
    client.put("/api/projects/%s/datasets" % a, headers=auth,
               json={"key": "cora", "name": "Cora", "sources": [PLANETOID], "note": "8 | files"})
    text_ = client.get("/api/projects/%s/report.md" % a).text
    assert "## Datasets" in text_ and "split from Revisiting" in text_ and "8 \\| files" in text_


def test_old_database_gets_new_column(client):
    from papertrail_api.db import engine
    import importlib
    import papertrail_api.main as main
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE claims"))
        conn.execute(text("CREATE TABLE claims (id INTEGER PRIMARY KEY, project_id INTEGER, key VARCHAR(80))"))
    importlib.reload(main)
    cols = {c["name"] for c in inspect(engine).get_columns("claims")}
    assert "dataset_key" in cols
