"""Tests for writing-style learning — analysis metrics, chunking, retrieval flow.

No model, no DB: the sample text drives `analyze` directly, and embedding /
vector-store calls are monkeypatched so exemplar logic is verified offline.
"""

from __future__ import annotations

from core import style
from models import StyleProfile

_WARM = (
    "I've always believed great tools feel invisible! When I built my first app, "
    "I couldn't stop tinkering. I love shipping things people actually use."
)
_FORMAL = (
    "Throughout my career I have consistently delivered scalable systems that "
    "support substantial transaction volumes while maintaining rigorous standards "
    "of reliability, observability and long-term maintainability across teams."
)


# ── analysis ──

def test_analyze_returns_none_for_no_text():
    assert style.analyze([]) is None
    assert style.analyze(["   "]) is None


def test_analyze_detects_warm_conversational_tone():
    profile = style.analyze([_WARM])
    assert isinstance(profile, StyleProfile)
    assert profile.tone == "warm and conversational"      # contractions + exclamation
    assert profile.pronoun_style == "first person singular (I)"


def test_analyze_detects_formal_long_sentences():
    profile = style.analyze([_FORMAL])
    assert profile.tone == "formal and measured"
    assert "long and detailed" in profile.sentence_style


def test_length_bucket_reflects_word_count():
    short = style.analyze(["I ship fast."])
    assert short.length == "short"


# ── chunking ──

def test_chunks_split_on_paragraphs():
    content = "First paragraph that is clearly long enough to keep here.\n\n" \
              "Second paragraph, also long enough to be its own separate chunk."
    chunks = style._chunks(content)
    assert len(chunks) == 2


def test_chunks_drop_tiny_fragments():
    assert style._chunks("hi") == []


# ── retrieval + context (mocked embeddings/store) ──

def test_retrieve_exemplars_uses_vector_store(monkeypatch):
    monkeypatch.setattr(style.embeddings, "available", lambda: True)
    monkeypatch.setattr(style.embeddings, "embed_one", lambda t: [0.1, 0.2])
    monkeypatch.setattr(style.vs, "query",
                        lambda *a, **k: [{"document": "your past passage"}])
    assert style.retrieve_exemplars("Frontend at Acme") == ["your past passage"]


def test_retrieve_exemplars_empty_without_embeddings(monkeypatch):
    monkeypatch.setattr(style.embeddings, "available", lambda: False)
    assert style.retrieve_exemplars("anything") == []


def test_style_context_combines_guide_and_exemplars(monkeypatch):
    monkeypatch.setattr(style, "_stored_style", lambda: StyleProfile(
        tone="warm", length="medium", word_count=280, opening_style="direct",
        pronoun_style="I", sentence_style="balanced"))
    monkeypatch.setattr(style, "retrieve_exemplars", lambda q, k=2: ["passage"])
    ctx = style.style_context("Backend at Stripe")
    assert ctx["has_style"] is True
    assert "warm" in ctx["guide"] and ctx["exemplars"] == ["passage"]
