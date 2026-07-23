"""Tests for core.groundedness and the /cover-letter/groundedness endpoint.

No network: the extraction LLM call is monkeypatched, and the applicant-data
corpus / embeddings are stubbed so the entailment shaping and the similarity
guard can be checked deterministically."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core import groundedness as g
from core import structured_output as so
from main import app

_LETTER = "Dear Acme, I build reliable systems and led a three-person team. Sincerely, Jane."


def _reply(text: str):
    def fake(messages, *, response_format=None, temperature=0.0, max_tokens=None):
        return text
    return fake


# ── claim shaping (spans, evidence) ──────────────────────────────

def test_check_shapes_claims_with_spans(monkeypatch):
    reply = (
        '{"claims": ['
        '{"text": "Builds reliable systems", "quote": "I build reliable systems",'
        ' "supported": true, "evidence": "Experience: Backend Engineer — built systems"},'
        '{"text": "Led a three-person team", "quote": "led a three-person team",'
        ' "supported": false, "evidence": ""}]}'
    )
    monkeypatch.setattr(g, "_evidence_chunks", list)
    monkeypatch.setattr(g.embeddings, "available", lambda: False)
    monkeypatch.setattr(so, "complete", _reply(reply))

    claims = g.check(_LETTER)["claims"]
    assert len(claims) == 2

    first = claims[0]
    assert first["supported"] is True and first["evidence"].startswith("Experience")
    start, end = first["span"]
    assert _LETTER[start:end] == "I build reliable systems"  # span locates the quote verbatim

    second = claims[1]
    assert second["supported"] is False and "evidence" not in second  # empty evidence dropped


def test_similarity_guard_downgrades_ungrounded_claim(monkeypatch):
    reply = ('{"claims": [{"text": "I speak fluent Klingon", "quote": "fluent Klingon",'
             ' "supported": true, "evidence": ""}]}')
    monkeypatch.setattr(g, "_evidence_chunks", lambda: ["Skill: Python", "Experience: Engineer at Acme"])
    monkeypatch.setattr(g.embeddings, "available", lambda: True)
    monkeypatch.setattr(
        g.embeddings, "embed",
        lambda texts: [[0.0, 0.0, 1.0] if t == "I speak fluent Klingon" else [1.0, 0.0, 0.0] for t in texts],
    )
    monkeypatch.setattr(so, "complete", _reply(reply))

    claim = g.check("I speak fluent Klingon fluently.")["claims"][0]
    assert claim["supported"] is False  # no evidence + ~0 similarity → downgraded


def test_similarity_guard_leaves_evidenced_claim_alone(monkeypatch):
    # Same near-zero similarity, but the claim cites evidence → the guard must not touch it.
    reply = ('{"claims": [{"text": "I speak fluent Klingon", "quote": "fluent Klingon",'
             ' "supported": true, "evidence": "Language: Klingon (native)"}]}')
    monkeypatch.setattr(g, "_evidence_chunks", lambda: ["Skill: Python"])
    monkeypatch.setattr(g.embeddings, "available", lambda: True)
    monkeypatch.setattr(g.embeddings, "embed", lambda texts: [[0.0, 0.0, 1.0] for _ in texts])
    monkeypatch.setattr(so, "complete", _reply(reply))

    claim = g.check("I speak fluent Klingon fluently.")["claims"][0]
    assert claim["supported"] is True


def test_check_raises_when_unreadable(monkeypatch):
    monkeypatch.setattr(g, "_evidence_chunks", list)
    monkeypatch.setattr(so, "complete", _reply("no json here"))
    with pytest.raises(ValueError):
        g.check(_LETTER)


# ── endpoint ─────────────────────────────────────────────────────

def test_groundedness_endpoint(monkeypatch):
    reply = ('{"claims": [{"text": "Builds reliable systems", "quote": "I build reliable systems",'
             ' "supported": true, "evidence": "Experience: Engineer"}]}')
    monkeypatch.setattr(g, "_evidence_chunks", list)
    monkeypatch.setattr(g.embeddings, "available", lambda: False)
    monkeypatch.setattr(so, "complete", _reply(reply))

    res = TestClient(app).post("/api/cover-letter/groundedness", json={"text": _LETTER})
    assert res.status_code == 200
    claim = res.json()["claims"][0]
    assert claim["supported"] is True
    start, end = claim["span"]
    assert _LETTER[start:end] == "I build reliable systems"
