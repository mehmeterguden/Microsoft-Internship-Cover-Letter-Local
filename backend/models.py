"""Pydantic domain models — the typed shapes of the app's data.

Shared across layers (api, core, db). They mirror the SQLite tables in
`db/schema.py` and the JSON stored inside their TEXT columns. No ORM, no record
timestamps, single user. Row `id`s identify list items (skills, projects, …); the
singleton `Profile` has no id.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, field_validator

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


class Source(str, Enum):
    """Where a piece of profile data originally came from."""

    manual = "manual"       # typed in by the user
    cv = "cv"               # extracted from an uploaded CV
    github = "github"       # imported from a GitHub repo
    linkedin = "linkedin"   # imported from LinkedIn


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


class LLMProvider(str, Enum):
    """Which LLM backend the user has selected."""

    foundry_local = "foundry_local"   # Microsoft · on-device, private (default)
    azure_openai = "azure_openai"     # Microsoft · cloud (managed OpenAI)
    ollama = "ollama"                 # local, private
    lm_studio = "lm_studio"           # local, OpenAI-compatible
    openai = "openai"                 # cloud
    anthropic = "anthropic"           # cloud (Claude)
    gemini = "gemini"                 # cloud


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


class VoiceProfile(BaseModel):
    """A deep, reproducible fingerprint of how the applicant writes and thinks.

    Local metrics (always present) plus a rich, LLM-derived analysis (empty when
    the analysis is unavailable). Stored as the profile's `style_profile` and fed
    to generation so a new letter reads as if the applicant wrote it themselves.
    """

    # ── deterministic, local metrics ──
    word_count: int | None = None
    length: str = ""
    sentence_style: str = ""
    pronoun_style: str = ""

    # ── deep, LLM-derived voice (grounded in the actual letters) ──
    enough_signal: bool = True                               # false = input too thin/gibberish to analyze
    tagline: str = ""                                        # 3-6 word voice descriptor
    summary: str = ""                                        # how they write AND think
    self_presentation: str = ""                              # how they frame themselves
    tone: str = ""
    formality: str = ""                                      # formal ↔ casual placement
    strengths: list[str] = Field(default_factory=list)       # qualities they foreground
    themes: list[str] = Field(default_factory=list)          # recurring topics/values
    signature_phrases: list[str] = Field(default_factory=list)
    vocabulary: list[str] = Field(default_factory=list)
    sentence_patterns: str = ""
    rhetorical_moves: str = ""
    structure: str = ""                                      # how they structure a whole letter
    emphasis: list[str] = Field(default_factory=list)
    opening_structure: list[str] = Field(default_factory=list)   # reusable ordered opening moves
    body_structure: list[str] = Field(default_factory=list)      # reusable ordered body moves
    closing_structure: list[str] = Field(default_factory=list)   # reusable ordered closing moves
    opening_habits: str = ""
    closing_habits: str = ""
    example_sentences: list[str] = Field(default_factory=list)  # verbatim standout sentences
    avoid: list[str] = Field(default_factory=list)
    llm_analyzed: bool = False                               # was the deep analysis applied?


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
#  Settings (single row — user-editable config, no id exposed)
# ─────────────────────────────────────────────────────────────

#: What to do when the active API key hits its rate/quota limit.
#: "auto" rotates to the next key automatically; "manual" stops and lets the
#: user pick which key to use.
KeySwitchMode = Literal["auto", "manual"]

#: Where company-name autocomplete gets its data.
#: "wikidata" is free and keyless (default); "brandfetch" needs a free public
#: client id but gives cleaner brand results + logos.
CompanySearchProvider = Literal["wikidata", "brandfetch"]

#: Which backend produces text embeddings.
#: "sentence_transformers" runs a local model (default); "foundry_local" calls a
#: Foundry Local embedding model over its OpenAI-compatible API, with automatic
#: fallback to sentence-transformers if it's unreachable.
EmbeddingProvider = Literal["sentence_transformers", "foundry_local"]


class CompanySuggestion(BaseModel):
    """One autocomplete result for the company-name field."""

    name: str
    domain: str | None = None          # e.g. "aselsan.com.tr"
    description: str | None = None     # e.g. "Turkish defense corporation"
    logo: str | None = None            # upstream logo URL (the frontend loads it via our proxy)


class GeminiKey(BaseModel):
    """One entry in the rotating Gemini key pool.

    Gemini's free tier is per-key rate-limited, so the user can register several
    keys and the app rotates between them (see `key_switch_mode`)."""

    id: str                              # stable client id (uuid); rotation cursor points at it
    key: str                             # the raw API key
    label: str = ""                      # optional human name ("Personal", "Work", …)


class GeminiKeyConfig(BaseModel):
    """The whole Gemini key setup — returned by the /settings/gemini-keys endpoints."""

    keys: list[GeminiKey] = []
    active_id: str = ""                  # id of the key currently in use / manually selected
    mode: KeySwitchMode = "auto"


class Settings(BaseModel):
    """Runtime config the user can change from the frontend (DB-backed, not env)."""

    llm_provider: LLMProvider = LLMProvider.foundry_local  # which backend to use
    llm_base_url: str                    # base URL for local providers (Foundry/Ollama)
    llm_model: str                       # model name/id to request (Azure: the deployment name)
    openai_api_key: str = ""             # key for the OpenAI provider
    anthropic_api_key: str = ""          # key for the Claude provider
    azure_openai_api_key: str = ""       # key for the Azure OpenAI resource
    azure_openai_endpoint: str = ""      # e.g. https://my-resource.openai.azure.com
    azure_openai_api_version: str = "2024-10-21"  # Azure OpenAI REST API version
    gemini_api_key: str = ""             # legacy single Gemini key (kept for migration)
    gemini_api_keys: list[GeminiKey] = []  # rotating Gemini key pool
    gemini_active_key_id: str = ""       # id of the active/selected key in the pool
    key_switch_mode: KeySwitchMode = "auto"  # auto-rotate vs manual on rate limit
    company_search_provider: CompanySearchProvider = "wikidata"  # company autocomplete source
    brandfetch_client_id: str = ""       # public Brandfetch client id (for provider=brandfetch)
    embedding_provider: EmbeddingProvider = "sentence_transformers"  # which embedding backend
    embedding_model: str                 # embedding model id (sentence-transformers or Foundry model)
    embedding_base_url: str = "http://localhost:5273/v1"  # Foundry Local endpoint for embeddings
    tavily_api_key: str = ""             # company research key (only external call)
    ocr_enabled: bool = False            # optional feature: read images via OCR (needs tesseract)
    github_token: str = ""               # optional: GitHub PAT to import repos from the connected account
    research_cache_retention: Literal["off", "7_days", "30_days", "forever", "last_10"] = "7_days"  # keep cached company research for…
    pii_shield: Literal["off", "risky_only", "on"] = "risky_only"  # warn about personal data in generated letters
    rag_rerank: bool = False  # cross-encoder rerank on exemplar retrieval (higher precision; needs a model download)
    pii_shield_cloud: bool = True         # redact contact-level PII before sending to a cloud provider


# ─────────────────────────────────────────────────────────────
#  Provenance — where each record came from
# ─────────────────────────────────────────────────────────────

class Sourced(BaseModel):
    """Mixin: every list entity records where it came from.

    `source` defaults to `manual` (typed in by the user). CV import stamps `cv`
    plus the filename in `source_detail` and the import date in `source_at`.
    """

    source: Source = Source.manual
    source_detail: str | None = None     # e.g. the CV filename, or a repo name
    source_at: str | None = None         # ISO date the source recorded it


class FieldSource(BaseModel):
    """Provenance for a single profile field (name, email, summary, …)."""

    source: Source = Source.manual
    detail: str | None = None
    at: str | None = None


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
    style_profile: VoiceProfile | None = None   # deep voice fingerprint (see core/style.py)
    field_sources: dict[str, FieldSource] = Field(default_factory=dict)   # per-field provenance


class Link(Sourced):
    """A personal link (website, portfolio, blog, Stack Overflow, …) with a note."""

    id: int | None = None
    label: str                           # e.g. "Portfolio", "Blog", "Stack Overflow"
    url: str
    description: str | None = None       # user's note about the link


class Language(Sourced):
    id: int | None = None
    name: str
    proficiency: LanguageLevel | None = None


# ─────────────────────────────────────────────────────────────
#  Skills + evidence links
# ─────────────────────────────────────────────────────────────

class Skill(Sourced):
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
    description: str | None = None       # AI-generated: rich context — what it is, how it works
    purpose: str | None = None           # AI-generated: the core problem/goal in one line
    highlights: list[str] = []           # AI-generated: standout technical points
    contribution: str | None = None      # what the user did
    involvement_rating: Rating | None = None
    readme: str | None = None            # raw README, saved alongside the AI summary

    @field_validator("technologies", "highlights", mode="before")
    @classmethod
    def _none_to_list(cls, v: object) -> object:
        # Older rows (pre-migration) store NULL for these JSON columns.
        return v if v is not None else []


class Project(Sourced):
    id: int | None = None
    name: str
    description: str | None = None
    role: str | None = None
    technologies: list[str] = []
    url: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    github_repo_id: int | None = None    # optional link to a github_repos row
    stars: int | None = None             # GitHub stars, copied for repo-linked projects

    @field_validator("technologies", mode="before")
    @classmethod
    def _none_to_list(cls, v: object) -> object:
        return v if v is not None else []


class Experience(Sourced):
    id: int | None = None
    company: str
    title: str
    employment_type: EmploymentType | None = None
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None          # None while current
    is_current: bool = False
    description: str | None = None


class Education(Sourced):
    id: int | None = None
    institution: str
    degree: str | None = None
    field: str | None = None
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False
    gpa: str | None = None
    courses: list[str] = []              # relevant coursework, shown as small pills

    @field_validator("courses", mode="before")
    @classmethod
    def _none_to_list(cls, v: object) -> object:
        return v if v is not None else []


class Training(Sourced):
    id: int | None = None
    name: str
    provider: str | None = None
    description: str | None = None
    completion_date: str | None = None
    url: str | None = None


class Certificate(Sourced):
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

class Document(BaseModel):
    """An uploaded CV/supporting file kept after text extraction."""

    id: int | None = None
    filename: str
    source_type: str | None = None       # pdf | image | word
    num_pages: int | None = None
    content: str                         # extracted text (pages joined)


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
    letter: dict[str, Any] | None = None   # saved cover-letter snapshot {content, design}
    created_at: str | None = None          # server-set ISO8601 UTC; ignored on write
    updated_at: str | None = None          # server-bumped ISO8601 UTC; ignored on write


class CoverLetter(BaseModel):
    id: int | None = None
    job_id: int
    content: str
    version: int = 1


# ─────────────────────────────────────────────────────────────
#  CV structuring (LLM output)
# ─────────────────────────────────────────────────────────────

class CVExtraction(BaseModel):
    """Structured CV data produced by the LLM from raw CV text.

    Composed from the entity models above so it validates against the same shapes
    the database stores. The LLM fills what it finds; everything is optional/empty
    by default.
    """

    profile: Profile = Field(default_factory=Profile)
    skills: list[Skill] = []
    experiences: list[Experience] = []
    education: list[Education] = []
    projects: list[Project] = []
    certificates: list[Certificate] = []
    trainings: list[Training] = []
    languages: list[Language] = []
    links: list[Link] = []


# ─────────────────────────────────────────────────────────────
#  AI Profile Interview Models
# ─────────────────────────────────────────────────────────────

class InterviewSetupRequest(BaseModel):
    count: int = Field(default=5, ge=1, le=15)
    focus: str = Field(default="all")  # all | projects | experiences | skills | challenges


class SynthesisDiffItem(BaseModel):
    id: str
    target_type: str                  # project | experience | skill | general
    target_id: int | None = None
    target_name: str
    current_text: str
    proposed_text: str
    approved: bool = True


class SynthesisPreviewResponse(BaseModel):
    diffs: list[SynthesisDiffItem] = []


class ApplySynthesisRequest(BaseModel):
    approved_diffs: list[SynthesisDiffItem]
    session_info: dict[str, Any] | None = None

