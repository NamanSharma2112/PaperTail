"""The workspace as a graph: papers, the claims they make, the datasets those claims are
measured on, the code that implements them, and the papers they cite or draw data from.

Nodes that describe the same thing are merged across projects (a dataset by name, a
paper by arXiv ID, DOI or title, code by URL), which is what makes shared datasets and
shared citations visible.
"""
import re
from typing import Optional

from .comparison import compare_claim
from .models import Project


def _norm_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


class _Graph:
    def __init__(self):
        self.nodes: dict[str, dict] = {}
        self.edges: dict[tuple, dict] = {}
        self._paper_alias: dict[str, str] = {}

    def paper(self, title: str, arxiv_id: Optional[str] = None, doi: Optional[str] = None,
              **attrs) -> str:
        aliases = [a for a in (
            "arxiv:" + arxiv_id.lower() if arxiv_id else None,
            "doi:" + doi.lower() if doi else None,
            "title:" + _norm_title(title) if title else None) if a]
        node_id = next((self._paper_alias[a] for a in aliases if a in self._paper_alias), None)
        if node_id is None:
            node_id = "paper:" + aliases[0].split(":", 1)[1]
            self.nodes[node_id] = {"id": node_id, "type": "paper", "label": title, "reproduced": False,
                                   "arxiv_id": arxiv_id, "doi": doi, "year": None,
                                   "cited_by_count": None, "projects": [], "authors": []}
        for a in aliases:
            self._paper_alias.setdefault(a, node_id)
        node = self.nodes[node_id]
        for k, v in attrs.items():
            if v in (None, [], ""):
                continue
            if k == "projects":
                node["projects"] = sorted(set(node["projects"]) | set(v))
            elif k == "reproduced":
                node["reproduced"] = node["reproduced"] or v
            elif node.get(k) in (None, [], ""):
                node[k] = v
        node["arxiv_id"] = node["arxiv_id"] or arxiv_id
        node["doi"] = node["doi"] or doi
        return node_id

    def node(self, node_id: str, **attrs) -> str:
        if node_id not in self.nodes:
            self.nodes[node_id] = {"id": node_id, **attrs}
        else:
            for k, v in attrs.items():
                if k == "projects":
                    self.nodes[node_id]["projects"] = sorted(set(self.nodes[node_id].get("projects", [])) | set(v))
                elif self.nodes[node_id].get(k) in (None, ""):
                    self.nodes[node_id][k] = v
        return node_id

    def edge(self, source: str, target: str, relation: str):
        self.edges.setdefault((source, target, relation), {"source": source, "target": target, "relation": relation})


def build(projects: list[Project]) -> dict:
    g = _Graph()
    for project in projects:
        paper = project.paper
        paper_id = g.paper(paper.title, paper.arxiv_id, paper.doi, reproduced=True, projects=[project.slug],
                           year=int(paper.published[:4]) if paper.published and paper.published[:4].isdigit() else None,
                           authors=paper.authors, url=paper.url)

        if project.code_url:
            code_id = g.node("code:" + project.code_url.rstrip("/").lower(), type="code",
                             label=re.sub(r"^https?://(www\.)?(github\.com/)?", "", project.code_url).rstrip("/"),
                             url=project.code_url, commit=project.code_commit, projects=[project.slug])
            g.edge(code_id, paper_id, "implements")

        dataset_ids = {}
        for ds in project.datasets:
            ds_id = g.node("dataset:" + _norm_title(ds.name), type="dataset", label=ds.name, status=ds.status,
                           url=ds.url, note=ds.note, projects=[project.slug])
            dataset_ids[ds.key] = ds_id
            for src in ds.sources or []:
                src_id = g.paper(src.get("title", ""), src.get("arxiv_id"), src.get("doi"), year=src.get("year"))
                g.edge(ds_id, src_id, src.get("relation") or "from")

        for claim in project.claims:
            cmp_ = compare_claim(claim)
            main = [rs for rs in cmp_["run_sets"] if not rs["exploratory"] and rs["summary"]]
            claim_id = g.node("claim:%s:%s" % (project.slug, claim.key), type="claim", label=claim.label,
                              project=project.slug, verdict=claim.verdict, state=cmp_["state"],
                              reported=claim.reported_value, unit=claim.unit, metric=claim.metric,
                              reproduced_value=main[0]["summary"]["mean"] if main else None,
                              runs=sum(rs["n"] for rs in cmp_["run_sets"]), projects=[project.slug])
            g.edge(paper_id, claim_id, "reports")
            if claim.dataset_key and claim.dataset_key in dataset_ids:
                g.edge(claim_id, dataset_ids[claim.dataset_key], "measured on")

        for ref in paper.references:
            ref_id = g.paper(ref.title, ref.arxiv_id, ref.doi, year=ref.year, cited_by_count=ref.cited_by_count,
                             authors=ref.authors)
            if ref_id != paper_id:
                g.edge(paper_id, ref_id, "cites")

    degree: dict[str, int] = {}
    for e in g.edges.values():
        degree[e["source"]] = degree.get(e["source"], 0) + 1
        degree[e["target"]] = degree.get(e["target"], 0) + 1
    nodes = [dict(n, degree=degree.get(n["id"], 0)) for n in g.nodes.values()]
    counts: dict[str, int] = {}
    for n in nodes:
        kind = "reproduced_paper" if n["type"] == "paper" and n.get("reproduced") else n["type"]
        counts[kind] = counts.get(kind, 0) + 1
    return {"nodes": nodes, "edges": list(g.edges.values()), "counts": counts}
