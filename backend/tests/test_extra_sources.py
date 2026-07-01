"""Tests for the Phase 5 free sources — Hacker News and Wikipedia (stubbed HTTP)."""

from __future__ import annotations

from core.research import outbound_guard
from core.research.tools import hackernews, wikipedia


def test_hackernews_maps_hits(monkeypatch):
    payload = {"hits": [
        {"title": "Show HN: Acme", "url": "https://acme.dev", "objectID": "1", "points": 42,
         "num_comments": 9, "created_at": "2026-06-01T00:00:00Z"},
        {"title": "", "objectID": "2"},  # dropped: no title
    ]}
    monkeypatch.setattr(outbound_guard, "get_json", lambda *a, **k: payload)
    result = hackernews.discussions("Acme")
    assert result.ok
    stories = result.data["stories"]
    assert len(stories) == 1
    assert stories[0]["points"] == 42 and stories[0]["date"] == "2026-06-01"


def test_hackernews_falls_back_to_item_url(monkeypatch):
    monkeypatch.setattr(outbound_guard, "get_json",
                        lambda *a, **k: {"hits": [{"title": "T", "objectID": "99"}]})
    story = hackernews.discussions("Acme").data["stories"][0]
    assert story["url"] == "https://news.ycombinator.com/item?id=99"


def test_wikipedia_returns_extract(monkeypatch):
    monkeypatch.setattr(outbound_guard, "get_json", lambda *a, **k: {
        "type": "standard", "title": "Acme", "extract": "Acme builds tools.",
        "description": "software company",
        "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/Acme"}},
    })
    result = wikipedia.summary("Acme")
    assert result.ok and result.data["extract"] == "Acme builds tools."
    assert result.source == "https://en.wikipedia.org/wiki/Acme"


def test_wikipedia_skips_disambiguation(monkeypatch):
    monkeypatch.setattr(outbound_guard, "get_json",
                        lambda *a, **k: {"type": "disambiguation", "extract": "many things"})
    assert wikipedia.summary("Acme").ok is False
