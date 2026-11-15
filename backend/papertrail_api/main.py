"""PaperTrail HTTP API.

Reading is open. Every change to a project needs that project's token, which is
returned once when the project is created and stored only as a hash. Research code is
never executed here: runs arrive as records from the researcher's machine.
"""
import hashlib
import hmac
import logging
import os
import re
import secrets
import time
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from . import graph, paper_import, report, schemas
from .comparison import compare_claim
from .db import Base, engine, get_session
from .models import Claim, Dataset, Deviation, Paper, PaperReference, Project, Run, RunSet

log = logging.getLogger("papertrail")
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(message)s")

app = FastAPI(title="PaperTrail API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("PAPERTRAIL_WEB_ORIGINS", "http://localhost:3000").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
def _wait_for_database(timeout: float = 90.0) -> None:
    """Wait until the database accepts connections, so a slow-starting PostgreSQL
    (for example on first run in Docker) delays the API instead of crashing it."""
    deadline = time.monotonic() + timeout
    attempt = 0
    while True:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            if attempt:
                log.warning("database is ready")
            return
        except OperationalError as exc:
            attempt += 1
            if time.monotonic() > deadline:
                raise
            if attempt == 1 or attempt % 10 == 0:
                log.warning("waiting for the database: %s", str(exc).splitlines()[0])
            time.sleep(1)


# Tables are created on start-up. Until proper migrations exist, columns added to an
# existing table are added here so older databases keep working.
_wait_for_database()
Base.metadata.create_all(engine)
_ADDED_COLUMNS = {"claims": {"dataset_key": "VARCHAR(80)"}}
with engine.begin() as _conn:
    _inspector = inspect(_conn)
    for _table, _columns in _ADDED_COLUMNS.items():
        _have = {c["name"] for c in _inspector.get_columns(_table)}
        for _name, _type in _columns.items():
            if _name not in _have:
                _conn.execute(text("ALTER TABLE %s ADD COLUMN %s %s" % (_table, _name, _type)))


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60].strip("-")
    return slug or "project"


def get_project(slug: str, session: Session = Depends(get_session)) -> Project:
    project = session.scalar(select(Project).where(Project.slug == slug))
    if project is None:
        raise HTTPException(404, "No project with slug %r" % slug)
    return project


def writable_project(project: Project = Depends(get_project),
                     authorization: Optional[str] = Header(default=None)) -> Project:
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token or not hmac.compare_digest(_hash(token), project.token_hash):
        raise HTTPException(401, "This change needs the project's token (Authorization: Bearer <token>)")
    return project


def _claim_out(claim: Claim) -> dict:
    data = {c.name: getattr(claim, c.name) for c in Claim.__table__.columns if c.name != "project_id"}
    data["comparison"] = compare_claim(claim)
    return data


def _run_set_out(rs: RunSet) -> dict:
    return {"id": rs.id, "key": rs.key, "claim": rs.claim.key if rs.claim else None,
            "description": rs.description, "metric_key": rs.metric_key, "metric_scale": rs.metric_scale,
            "exploratory": rs.exploratory, "runs": len(rs.runs),
            "failed": sum(1 for r in rs.runs if r.status != "completed")}


def _deviation_out(d: Deviation) -> dict:
    return {"id": d.id, "key": d.key, "kind": d.kind, "what": d.what, "why": d.why,
            "expected_effect": d.expected_effect, "applies_to": d.applies_to}


def _dataset_out(d: Dataset) -> dict:
    return {"key": d.key, "name": d.name, "status": d.status, "url": d.url, "version": d.version,
            "note": d.note, "sources": d.sources or []}


def _run_out(run: Run) -> dict:
    data = {c.name: getattr(run, c.name) for c in Run.__table__.columns}
    data["run_set"] = run.run_set.key
    data["created_at"] = run.created_at.isoformat()
    return data


def _project_summary(project: Project) -> dict:
    states = [compare_claim(c)["state"] for c in project.claims]
    return {"slug": project.slug, "title": project.title, "kind": project.kind,
            "paper": schemas.PaperOut.model_validate(project.paper).model_dump(),
            "created_at": project.created_at.isoformat(),
            "claims": len(project.claims),
            "claim_states": {s: states.count(s) for s in sorted(set(states))},
            "verdicts": {v: sum(1 for c in project.claims if c.verdict == v)
                         for v in sorted({c.verdict for c in project.claims if c.verdict})},
            "runs": sum(len(rs.runs) for rs in project.run_sets),
            "deviations": len(project.deviations),
            "datasets": len(project.datasets),
            "references": len(project.paper.references)}


def _project_out(project: Project) -> dict:
    data = _project_summary(project)
    data.update(summary=project.summary, code_url=project.code_url, code_commit=project.code_commit,
                data_note=project.data_note,
                claims=[_claim_out(c) for c in project.claims],
                run_sets=[_run_set_out(rs) for rs in project.run_sets],
                deviations=[_deviation_out(d) for d in project.deviations],
                datasets=[_dataset_out(d) for d in project.datasets],
                datasets_count=len(project.datasets))
    return data


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/papers/lookup")
def lookup_paper(identifier: str):
    try:
        return paper_import.lookup(identifier)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except paper_import.LookupError_ as exc:
        raise HTTPException(502, str(exc))


@app.get("/api/projects")
def list_projects(session: Session = Depends(get_session)):
    projects = session.scalars(select(Project).order_by(Project.created_at.desc())).all()
    return [_project_summary(p) for p in projects]


@app.post("/api/projects", status_code=201)
def create_project(body: schemas.ProjectCreate, session: Session = Depends(get_session)):
    if body.paper is not None:
        meta = body.paper.model_dump()
    elif body.identifier:
        try:
            meta = paper_import.lookup(body.identifier)
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        except paper_import.LookupError_ as exc:
            raise HTTPException(502, str(exc))
    else:
        raise HTTPException(422, "Give an arXiv identifier or DOI, or the paper's details")

    paper = Paper(**meta)
    title = body.title or paper.title
    base = body.slug or _slugify(title)
    slug, n = base, 1
    while session.scalar(select(Project.id).where(Project.slug == slug)) is not None:
        if body.slug:
            raise HTTPException(409, "A project with slug %r already exists" % body.slug)
        n += 1
        slug = "%s-%d" % (base, n)
    token = "pt_" + secrets.token_urlsafe(24)
    project = Project(slug=slug, title=title, paper=paper, kind=body.kind, summary=body.summary,
                      code_url=body.code_url, code_commit=body.code_commit, data_note=body.data_note,
                      token_hash=_hash(token))
    session.add(project)
    session.commit()
    # The only time the token is shown.
    return dict(_project_out(project), token=token)


@app.get("/api/projects/{slug}")
def read_project(project: Project = Depends(get_project)):
    return _project_out(project)


@app.patch("/api/projects/{slug}")
def update_project(body: schemas.ProjectUpdate, project: Project = Depends(writable_project),
                   session: Session = Depends(get_session)):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    session.commit()
    return _project_out(project)


@app.post("/api/projects/{slug}/claims", status_code=201)
def add_claim(body: schemas.ClaimIn, project: Project = Depends(writable_project),
              session: Session = Depends(get_session)):
    if any(c.key == body.key for c in project.claims):
        raise HTTPException(409, "Claim %r already exists in this project" % body.key)
    claim = Claim(project=project, **body.model_dump())
    session.add(claim)
    session.commit()
    return _claim_out(claim)


def _claim(project: Project, key: str) -> Claim:
    for claim in project.claims:
        if claim.key == key:
            return claim
    raise HTTPException(404, "No claim %r in this project" % key)


@app.patch("/api/projects/{slug}/claims/{key}")
def update_claim(key: str, body: schemas.ClaimUpdate, project: Project = Depends(writable_project),
                 session: Session = Depends(get_session)):
    claim = _claim(project, key)
    changes = body.model_dump(exclude_unset=True)
    for field in ("label", "metric", "reported_value", "provenance"):
        if field in changes and changes[field] is None:
            raise HTTPException(422, "%s cannot be empty" % field)
    for field, value in changes.items():
        setattr(claim, field, value)
    session.commit()
    return _claim_out(claim)


@app.delete("/api/projects/{slug}/claims/{key}", status_code=204)
def delete_claim(key: str, project: Project = Depends(writable_project),
                 session: Session = Depends(get_session)):
    claim = _claim(project, key)
    for rs in claim.run_sets:
        rs.claim = None
    session.delete(claim)
    session.commit()
    return Response(status_code=204)


def _upsert_run_set(session: Session, project: Project, body: schemas.RunSetIn, partial: bool) -> RunSet:
    rs = next((r for r in project.run_sets if r.key == body.key), None)
    fields = body.model_dump(exclude_unset=partial, exclude={"key", "claim"})
    if rs is None:
        rs = RunSet(project=project, key=body.key)
        session.add(rs)
    for field, value in fields.items():
        setattr(rs, field, value)
    if "claim" in body.model_fields_set or not partial:
        rs.claim = _claim(project, body.claim) if body.claim else None
    return rs


@app.put("/api/projects/{slug}/run-sets")
def put_run_set(body: schemas.RunSetIn, project: Project = Depends(writable_project),
                session: Session = Depends(get_session)):
    """Create a run set or change which claim and metric it is compared on."""
    rs = _upsert_run_set(session, project, body, partial=True)
    session.commit()
    return _run_set_out(rs)


@app.get("/api/projects/{slug}/run-sets/{key}/runs")
def list_runs(key: str, project: Project = Depends(get_project)):
    rs = next((r for r in project.run_sets if r.key == key), None)
    if rs is None:
        raise HTTPException(404, "No run set %r in this project" % key)
    return [_run_out(run) for run in rs.runs]


def _add_run(session: Session, project: Project, body: schemas.RunIn) -> Run:
    rs = next((r for r in project.run_sets if r.key == body.run_set), None)
    if rs is None:
        # The CLI can record into a run set before anyone has described it in the UI.
        rs = RunSet(project=project, key=body.run_set)
        session.add(rs)
    run = Run(run_set=rs, **body.model_dump(exclude={"run_set"}))
    session.add(run)
    return run


@app.post("/api/projects/{slug}/runs", status_code=201)
def add_run(body: schemas.RunIn, project: Project = Depends(writable_project),
            session: Session = Depends(get_session)):
    run = _add_run(session, project, body)
    session.commit()
    return {"id": run.id, "run_set": run.run_set.key}


@app.post("/api/projects/{slug}/runs/batch", status_code=201)
def add_runs(body: schemas.RunBatchIn, project: Project = Depends(writable_project),
             session: Session = Depends(get_session)):
    runs = [_add_run(session, project, item) for item in body.runs]
    session.commit()
    return {"created": len(runs)}


@app.post("/api/projects/{slug}/deviations", status_code=201)
def add_deviation(body: schemas.DeviationIn, project: Project = Depends(writable_project),
                  session: Session = Depends(get_session)):
    key = body.key
    if key is None:
        used = {d.key for d in project.deviations}
        n = len(used) + 1
        while "D%d" % n in used:
            n += 1
        key = "D%d" % n
    elif any(d.key == key for d in project.deviations):
        raise HTTPException(409, "Deviation %r already exists in this project" % key)
    deviation = Deviation(project=project, **body.model_dump(exclude={"key"}), key=key)
    session.add(deviation)
    session.commit()
    return _deviation_out(deviation)


@app.delete("/api/projects/{slug}/deviations/{key}", status_code=204)
def delete_deviation(key: str, project: Project = Depends(writable_project),
                     session: Session = Depends(get_session)):
    deviation = next((d for d in project.deviations if d.key == key), None)
    if deviation is None:
        raise HTTPException(404, "No deviation %r in this project" % key)
    session.delete(deviation)
    session.commit()
    return Response(status_code=204)


@app.put("/api/projects/{slug}/datasets")
def put_dataset(body: schemas.DatasetIn, project: Project = Depends(writable_project),
                session: Session = Depends(get_session)):
    """Create or replace a dataset record, by key."""
    ds = next((d for d in project.datasets if d.key == body.key), None)
    if ds is None:
        ds = Dataset(project=project, key=body.key)
        session.add(ds)
    for field, value in body.model_dump().items():
        setattr(ds, field, value)
    session.commit()
    return _dataset_out(ds)


@app.delete("/api/projects/{slug}/datasets/{key}", status_code=204)
def delete_dataset(key: str, project: Project = Depends(writable_project),
                   session: Session = Depends(get_session)):
    ds = next((d for d in project.datasets if d.key == key), None)
    if ds is None:
        raise HTTPException(404, "No dataset %r in this project" % key)
    for claim in project.claims:
        if claim.dataset_key == key:
            claim.dataset_key = None
    session.delete(ds)
    session.commit()
    return Response(status_code=204)


@app.post("/api/projects/{slug}/references", status_code=201)
def put_references(body: schemas.ReferenceBatchIn, project: Project = Depends(writable_project),
                   session: Session = Depends(get_session)):
    """Store the works the project's paper cites. replace=true swaps out the existing list."""
    paper = project.paper
    if body.replace:
        paper.references.clear()
    for ref in body.references:
        paper.references.append(PaperReference(source=body.source, **ref.model_dump()))
    session.commit()
    return {"references": len(paper.references)}


@app.get("/api/projects/{slug}/references")
def list_references(project: Project = Depends(get_project)):
    return [{c.name: getattr(r, c.name) for c in PaperReference.__table__.columns if c.name != "paper_id"}
            for r in project.paper.references]


@app.get("/api/graph")
def workspace_graph(session: Session = Depends(get_session)):
    return graph.build(list(session.scalars(select(Project).order_by(Project.id)).all()))


@app.get("/api/projects/{slug}/report.md")
def project_report(project: Project = Depends(get_project)):
    return Response(report.render(project), media_type="text/markdown; charset=utf-8")
