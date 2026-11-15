from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Provenance = Literal["reported", "inferred"]
Verdict = Literal["matched", "not_matched", "inconclusive", "blocked"]
DeviationKind = Literal["environment", "code", "data", "protocol"]
ProjectKind = Literal["computational_reproduction", "reimplementation", "replication"]


class PaperIn(BaseModel):
    title: str = Field(min_length=1)
    authors: list[str] = []
    abstract: Optional[str] = None
    arxiv_id: Optional[str] = None
    doi: Optional[str] = None
    venue: Optional[str] = None
    published: Optional[str] = None
    url: Optional[str] = None
    metadata_source: str = "manual"


class PaperOut(PaperIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ProjectCreate(BaseModel):
    """Give either `identifier` (arXiv ID or DOI, looked up) or `paper` (entered by hand)."""

    identifier: Optional[str] = None
    paper: Optional[PaperIn] = None
    title: Optional[str] = None
    slug: Optional[str] = Field(default=None, pattern=r"^[a-z0-9][a-z0-9\-]{1,78}$")
    kind: ProjectKind = "computational_reproduction"
    summary: Optional[str] = None
    code_url: Optional[str] = None
    code_commit: Optional[str] = None
    data_note: Optional[str] = None


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    kind: Optional[ProjectKind] = None
    summary: Optional[str] = None
    code_url: Optional[str] = None
    code_commit: Optional[str] = None
    data_note: Optional[str] = None


class ClaimIn(BaseModel):
    key: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_\-\.]{0,78}$")
    label: str = Field(min_length=1)
    metric: str = Field(min_length=1)
    unit: Optional[str] = None
    reported_value: float
    aggregation: Optional[str] = None
    reported_runs: Optional[int] = Field(default=None, ge=1)
    reported_dispersion: Optional[float] = Field(default=None, ge=0)
    dispersion_kind: Optional[str] = None
    source: Optional[str] = None
    provenance: Provenance = "reported"
    tolerance: Optional[float] = Field(default=None, ge=0)
    tolerance_reason: Optional[str] = None
    blocked_reason: Optional[str] = None
    verdict: Optional[Verdict] = None
    verdict_note: Optional[str] = None
    dataset_key: Optional[str] = None


class ClaimUpdate(BaseModel):
    label: Optional[str] = None
    metric: Optional[str] = None
    unit: Optional[str] = None
    reported_value: Optional[float] = None
    aggregation: Optional[str] = None
    reported_runs: Optional[int] = Field(default=None, ge=1)
    reported_dispersion: Optional[float] = Field(default=None, ge=0)
    dispersion_kind: Optional[str] = None
    source: Optional[str] = None
    provenance: Optional[Provenance] = None
    tolerance: Optional[float] = Field(default=None, ge=0)
    tolerance_reason: Optional[str] = None
    blocked_reason: Optional[str] = None
    verdict: Optional[Verdict] = None
    verdict_note: Optional[str] = None
    dataset_key: Optional[str] = None


class RunSetIn(BaseModel):
    key: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_\-\.]{0,78}$")
    claim: Optional[str] = None
    description: Optional[str] = None
    metric_key: Optional[str] = None
    metric_scale: float = 1.0
    exploratory: bool = False


class RunIn(BaseModel):
    run_set: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_\-\.]{0,78}$")
    name: Optional[str] = None
    seed: Optional[int] = None
    status: Literal["completed", "failed"] = "completed"
    exit_code: Optional[int] = None
    command: Optional[str] = None
    params: dict = {}
    metrics: dict = {}
    environment: dict = {}
    git: dict = {}
    artifacts: list = []
    started_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    log_tail: Optional[str] = Field(default=None, max_length=20000)


class RunBatchIn(BaseModel):
    runs: list[RunIn] = Field(min_length=1, max_length=2000)


class DeviationIn(BaseModel):
    key: Optional[str] = Field(default=None, pattern=r"^[A-Za-z0-9][A-Za-z0-9_\-]{0,18}$")
    kind: DeviationKind
    what: str = Field(min_length=1)
    why: Optional[str] = None
    expected_effect: Optional[str] = None
    applies_to: Optional[str] = None


class DatasetSource(BaseModel):
    relation: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1)
    arxiv_id: Optional[str] = None
    doi: Optional[str] = None
    year: Optional[int] = None


class DatasetIn(BaseModel):
    key: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_\-\.]{0,78}$")
    name: str = Field(min_length=1)
    status: Literal["available", "partial", "unavailable"] = "available"
    url: Optional[str] = None
    version: Optional[str] = None
    note: Optional[str] = None
    sources: list[DatasetSource] = []


class ReferenceIn(BaseModel):
    title: str = Field(min_length=1)
    year: Optional[int] = None
    authors: list[str] = []
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    openalex_id: Optional[str] = None
    cited_by_count: Optional[int] = None


class ReferenceBatchIn(BaseModel):
    source: str = Field(default="manual", max_length=40)
    replace: bool = True
    references: list[ReferenceIn] = Field(max_length=2000)
