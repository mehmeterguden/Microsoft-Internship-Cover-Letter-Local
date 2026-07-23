"""Tests for cover-letter generation — prompt assembly and the streaming event flow.

No network, no real LLM: `llm.stream` and the DB loaders are monkeypatched.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core import cover_letter
from core.prompts.cover_letter import build_messages
from main import app


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
    monkeypatch.setattr(cover_letter.queries, "get_settings", lambda: {"llm_provider": "foundry_local", "llm_model": "phi"})
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
    monkeypatch.setattr(cover_letter.queries, "get_settings", lambda: {"llm_provider": "foundry_local", "llm_model": "phi"})
    monkeypatch.setattr(cover_letter.llm, "stream", lambda *a, **k: iter(["Hello."]))

    events = list(cover_letter.stream("Acme"))
    assert events[0]["has_profile"] is False and events[0]["used_research"] is False
    assert any(e["type"] == "token" for e in events)


# ── run-meta on the done event (task 7) ──

def test_done_event_carries_run_meta(monkeypatch):
    monkeypatch.setattr(cover_letter, "_load_profile_context", lambda: ("Name: Jane\nSkills: X", True))
    monkeypatch.setattr(cover_letter, "_load_research_context", lambda c, r: "They value: Craft")
    monkeypatch.setattr(
        cover_letter.style, "style_context",
        lambda q: {"has_style": True, "guide": "Write like Jane.", "exemplars": ["A past paragraph of hers."]},
    )
    monkeypatch.setattr(
        cover_letter.queries, "get_settings",
        lambda: {"llm_provider": "ollama", "llm_model": "llama3"},
    )
    monkeypatch.setattr(cover_letter.llm, "stream", lambda *a, **k: iter(["Dear Acme team, hello there."]))

    done = list(cover_letter.stream("Acme", "Engineer"))[-1]
    assert done["type"] == "done"
    meta = done["run_meta"]
    assert meta["provider"] == "ollama" and meta["model"] == "llama3"
    assert meta["duration_s"] >= 0 and meta["tokens"] >= 1
    assert {"profile", "research", "voice", "exemplar"} <= {c["source"] for c in meta["context"]}
    assert any("ollama/llama3" in step for step in meta["steps"])


# ── inline editing (task 8) ──

def test_edit_returns_cleaned_replacement(monkeypatch):
    monkeypatch.setattr(cover_letter.llm, "complete", lambda messages, **k: '  "A sharper sentence."  ')
    assert cover_letter.edit("full letter", "a weak sentence", "improve") == "A sharper sentence."


def test_edit_strips_code_fence(monkeypatch):
    monkeypatch.setattr(cover_letter.llm, "complete", lambda messages, **k: "```\nRewritten passage.\n```")
    assert cover_letter.edit("t", "s", "shorten") == "Rewritten passage."


def test_edit_tone_injects_tone_line(monkeypatch):
    captured = {}

    def fake(messages, **k):
        captured["system"] = messages[0]["content"]
        return "x"

    monkeypatch.setattr(cover_letter.llm, "complete", fake)
    cover_letter.edit("t", "s", "tone", tone="warm")
    assert "warm" in captured["system"].lower()


def test_edit_rejects_unknown_action():
    with pytest.raises(ValueError):
        cover_letter.edit("t", "s", "explode")


def test_edit_endpoint(monkeypatch):
    monkeypatch.setattr(cover_letter.llm, "complete", lambda messages, **k: "Improved passage.")
    res = TestClient(app).post(
        "/api/cover-letter/edit",
        json={"text": "full letter", "selection": "sel", "action": "improve"},
    )
    assert res.status_code == 200 and res.json()["text"] == "Improved passage."


def test_edit_endpoint_rejects_bad_action():
    res = TestClient(app).post(
        "/api/cover-letter/edit",
        json={"text": "full", "selection": "sel", "action": "explode"},
    )
    assert res.status_code == 422
