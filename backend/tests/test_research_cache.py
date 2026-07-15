"""Research-cache retention setting: off / TTL / last_10 pruning.

Pure SQLite against a throwaway temp DB (the connection path is monkeypatched),
so nothing touches the real database.
"""

from __future__ import annotations

from db import queries, schema


def _fresh_db(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(schema, "DATABASE_PATH", str(tmp_path / "test.db"))
    schema.init_db()  # creates tables + seeds the settings row


def test_retention_off_does_not_cache(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    queries.save_settings({"research_cache_retention": "off"})
    queries.save_research("acme|eng", "Acme", "Eng", {"x": 1})
    assert queries.get_research("acme|eng") is None


def test_retention_ttl_caches(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    queries.save_settings({"research_cache_retention": "7_days"})
    queries.save_research("acme|eng", "Acme", "Eng", {"x": 1})
    hit = queries.get_research("acme|eng")
    assert hit is not None and hit["report"]["x"] == 1


def test_retention_last_10_prunes_to_newest_ten(tmp_path, monkeypatch):
    _fresh_db(tmp_path, monkeypatch)
    queries.save_settings({"research_cache_retention": "last_10"})
    for i in range(13):
        queries.save_research(f"c{i}|", f"C{i}", None, {"i": i})
    conn = schema.get_connection()
    try:
        n = conn.execute("SELECT COUNT(*) FROM company_research_cache").fetchone()[0]
    finally:
        conn.close()
    assert n == 10
