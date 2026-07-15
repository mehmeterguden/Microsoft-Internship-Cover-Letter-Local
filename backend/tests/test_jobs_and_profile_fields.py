"""New persisted fields: job timestamps, education courses, project stars.

All against a throwaway temp DB (connection path monkeypatched).
"""

from __future__ import annotations

from db import queries, schema


def _fresh_db(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(schema, "DATABASE_PATH", str(tmp_path / "test.db"))
    schema.init_db()


def test_job_insert_sets_both_timestamps(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    jid = queries.insert("jobs", {"company": "Acme", "role": "Eng", "status": "draft"})
    row = queries.get_by_id("jobs", jid)
    assert row["created_at"] and row["updated_at"]
    assert row["created_at"] == row["updated_at"]  # equal on first write


def test_job_update_preserves_created_ignores_client_value(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    jid = queries.insert("jobs", {"company": "Acme", "role": "Eng", "status": "draft"})
    created = queries.get_by_id("jobs", jid)["created_at"]
    # A later write carrying a bogus client-sent created_at must be ignored.
    queries.update(
        "jobs", jid,
        {"company": "Acme", "role": "Eng", "status": "sent",
         "created_at": "1999-01-01T00:00:00+00:00"},
    )
    row = queries.get_by_id("jobs", jid)
    assert row["created_at"] == created  # server-authoritative
    assert row["status"] == "sent"


def test_education_courses_json_roundtrip(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    eid = queries.insert("education", {"institution": "MIT", "courses": ["Algorithms", "Databases"]})
    assert queries.get_by_id("education", eid)["courses"] == ["Algorithms", "Databases"]


def test_project_stars_roundtrip(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    pid = queries.insert("projects", {"name": "cli-tool", "stars": 42})
    assert queries.get_by_id("projects", pid)["stars"] == 42
