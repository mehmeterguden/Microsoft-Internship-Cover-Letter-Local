"""Pydantic domain models — the typed shapes of the app's data.

Shared across layers (api, core, db). They mirror the SQLite tables in
`db/schema.py` and the JSON stored inside their TEXT columns. No ORM, no record
timestamps, single user. Row `id`s identify list items (skills, projects, …); the
singleton `Profile` has no id.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field

Rating = Annotated[int, Field(ge=1, le=5)]
Score = Annotated[int, Field(ge=0, le=100)]


# ─────────────────────────────────────────────────────────────
#  Enums
# ─────────────────────────────────────────────────────────────

class EmploymentType(str, Enum):
    full_time = "full_time"
    part_time = "part_time"
    internship = "internship"
    freelance = "freelance"
    volunteer = "volunteer"
    other = "other"


class CertificateType(str, Enum):
    professional = "professional"   # e.g. AWS / Azure certification
    course = "course"               # course completion (Coursera, Udemy, …)
    exam = "exam"                   # exam-based / standardized
    language = "language"           # language proficiency
    award = "award"                 # competition / award
    bootcamp = "bootcamp"
    other = "other"


class SkillEntity(str, Enum):
    """What a skill can be linked to as evidence."""

    repo = "repo"
    project = "project"
    experience = "experience"
    certificate = "certificate"
    training = "training"


class LanguageLevel(str, Enum):
    native = "native"
    fluent = "fluent"
    professional = "professional"
    intermediate = "intermediate"
    basic = "basic"


class JobStatus(str, Enum):
    draft = "draft"
    sent = "sent"
    interview = "interview"
    rejected = "rejected"
    offer = "offer"


# ─────────────────────────────────────────────────────────────
#  Structured JSON — stored as TEXT inside SQLite columns
# ─────────────────────────────────────────────────────────────

class StyleProfile(BaseModel):
    """Writing-style traits learned from highly-rated past cover letters."""

    tone: str
    length: str
    word_count: int | None = None
    opening_style: str
    pronoun_style: str
    sentence_style: str


class TechnicalSkillsMatch(BaseModel):
    score: Score
    matched: list[str] = []
    missing: list[str] = []


class ExperienceMatch(BaseModel):
    score: Score
    notes: str = ""


class MatchBreakdown(BaseModel):
    overall_score: Score
    technical_skills: TechnicalSkillsMatch
    experience_level: ExperienceMatch
    recommendation: str = ""


class CompanyResearch(BaseModel):
    company: str
    summary: str
    culture: str | None = None
    recent_news: list[str] = []


# ─────────────────────────────────────────────────────────────
#  Profile (single user)
# ─────────────────────────────────────────────────────────────

class Profile(BaseModel):
    name: str | None = None
    surname: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin: str | None = None
    github: str | None = None
    summary: str | None = None           # short professional summary / headline
    style_profile: StyleProfile | None = None


class Link(BaseModel):
    """A personal link (website, portfolio, blog, Stack Overflow, …) with a note."""

    id: int | None = None
    label: str                           # e.g. "Portfolio", "Blog", "Stack Overflow"
    url: str
    description: str | None = None       # user's note about the link


class Language(BaseModel):
    id: int | None = None
    name: str
    proficiency: LanguageLevel | None = None


# ─────────────────────────────────────────────────────────────
#  Skills + evidence links
# ─────────────────────────────────────────────────────────────

class Skill(BaseModel):
    id: int | None = None
    name: str
    category: str | None = None
    self_rating: Rating | None = None
    years_experience: float | None = None  # years of experience (optional)
    cv_mentioned: bool = False
    note: str | None = None              # where learned / context to mention when using it


class SkillLink(BaseModel):
    """Links a skill to evidence: a repo, project, experience, certificate, or training."""

    id: int | None = None
    skill_id: int
    entity_type: SkillEntity
    entity_id: int


# ─────────────────────────────────────────────────────────────
#  Portfolio entities
# ─────────────────────────────────────────────────────────────

class GithubRepo(BaseModel):
    id: int | None = None
    repo_name: str
    url: str | None = None
    stars: int | None = None             # fetched: star count
    last_updated: str | None = None      # fetched: repo's last push/update date
    technologies: list[str] = []         # languages + tools
    description: str | None = None       # AI-generated: deep analysis of the project
    contribution: str | None = None      # what the user did
    involvement_rating: Rating | None = None


class Project(BaseModel):
    id: int | None = None
    name: str
    description: str | None = None
    role: str | None = None
    technologies: list[str] = []
    url: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    github_repo_id: int | None = None    # optional link to a github_repos row


class Experience(BaseModel):
    id: int | None = None
    company: str
    title: str
    employment_type: EmploymentType | None = None
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None          # None while current
    is_current: bool = False
    description: str | None = None


class Education(BaseModel):
    id: int | None = None
    institution: str
    degree: str | None = None
    field: str | None = None
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False
    gpa: str | None = None


class Training(BaseModel):
    id: int | None = None
    name: str
    provider: str | None = None
    description: str | None = None
    completion_date: str | None = None
    url: str | None = None


class Certificate(BaseModel):
    id: int | None = None
    name: str
    issuer: str | None = None
    cert_type: CertificateType | None = None
    issue_date: str | None = None
    expiry_date: str | None = None       # None = no expiry
    credential_id: str | None = None
    url: str | None = None


# ─────────────────────────────────────────────────────────────
#  Cover letters
# ─────────────────────────────────────────────────────────────

class PastCoverLetter(BaseModel):
    """Onboarding writing sample — rated by us (ai_rating) and optionally the user."""

    id: int | None = None
    content: str
    ai_rating: Rating | None = None
    user_rating: Rating | None = None


# ─────────────────────────────────────────────────────────────
#  Job applications & generated cover letters
# ─────────────────────────────────────────────────────────────

class Job(BaseModel):
    id: int | None = None
    company: str
    role: str
    job_description: str | None = None
    match_score: Score | None = None
    match_breakdown: MatchBreakdown | None = None
    company_research: CompanyResearch | None = None
    status: JobStatus = JobStatus.draft


class CoverLetter(BaseModel):
    id: int | None = None
    job_id: int
    content: str
    version: int = 1
