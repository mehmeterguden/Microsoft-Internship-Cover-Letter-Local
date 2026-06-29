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

import os
import sqlite3
from pathlib import Path

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/covercraft.db")

SCHEMA = """
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
    description        TEXT,                              -- AI-generated: deep analysis of the project
    contribution       TEXT,                              -- what the user did
    involvement_rating INTEGER CHECK (involvement_rating BETWEEN 1 AND 5)
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


def init_db() -> None:
    """Create all tables if missing. Idempotent — safe to call on every startup."""
    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()
