from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Paper(Base):
    __tablename__ = "papers"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    authors: Mapped[list] = mapped_column(JSON, default=list)
    abstract: Mapped[Optional[str]] = mapped_column(Text)
    arxiv_id: Mapped[Optional[str]] = mapped_column(String(40), index=True)
    doi: Mapped[Optional[str]] = mapped_column(String(200), index=True)
    venue: Mapped[Optional[str]] = mapped_column(Text)
    published: Mapped[Optional[str]] = mapped_column(String(40))
    url: Mapped[Optional[str]] = mapped_column(Text)
    metadata_source: Mapped[str] = mapped_column(String(20), default="manual")


class Project(Base):
    """One attempt to reproduce one paper."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    title: Mapped[str] = mapped_column(Text)
    paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id"))
    # What is being attempted: re-running the authors' code and data, or something else.
    kind: Mapped[str] = mapped_column(String(40), default="computational_reproduction")
    summary: Mapped[Optional[str]] = mapped_column(Text)
    code_url: Mapped[Optional[str]] = mapped_column(Text)
    code_commit: Mapped[Optional[str]] = mapped_column(String(80))
    data_note: Mapped[Optional[str]] = mapped_column(Text)
    token_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    paper: Mapped[Paper] = relationship()
    claims: Mapped[list["Claim"]] = relationship(back_populates="project", cascade="all, delete-orphan",
                                                 order_by="Claim.id")
    run_sets: Mapped[list["RunSet"]] = relationship(back_populates="project", cascade="all, delete-orphan",
                                                    order_by="RunSet.id")
    deviations: Mapped[list["Deviation"]] = relationship(back_populates="project",
                                                         cascade="all, delete-orphan",
                                                         order_by="Deviation.id")


class Claim(Base):
    """One number the paper reports, with how the paper says it was produced."""

    __tablename__ = "claims"
    __table_args__ = (UniqueConstraint("project_id", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    key: Mapped[str] = mapped_column(String(80))
    label: Mapped[str] = mapped_column(Text)
    metric: Mapped[str] = mapped_column(String(80))
    unit: Mapped[Optional[str]] = mapped_column(String(20))
    reported_value: Mapped[float] = mapped_column(Float)
    # How the paper aggregated: free text as stated, plus the run count when it gives one.
    aggregation: Mapped[Optional[str]] = mapped_column(Text)
    reported_runs: Mapped[Optional[int]] = mapped_column(Integer)
    reported_dispersion: Mapped[Optional[float]] = mapped_column(Float)
    dispersion_kind: Mapped[Optional[str]] = mapped_column(String(40))
    source: Mapped[Optional[str]] = mapped_column(Text)
    # reported: stated by the authors. inferred: the researcher's reading of the paper.
    provenance: Mapped[str] = mapped_column(String(20), default="reported")
    # Set by the researcher, ideally before running: how close counts as a match, and why.
    tolerance: Mapped[Optional[float]] = mapped_column(Float)
    tolerance_reason: Mapped[Optional[str]] = mapped_column(Text)
    # A claim that cannot be attempted (missing data, missing code) is blocked, not failed.
    blocked_reason: Mapped[Optional[str]] = mapped_column(Text)
    # The researcher's conclusion. Never computed.
    verdict: Mapped[Optional[str]] = mapped_column(String(20))
    verdict_note: Mapped[Optional[str]] = mapped_column(Text)

    project: Mapped[Project] = relationship(back_populates="claims")
    run_sets: Mapped[list["RunSet"]] = relationship(back_populates="claim", order_by="RunSet.id")


class RunSet(Base):
    """Runs that share a configuration and differ only by seed."""

    __tablename__ = "run_sets"
    __table_args__ = (UniqueConstraint("project_id", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    claim_id: Mapped[Optional[int]] = mapped_column(ForeignKey("claims.id"))
    key: Mapped[str] = mapped_column(String(80))
    description: Mapped[Optional[str]] = mapped_column(Text)
    # Which logged metric is compared with the claim, and the factor that converts it to
    # the claim's unit (100 when runs log a fraction and the paper reports percent).
    metric_key: Mapped[Optional[str]] = mapped_column(String(80))
    metric_scale: Mapped[float] = mapped_column(Float, default=1.0)
    # Exploratory run sets change something on purpose and are never the headline comparison.
    exploratory: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped[Project] = relationship(back_populates="run_sets")
    claim: Mapped[Optional[Claim]] = relationship(back_populates="run_sets")
    runs: Mapped[list["Run"]] = relationship(back_populates="run_set", cascade="all, delete-orphan",
                                             order_by="Run.id")


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_set_id: Mapped[int] = mapped_column(ForeignKey("run_sets.id"), index=True)
    name: Mapped[Optional[str]] = mapped_column(Text)
    seed: Mapped[Optional[int]] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    exit_code: Mapped[Optional[int]] = mapped_column(Integer)
    command: Mapped[Optional[str]] = mapped_column(Text)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    environment: Mapped[dict] = mapped_column(JSON, default=dict)
    git: Mapped[dict] = mapped_column(JSON, default=dict)
    artifacts: Mapped[list] = mapped_column(JSON, default=list)
    started_at: Mapped[Optional[str]] = mapped_column(String(40))
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float)
    log_tail: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    run_set: Mapped[RunSet] = relationship(back_populates="runs")


class Deviation(Base):
    """Anything done differently from the original, recorded from the first install on."""

    __tablename__ = "deviations"
    __table_args__ = (UniqueConstraint("project_id", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    key: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(20))
    what: Mapped[str] = mapped_column(Text)
    why: Mapped[Optional[str]] = mapped_column(Text)
    expected_effect: Mapped[Optional[str]] = mapped_column(Text)
    applies_to: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    project: Mapped[Project] = relationship(back_populates="deviations")
