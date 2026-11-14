"""PaperTrail HTTP API.

Reading is open. Every change to a project needs that project's token, which is
returned once when the project is created and stored only as a hash. Research code is
never executed here: runs arrive as records from the researcher's machine.
"""
import hashlib
import hmac
import os
import re
import secrets
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import paper_import, report, schemas
from .comparison import compare_claim
from .db import Base, engine, get_session
from .models import Claim, Deviation, Paper, Project, Run, RunSet

app = FastAPI(title="PaperTrail API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("PAPERTRAIL_WEB_ORIGINS", "http://localhost:3000").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
# Tables are created on start-up for now; migrations come with the first schema change.
Base.metadata.create_all(engine)


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
            "deviations": len(project.deviations)}


def _project_out(project: Project) -> dict:
    data = _project_summary(project)
    data.update(summary=project.summary, code_url=project.code_url, code_commit=project.code_commit,
                data_note=project.data_note,
                claims=[_claim_out(c) for c in project.claims],
                run_sets=[_run_set_out(rs) for rs in project.run_sets],
                deviations=[_deviation_out(d) for d in project.deviations])
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


@app.get("/api/projects/{slug}/report.md")
def project_report(project: Project = Depends(get_project)):
    return Response(report.render(project), media_type="text/markdown; charset=utf-8")
