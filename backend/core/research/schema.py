"""The typed shape of a company-intelligence report — the engine's compass.

Every screen in the UI (overview, values, culture, tech stack, news, interview
focus, fit) maps onto a field here, and every fact the engine reports is expected
to carry its provenance (`Source`) so nothing is an unattributable hallucination.

Nothing in this file makes network calls or touches the database; it is pure
data contract. Tools return raw payloads (see `tools`), and — in a later phase —
agents map those payloads into this schema.

`ResearchInput` is the one object allowed to flow outward: it holds only public
fields (company name, role title, the employer's job text). The privacy firewall
in `outbound_guard` enforces that the CV/profile never joins it.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field

# 0.0–1.0 how much we trust a fact; 0–100 a relative weight/score.
Confidence = Annotated[float, Field(ge=0.0, le=1.0)]
Weight = Annotated[int, Field(ge=0, le=100)]


# ─────────────────────────────────────────────────────────────
#  Public input — the ONLY data permitted to leave the machine
# ─────────────────────────────────────────────────────────────

class ResearchInput(BaseModel):
    """Everything a research run is allowed to send outward. Public by design."""

    company_name: str = Field(min_length=1, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)
    job_description: str | None = None  # pasted by the user; authored by the employer


# ─────────────────────────────────────────────────────────────
#  Provenance
# ─────────────────────────────────────────────────────────────

class Source(BaseModel):
    """Where a fact came from — a human label and, when we have it, a URL."""

    label: str                       # e.g. "Wikidata", "microsoft.com/careers", "GDELT"
    url: str | None = None


class Evidence(BaseModel):
    """A snippet backing a claim, with its source."""

    text: str
    source: Source


# ─────────────────────────────────────────────────────────────
#  Report sections
# ─────────────────────────────────────────────────────────────

class Firmographics(BaseModel):
    industry: str | None = None
    size: str | None = None          # human string, e.g. "221,000 employees"
    employees: int | None = None     # numeric when known
    hq: str | None = None
    founded: str | None = None       # year or ISO date
    website: str | None = None


class Overview(BaseModel):
    summary: str | None = None
    mission: str | None = None
    division_context: str | None = None   # context for the specific team/role, if known


class ValueSignal(BaseModel):
    """One thing the company weights in candidates, scored 0–100."""

    name: str
    weight: Weight = 0
    evidence: list[Evidence] = Field(default_factory=list)


class Culture(BaseModel):
    ways_of_working: list[str] = Field(default_factory=list)
    notes: list[Evidence] = Field(default_factory=list)


class TechItem(BaseModel):
    """A technology in the company's stack, flagged against the user's skills."""

    name: str
    you_know: bool = False
    worth_learning: bool = False
    source: Source | None = None


class NewsSignal(BaseModel):
    headline: str
    date: str | None = None          # ISO date when known
    url: str | None = None
    why_it_matters: str | None = None


class InterviewFocus(BaseModel):
    order: int
    area: str
    note: str | None = None


class RoleAnalysis(BaseModel):
    """The job posting, decomposed."""

    title: str | None = None
    responsibilities: list[str] = Field(default_factory=list)
    must_haves: list[str] = Field(default_factory=list)
    nice_to_haves: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)


class FitDimension(BaseModel):
    """One axis of the you-vs-role radar."""

    name: str                        # e.g. "Technical skills", "Experience"
    you: Weight
    role_need: Weight


class Fit(BaseModel):
    """The local, private verdict — computed on-device, never sent out."""

    score: Weight = 0
    verdict: str | None = None       # e.g. "STRONG MATCH", "GOOD", "STRETCH"
    recommendation: str | None = None
    dimensions: list[FitDimension] = Field(default_factory=list)
    matched_skills: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    experience_fit_pct: Weight = 0


class LetterHook(BaseModel):
    """A concrete angle the cover letter can use — the bridge to generation."""

    hook: str
    use_in_letter: str | None = None


class ReportMeta(BaseModel):
    sources: list[Source] = Field(default_factory=list)          # every source, deduped
    section_sources: dict[str, list[Source]] = Field(default_factory=dict)  # per section
    confidence: Confidence = 0.0
    gathered_at: str | None = None   # ISO timestamp, stamped by the caller
    duration_s: float | None = None
    agents: list[str] = Field(default_factory=list)


class CompanyIntelReport(BaseModel):
    """The full report. Sections default empty so a partial run still validates."""

    company_name: str
    role_title: str | None = None
    firmographics: Firmographics = Field(default_factory=Firmographics)
    overview: Overview = Field(default_factory=Overview)
    values: list[ValueSignal] = Field(default_factory=list)
    culture: Culture = Field(default_factory=Culture)
    tech_stack: list[TechItem] = Field(default_factory=list)
    signals: list[NewsSignal] = Field(default_factory=list)
    interview: list[InterviewFocus] = Field(default_factory=list)
    role: RoleAnalysis = Field(default_factory=RoleAnalysis)
    fit: Fit = Field(default_factory=Fit)
    ammo: list[LetterHook] = Field(default_factory=list)
    meta: ReportMeta = Field(default_factory=ReportMeta)
