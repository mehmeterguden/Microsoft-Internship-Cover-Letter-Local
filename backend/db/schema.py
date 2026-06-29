"""SQLite schema and database initialization.

Single-user app — no auth, no concurrency. We use the standard-library `sqlite3`
module directly (no ORM). Structured records live here; free text that needs
semantic search lives in ChromaDB (see `core/vector_store.py`).

Timestamps are stored as ISO text via SQLite's `datetime('now')`. Columns marked
"JSON" hold a serialized Pydantic model from `models.py`.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/covercraft.db")

SCHEMA = """
-- Single user: exactly one row, pinned to id = 1.
CREATE TABLE IF NOT EXISTS profile (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    name          TEXT,
    email         TEXT,
    phone         TEXT,
    linkedin      TEXT,
    github        TEXT,
    style_profile TEXT,                                  -- JSON: StyleProfile
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skills (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    category     TEXT,
    self_rating  INTEGER CHECK (self_rating BETWEEN 1 AND 5),
    cv_mentioned INTEGER NOT NULL DEFAULT 0,             -- boolean 0/1
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS github_repos (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_name          TEXT NOT NULL,
    description        TEXT,
    language           TEXT,
    url                TEXT,
    involvement_rating INTEGER CHECK (involvement_rating BETWEEN 1 AND 5),
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    company          TEXT NOT NULL,
    role             TEXT NOT NULL,
    job_description  TEXT,
    match_score      INTEGER CHECK (match_score BETWEEN 0 AND 100),
    match_breakdown  TEXT,                               -- JSON: MatchBreakdown
    company_research TEXT,                               -- JSON: CompanyResearch
    status           TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'sent', 'interview', 'rejected', 'offer')),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cover_letters (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cover_letters_job ON cover_letters(job_id);
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
