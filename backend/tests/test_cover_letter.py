"""Tests for cover-letter generation — prompt assembly and the streaming event flow.

No network, no real LLM: `llm.stream` and the DB loaders are monkeypatched.
"""

from __future__ import annotations

from core import cover_letter
from core.prompts.cover_letter import build_messages


# ── prompt assembly ──

def test_prompt_includes_profile_job_and_research():
    messages = build_messages(
        profile_context="Name: Jane Doe\nSkills: React, TypeScript",
        company_name="Vercel",
        role_title="Frontend Engineer",
        job_description="Build fast UIs.",
        research_context="They value: Craft\nLetter hooks to weave in:\n- Lead with React",
        tone="confident",
    )
    system, user = messages[0]["content"], messages[1]["content"]
    assert "confident" in system.lower()
    assert "Jane Doe" in user and "Vercel" in user and "Frontend Engineer" in user
    assert "Build fast UIs." in user and "Lead with React" in user


def test_prompt_handles_missing_profile_and_research():
    messages = build_messages("", "Acme", None, None, None)
    user = messages[1]["content"]
    assert "no profile imported" in user
    assert "RESEARCH CONTEXT" not in user  # omitted when absent


def test_unknown_tone_falls_back_to_professional():
    system = build_messages("x", "Acme", None, None, None, tone="wacky")[0]["content"]
    assert "professional" in system.lower()


# ── streaming flow ──

_NO_STYLE = {"has_style": False, "guide": None, "exemplars": []}


def test_stream_emits_start_tokens_then_done(monkeypatch):
    monkeypatch.setattr(cover_letter, "_load_profile_context", lambda: ("Name: Jane", True))
    monkeypatch.setattr(cover_letter, "_load_research_context", lambda c, r: "They value: Craft")
    monkeypatch.setattr(cover_letter.style, "style_context", lambda q: _NO_STYLE)
    monkeypatch.setattr(cover_letter.llm, "stream", lambda *a, **k: iter(["Dear ", "Vercel", " team"]))

    events = list(cover_letter.stream("Vercel", "Engineer"))

    assert events[0]["type"] == "start"
    assert events[0]["has_profile"] is True and events[0]["used_research"] is True
    tokens = [e["text"] for e in events if e["type"] == "token"]
    assert "".join(tokens) == "Dear Vercel team"
    assert events[-1]["type"] == "done"


def test_stream_without_profile_or_research(monkeypatch):
    monkeypatch.setattr(cover_letter, "_load_profile_context", lambda: ("", False))
    monkeypatch.setattr(cover_letter, "_load_research_context", lambda c, r: None)
    monkeypatch.setattr(cover_letter.style, "style_context", lambda q: _NO_STYLE)
    monkeypatch.setattr(cover_letter.llm, "stream", lambda *a, **k: iter(["Hello."]))

    events = list(cover_letter.stream("Acme"))
    assert events[0]["has_profile"] is False and events[0]["used_research"] is False
    assert any(e["type"] == "token" for e in events)


# ── length preset ──

def test_length_preset_injected_into_prompt():
    short = build_messages("x", "Acme", None, None, None, length="short")[0]["content"]
    assert "180" in short
    detailed = build_messages("x", "Acme", None, None, None, length="detailed")[0]["content"]
    assert "460" in detailed
    fallback = build_messages("x", "Acme", None, None, None, length="bogus")[0]["content"]
    assert "250" in fallback  # unknown → standard


# ── review pass (advisory claim check, no score) ──

def test_review_parses_flagged_claims(monkeypatch):
    monkeypatch.setattr(cover_letter, "_load_profile_context", lambda: ("Name: Jane\nSkills: React", True))
    monkeypatch.setattr(
        cover_letter.llm, "complete",
        lambda *a, **k: '{"claims": [{"text": "Led a team of 40", "reason": "not in profile"}]}',
    )
    claims = cover_letter.review("I led a team of 40 engineers.")
    assert len(claims) == 1
    assert claims[0]["text"] == "Led a team of 40"
    assert "profile" in claims[0]["reason"]


def test_review_empty_letter_skips_llm(monkeypatch):
    calls = {"n": 0}

    def boom(*a, **k):
        calls["n"] += 1
        return "{}"

    monkeypatch.setattr(cover_letter.llm, "complete", boom)
    assert cover_letter.review("   ") == []
    assert calls["n"] == 0  # no letter → no model call


def test_review_tolerates_fenced_json_and_garbage(monkeypatch):
    monkeypatch.setattr(cover_letter, "_load_profile_context", lambda: ("Name: Jane", True))
    monkeypatch.setattr(cover_letter.llm, "complete", lambda *a, **k: "```json\n{\"claims\": []}\n```")
    assert cover_letter.review("Some letter.") == []
    monkeypatch.setattr(cover_letter.llm, "complete", lambda *a, **k: "sorry, I can't do that")
    assert cover_letter.review("Some letter.") == []  # never raises → []


def test_review_survives_provider_error(monkeypatch):
    monkeypatch.setattr(cover_letter, "_load_profile_context", lambda: ("Name: Jane", True))

    def raise_err(*a, **k):
        raise RuntimeError("provider down")

    monkeypatch.setattr(cover_letter.llm, "complete", raise_err)
    assert cover_letter.review("A letter that makes claims.") == []
