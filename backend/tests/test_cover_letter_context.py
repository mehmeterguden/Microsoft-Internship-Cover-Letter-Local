"""Tests for cover-letter context assembly — the local profile/research helpers.

These build the prompt's factual blocks from the local DB. The DB layer is
monkeypatched so the tests stay hermetic (no SQLite, no network); what we pin is
the shaping logic: what gets included, how it is ordered, and what is omitted.
"""

from __future__ import annotations

from core import cover_letter


# ── _span: a compact date range ──

def test_span_marks_current_role_as_present():
    assert cover_letter._span({"start_date": "2022", "is_current": True}) == " (2022–present)"


def test_span_shows_start_and_end():
    assert cover_letter._span({"start_date": "2019", "end_date": "2021"}) == " (2019–2021)"


def test_span_is_empty_without_dates():
    assert cover_letter._span({}) == ""


def test_span_fills_a_missing_side_with_a_question_mark():
    assert cover_letter._span({"end_date": "2021"}) == " (?–2021)"


# ── _recent: current roles first, then newest start date ──

def test_recent_orders_current_first_then_by_start_desc():
    experiences = [
        {"title": "old", "start_date": "2015"},
        {"title": "current", "start_date": "2020", "is_current": True},
        {"title": "recent", "start_date": "2019"},
    ]
    order = [e["title"] for e in cover_letter._recent(experiences)]
    assert order == ["current", "recent", "old"]


# ── _load_profile_context ──

def _fake_profile_db(
    monkeypatch,
    *,
    profile=None,
    skills=None,
    experiences=None,
    projects=None,
    repos=None,
):
    tables = {
        "skills": skills or [],
        "experiences": experiences or [],
        "projects": projects or [],
        "github_repos": repos or [],
    }
    monkeypatch.setattr(cover_letter.queries, "get_profile", lambda: profile)
    monkeypatch.setattr(cover_letter.queries, "list_all", lambda table, *a, **k: tables.get(table, []))


def test_profile_context_is_empty_when_nothing_is_imported(monkeypatch):
    _fake_profile_db(monkeypatch)
    text, has_profile = cover_letter._load_profile_context()
    assert text == "" and has_profile is False


def test_profile_context_includes_name_summary_and_top_skills(monkeypatch):
    _fake_profile_db(
        monkeypatch,
        profile={"name": "Jane", "surname": "Doe", "summary": "Engineer"},
        skills=[{"name": "React", "self_rating": 3}, {"name": "TypeScript", "self_rating": 5}],
    )
    text, has_profile = cover_letter._load_profile_context()
    assert has_profile is True
    assert "Name: Jane Doe" in text
    assert "Summary: Engineer" in text
    # Highest self_rating first.
    assert text.index("TypeScript") < text.index("React")


def test_profile_context_counts_as_present_with_skills_but_no_name(monkeypatch):
    _fake_profile_db(monkeypatch, skills=[{"name": "Go"}])
    text, has_profile = cover_letter._load_profile_context()
    assert has_profile is True and "Skills: Go" in text


def test_profile_context_folds_in_experience_span(monkeypatch):
    _fake_profile_db(
        monkeypatch,
        profile={"name": "Jane"},
        experiences=[{"title": "SWE", "company": "Acme", "start_date": "2020", "is_current": True}],
    )
    text, _ = cover_letter._load_profile_context()
    assert "SWE @ Acme (2020–present)" in text


def test_profile_context_is_capped_to_the_char_limit(monkeypatch):
    _fake_profile_db(monkeypatch, profile={"name": "Jane", "summary": "x" * 10_000})
    text, _ = cover_letter._load_profile_context()
    assert len(text) <= cover_letter._MAX_PROFILE_CHARS


# ── _load_research_context ──

def test_research_context_is_none_without_a_cached_report(monkeypatch):
    monkeypatch.setattr(cover_letter.queries, "get_research", lambda key: None)
    assert cover_letter._load_research_context("Acme", "SWE") is None


def test_research_context_assembles_mission_values_fit_and_hooks(monkeypatch):
    report = {
        "overview": {"mission": "Ship fast"},
        "values": [{"name": "Craft"}, {"name": "Ownership"}],
        "fit": {"matched_skills": ["React"], "gaps": ["Kubernetes"]},
        "ammo": [{"hook": "Recent Series B", "use_in_letter": "cite the growth"}],
    }
    monkeypatch.setattr(cover_letter.queries, "get_research", lambda key: {"report": report})

    context = cover_letter._load_research_context("Acme", None)
    assert "Mission: Ship fast" in context
    assert "They value: Craft, Ownership" in context
    assert "React" in context and "Kubernetes" in context
    assert "Recent Series B" in context


def test_research_context_is_none_when_the_report_is_empty(monkeypatch):
    monkeypatch.setattr(cover_letter.queries, "get_research", lambda key: {"report": {}})
    assert cover_letter._load_research_context("Acme", None) is None
