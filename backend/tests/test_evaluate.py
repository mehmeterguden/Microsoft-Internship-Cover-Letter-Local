"""Tests for core.evaluate (LLM-as-judge) and the /cover-letter/evaluate endpoint.

No network: the structured LLM call (`structured_output.complete`) is monkeypatched
to a canned reply, so the real parse/normalize/validate path runs against it."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core import evaluate
from core import structured_output as so
from main import app

_LETTER = "Dear Acme, I build reliable systems and led a three-person team. Sincerely, Jane."

_GOOD = (
    '{"breakdown": ['
    '{"name": "persuasion", "score": 80},'
    '{"name": "personalization", "score": 70},'
    '{"name": "tone", "score": 90},'
    '{"name": "language", "score": 88},'
    '{"name": "length", "score": 60}],'
    ' "rationale": "Specific and well-structured; could personalize more."}'
)


def _reply(text: str):
    def fake(messages, *, response_format=None, temperature=0.0, max_tokens=None):
        return text
    return fake


# ── core logic ───────────────────────────────────────────────────

def test_evaluate_averages_breakdown(monkeypatch):
    monkeypatch.setattr(so, "complete", _reply(_GOOD))
    out = evaluate.evaluate(_LETTER, "Acme", "Engineer")
    assert [b["name"] for b in out["breakdown"]] == \
        ["persuasion", "personalization", "tone", "language", "length"]
    assert out["score"] == round((80 + 70 + 90 + 88 + 60) / 5)  # 78
    assert out["rationale"]


def test_evaluate_clamps_scores_and_drops_unknown_dimensions(monkeypatch):
    reply = ('{"breakdown":[{"name":"Persuasion","score":150},'
             '{"name":"charisma","score":10}],"rationale":""}')
    monkeypatch.setattr(so, "complete", _reply(reply))
    out = evaluate.evaluate(_LETTER)
    assert [b["name"] for b in out["breakdown"]] == ["persuasion"]  # case-normalized; unknown dropped
    assert out["breakdown"][0]["score"] == 100                      # clamped into [0, 100]
    assert out["score"] == 100


def test_evaluate_raises_when_unreadable(monkeypatch):
    monkeypatch.setattr(so, "complete", _reply("not json at all"))
    with pytest.raises(ValueError):
        evaluate.evaluate(_LETTER)


# ── endpoint ─────────────────────────────────────────────────────

def test_evaluate_endpoint_returns_scores(monkeypatch):
    monkeypatch.setattr(so, "complete", _reply(_GOOD))
    res = TestClient(app).post("/api/cover-letter/evaluate", json={"text": _LETTER, "company": "Acme"})
    assert res.status_code == 200
    body = res.json()
    assert body["score"] == 78
    assert len(body["breakdown"]) == 5
    assert body["rationale"]


def test_evaluate_endpoint_rejects_empty_text():
    res = TestClient(app).post("/api/cover-letter/evaluate", json={"text": ""})
    assert res.status_code == 422
