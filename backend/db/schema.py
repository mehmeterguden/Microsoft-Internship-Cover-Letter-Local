"""SQLite schema and database initialization.

Single-user, local app — no auth, no multi-user, no `id` on the singleton profile,
and no record timestamps (created_at/updated_at). We use the standard-library
`sqlite3` module directly (no ORM).

Structured records live here; free text that needs semantic search lives in
ChromaDB (see `core/vector_store.py`). Columns marked "JSON" hold a serialized
Pydantic model / list from `models.py`. Date columns (start_date, issue_date, …)
are real data — stored as ISO text ("YYYY-MM" or "YYYY-MM-DD"), not record metadata.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import config

DATABASE_PATH = config.DATABASE_PATH

SCHEMA = """
-- ── App settings ─────────────────────────────────────────────────
-- Single row (id always 1). User-editable config that used to live in env:
-- the chosen LLM provider, endpoint/model, and per-provider API keys —
-- all changeable from the frontend. Seeded with our defaults on first init.
CREATE TABLE IF NOT EXISTS settings (
    id                INTEGER PRIMARY KEY CHECK (id = 1),   -- enforce a single row
    llm_provider      TEXT NOT NULL DEFAULT 'foundry_local',-- foundry_local|ollama|openai|anthropic|gemini
    llm_base_url      TEXT NOT NULL,                        -- base URL for local providers (Foundry/Ollama)
    llm_model         TEXT NOT NULL,                        -- model name/id to request
    openai_api_key    TEXT NOT NULL DEFAULT '',             -- key for the OpenAI provider
    anthropic_api_key TEXT NOT NULL DEFAULT '',             -- key for the Claude provider
    gemini_api_key    TEXT NOT NULL DEFAULT '',             -- key for the Gemini provider
    embedding_model   TEXT NOT NULL,                        -- sentence-transformers model (later phases)
    tavily_api_key    TEXT NOT NULL DEFAULT '',             -- company research (only external call)
    ocr_enabled       INTEGER NOT NULL DEFAULT 0,           -- optional: read images via OCR (needs tesseract)
    github_token      TEXT NOT NULL DEFAULT ''              -- optional: connect GitHub account (PAT) for repo import
);

-- ── Uploaded documents (extracted text) ─────────────────────────
-- A CV / supporting file (PDF, image, or Word) the user uploaded and chose to
-- keep. Stores the extracted plain text; LLM structuring into profile/skills
-- comes in a later phase.
CREATE TABLE IF NOT EXISTS documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    filename    TEXT NOT NULL,
    source_type TEXT,                                     -- pdf|image|word
    num_pages   INTEGER,
    content     TEXT NOT NULL                             -- extracted text (pages joined)
);

-- ── Identity ─────────────────────────────────────────────────────
-- Single user: exactly one row, managed by the app (no id needed).
CREATE TABLE IF NOT EXISTS profile (
    name          TEXT,
    surname       TEXT,
    email         TEXT,
    phone         TEXT,
    linkedin      TEXT,
    github        TEXT,
    summary       TEXT,                                   -- short professional summary / headline
    style_profile TEXT                                    -- JSON: StyleProfile
);

-- Personal links (website, portfolio, blog, Stack Overflow, …), each with a note.
CREATE TABLE IF NOT EXISTS links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    label       TEXT NOT NULL,                            -- e.g. "Portfolio", "Blog"
    url         TEXT NOT NULL,
    description TEXT                                      -- user's note about the link
);

-- Spoken languages with proficiency.
CREATE TABLE IF NOT EXISTS languages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    proficiency TEXT                                      -- native|fluent|professional|intermediate|basic
);

-- ── Skills ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,
    category         TEXT,
    self_rating      INTEGER CHECK (self_rating BETWEEN 1 AND 5),
    years_experience REAL,                                -- years of experience (optional)
    cv_mentioned     INTEGER NOT NULL DEFAULT 0,          -- boolean 0/1
    note             TEXT                                 -- where learned / context
);

-- ── GitHub repositories (auto-fetched + AI-analyzed) ─────────────
CREATE TABLE IF NOT EXISTS github_repos (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_name          TEXT NOT NULL,                     -- fetched
    url                TEXT,                              -- fetched
    stars              INTEGER,                           -- fetched, star count
    last_updated       TEXT,                              -- fetched, repo's last push/update date
    technologies       TEXT,                              -- JSON: list[str] (languages + tools)
    description        TEXT,                              -- AI-generated: short useful context for the project
    contribution       TEXT,                              -- what the user did
    involvement_rating INTEGER CHECK (involvement_rating BETWEEN 1 AND 5),
    readme             TEXT                               -- raw README, saved alongside the AI summary
);

-- ── Projects (general; may be non-GitHub) ────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    description    TEXT,
    role           TEXT,                                  -- the user's role on the project
    technologies   TEXT,                                  -- JSON: list[str]
    url            TEXT,
    start_date     TEXT,
    end_date       TEXT,
    github_repo_id INTEGER REFERENCES github_repos(id) ON DELETE SET NULL  -- optional link
);

-- ── Work / internship experience ─────────────────────────────────
CREATE TABLE IF NOT EXISTS experiences (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company         TEXT NOT NULL,
    title           TEXT NOT NULL,
    employment_type TEXT,                                 -- full_time|part_time|internship|freelance|volunteer|other
    location        TEXT,
    start_date      TEXT,
    end_date        TEXT,                                 -- NULL while current
    is_current      INTEGER NOT NULL DEFAULT 0,
    description     TEXT
);

-- ── Education ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS education (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    institution TEXT NOT NULL,
    degree      TEXT,
    field       TEXT,
    location    TEXT,
    start_date  TEXT,
    end_date    TEXT,
    is_current  INTEGER NOT NULL DEFAULT 0,
    gpa         TEXT
);

-- ── Trainings / courses ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trainings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    provider        TEXT,
    description     TEXT,
    completion_date TEXT,
    url             TEXT
);

-- ── Certificates (typed) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    issuer        TEXT,
    cert_type     TEXT,                                   -- professional|course|exam|language|award|bootcamp|other
    issue_date    TEXT,
    expiry_date   TEXT,                                   -- NULL = no expiry
    credential_id TEXT,
    url           TEXT
);

-- ── Skill ↔ evidence links (polymorphic) ─────────────────────────
-- Connects a skill to where it was used or proven: a repo, project,
-- experience, certificate, or training. entity_id points at that
-- table's id (not FK-enforced because the target table varies).
CREATE TABLE IF NOT EXISTS skill_links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id    INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN
                   ('repo', 'project', 'experience', 'certificate', 'training')),
    entity_id   INTEGER NOT NULL,
    UNIQUE (skill_id, entity_type, entity_id)
);

-- ── Onboarding writing samples ───────────────────────────────────
-- Letters the user wrote before. Two ratings: ours (ai_rating) and an
-- optional one from the user (user_rating). Also embedded into the
-- `cover_letters` ChromaDB collection so style is learned from the best.
CREATE TABLE IF NOT EXISTS past_cover_letters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    content     TEXT NOT NULL,
    ai_rating   INTEGER CHECK (ai_rating BETWEEN 1 AND 5),
    user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5)
);

-- ── Job applications & generated cover letters ───────────────────
CREATE TABLE IF NOT EXISTS jobs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    company          TEXT NOT NULL,
    role             TEXT NOT NULL,
    job_description  TEXT,
    match_score      INTEGER CHECK (match_score BETWEEN 0 AND 100),
    match_breakdown  TEXT,                                -- JSON: MatchBreakdown
    company_research TEXT,                                -- JSON: CompanyResearch
    status           TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'sent', 'interview', 'rejected', 'offer'))
);

CREATE TABLE IF NOT EXISTS cover_letters (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id  INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);

-- ── Company research cache (keyed by company+role, expires after a TTL) ──
CREATE TABLE IF NOT EXISTS company_research_cache (
    cache_key    TEXT PRIMARY KEY,                        -- normalized "company|role"
    company_name TEXT NOT NULL,
    role_title   TEXT,
    report       TEXT NOT NULL,                           -- JSON: CompanyIntelReport
    created_at   TEXT NOT NULL,                           -- ISO timestamp
    expires_at   TEXT NOT NULL                            -- ISO timestamp
);

CREATE INDEX IF NOT EXISTS idx_cover_letters_job ON cover_letters(job_id);
CREATE INDEX IF NOT EXISTS idx_skill_links_skill ON skill_links(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_links_entity ON skill_links(entity_type, entity_id);
"""


def get_connection() -> sqlite3.Connection:
    """Open a connection: rows accessible by column name, foreign keys enforced."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# Columns added to a table after it first shipped. ALTER ADD COLUMN backfills
# existing rows with the DEFAULT, so older local DBs upgrade in place.
_COLUMNS_ADDED = {
    "settings": {
        "llm_provider": "TEXT NOT NULL DEFAULT 'foundry_local'",
        "openai_api_key": "TEXT NOT NULL DEFAULT ''",
        "anthropic_api_key": "TEXT NOT NULL DEFAULT ''",
        "gemini_api_key": "TEXT NOT NULL DEFAULT ''",
        "ocr_enabled": "INTEGER NOT NULL DEFAULT 0",
        "github_token": "TEXT NOT NULL DEFAULT ''",
        "mcp_servers": "TEXT NOT NULL DEFAULT '[]'",  # JSON: [{"name","url"}] MCP tool servers
    },
    "github_repos": {
        "readme": "TEXT",  # raw README, saved alongside the AI summary
    },
}


def _migrate(conn: sqlite3.Connection) -> None:
    """Add any columns missing from an older database."""
    for table, columns in _COLUMNS_ADDED.items():
        existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        for column, declaration in columns.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")


def init_db() -> None:
    """Create all tables if missing, migrate, and seed settings. Idempotent."""
    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        _migrate(conn)
        # Seed the single settings row with our defaults the first time only.
        # INSERT OR IGNORE leaves an existing (user-edited) row untouched.
        conn.execute(
            """INSERT OR IGNORE INTO settings
                   (id, llm_provider, llm_base_url, llm_model, embedding_model, tavily_api_key)
               VALUES (1, ?, ?, ?, ?, ?)""",
            (
                config.DEFAULT_LLM_PROVIDER,
                config.DEFAULT_LLM_BASE_URL,
                config.DEFAULT_LLM_MODEL,
                config.DEFAULT_EMBEDDING_MODEL,
                config.DEFAULT_TAVILY_API_KEY,
            ),
        )
        conn.commit()
    finally:
        conn.close()
