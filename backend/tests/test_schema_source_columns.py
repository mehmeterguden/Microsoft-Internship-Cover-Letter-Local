"""Provenance (`source`) columns must exist on every sourced table — including
`projects` and `education`, which are also in `_TABLE_COLUMNS_ADDED`.

Regression: those two once appeared twice in one dict literal, so the second
entry silently dropped the source columns. A CV save then crashed in
`clear_except_github` ("no such column: source"), surfacing in the browser as a
CORS error because the 500 carried no CORS headers.

All against a throwaway temp DB (connection path monkeypatched).
"""

from __future__ import annotations

import sqlite3

import pytest

from db import queries, schema


def _fresh_db(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(schema, "DATABASE_PATH", str(tmp_path / "test.db"))
    schema.init_db()


def _columns(table: str) -> set[str]:
    conn = queries.get_connection()
    try:
        return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    finally:
        conn.close()


@pytest.mark.parametrize("table", schema._SOURCED_TABLES)
def test_every_sourced_table_has_provenance_columns(table, tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    assert set(schema._SOURCE_COLUMNS).issubset(_columns(table)), table


def test_projects_and_education_keep_both_source_and_extra_columns():
    # The merge, not a duplicate-key literal: sourced *and* extra columns survive.
    assert {"source", "source_detail", "source_at", "stars"} <= set(schema._COLUMNS_ADDED["projects"])
    assert {"source", "source_detail", "source_at", "courses"} <= set(schema._COLUMNS_ADDED["education"])


def test_clear_except_github_runs_on_education_and_projects(tmp_path, monkeypatch):
    # The exact call that crashed the CV save must succeed on the affected tables.
    _fresh_db(tmp_path, monkeypatch)
    required = {"education": "institution", "projects": "name"}  # each table's NOT NULL text column
    for table, name_col in required.items():
        queries.insert(table, {name_col: "manual-row", "source": "manual"})
        queries.insert(table, {name_col: "github-row", "source": "github"})
        removed = queries.clear_except_github(table)
        assert removed == 1  # the manual row went, the github row stayed
        rows = queries.list_all(table)
        assert [r["source"] for r in rows] == ["github"]


def test_migration_heals_a_legacy_db_missing_source(tmp_path, monkeypatch):
    # Simulate an old DB whose `education` predates the source columns, then let
    # init_db() migrate it in place — the columns should appear.
    db = tmp_path / "legacy.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE education (id INTEGER PRIMARY KEY AUTOINCREMENT, institution TEXT NOT NULL)")
    conn.commit()
    conn.close()

    monkeypatch.setattr(schema, "DATABASE_PATH", str(db))
    schema.init_db()  # idempotent create + migrate
    assert set(schema._SOURCE_COLUMNS).issubset(_columns("education"))
