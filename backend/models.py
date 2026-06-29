"""Pydantic domain models — the typed shapes of the app's data.

Shared across layers (api, core, db). These mirror the SQLite tables in
`db/schema.py` and the structured JSON that is stored inside their TEXT columns.
No ORM: these models describe data, they do not persist it.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field

# 1–5 self-assessment, used by skills and repos.
Rating = Annotated[int, Field(ge=1, le=5)]
# 0–100 match score.
Score = Annotated[int, Field(ge=0, le=100)]


# ─────────────────────────────────────────────────────────────
#  Structured JSON — stored as TEXT inside SQLite columns
# ─────────────────────────────────────────────────────────────

class StyleProfile(BaseModel):
    """Writing-style traits learned from highly-rated past cover letters.

    Stored on `profile.style_profile`; injected into the generation prompt.
    """

    tone: str                       # e.g. "professional", "warm", "direct"
    length: str                     # "short" | "medium" | "long"
    word_count: int | None = None
    opening_style: str              # "question" | "statement" | "achievement"
    pronoun_style: str              # "frequent" | "minimal"
    sentence_style: str             # "simple" | "complex"


class TechnicalSkillsMatch(BaseModel):
    score: Score
    matched: list[str] = []
    missing: list[str] = []


class ExperienceMatch(BaseModel):
    score: Score
    notes: str = ""


class MatchBreakdown(BaseModel):
    """Realistic match analysis stored on `jobs.match_breakdown`."""

    overall_score: Score
    technical_skills: TechnicalSkillsMatch
    experience_level: ExperienceMatch
    recommendation: str = ""


class CompanyResearch(BaseModel):
    """Cached Tavily research, stored on `jobs.company_research`.

    Only the company name is ever sent to Tavily — never the CV or profile.
    """

    company: str
    summary: str
    culture: str | None = None
    recent_news: list[str] = []
    researched_at: datetime | None = None


# ─────────────────────────────────────────────────────────────
#  Core entities — one model per SQLite table
# ─────────────────────────────────────────────────────────────

class Profile(BaseModel):
    """The single user's profile (one row in `profile`)."""

    name: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin: str | None = None
    github: str | None = None
    style_profile: StyleProfile | None = None


class Skill(BaseModel):
    id: int | None = None
    name: str
    category: str | None = None
    self_rating: Rating | None = None
    cv_mentioned: bool = False


class GithubRepo(BaseModel):
    id: int | None = None
    repo_name: str
    description: str | None = None
    language: str | None = None
    url: str | None = None
    involvement_rating: Rating | None = None


class JobStatus(str, Enum):
    draft = "draft"
    sent = "sent"
    interview = "interview"
    rejected = "rejected"
    offer = "offer"


class Job(BaseModel):
    id: int | None = None
    company: str
    role: str
    job_description: str | None = None
    match_score: Score | None = None
    match_breakdown: MatchBreakdown | None = None
    company_research: CompanyResearch | None = None
    status: JobStatus = JobStatus.draft
    created_at: datetime | None = None


class CoverLetter(BaseModel):
    id: int | None = None
    job_id: int
    content: str
    version: int = 1
    created_at: datetime | None = None
