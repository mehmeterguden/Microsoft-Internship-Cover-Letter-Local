"""Tests for writing-style learning — metrics, deep analysis, chunking, retrieval.

The deep analysis (`_llm_voice`) and embeddings are monkeypatched, so everything
runs offline and hermetic.
"""

from __future__ import annotations

import pytest

from core import style
from models import VoiceProfile

_WARM = (
    "I've always believed great tools feel invisible! When I built my first app, "
    "I couldn't stop tinkering. I love shipping things people actually use."
)
_FORMAL = (
    "Throughout my career I have consistently delivered scalable systems that "
    "support substantial transaction volumes while maintaining rigorous standards "
    "of reliability, observability and long-term maintainability across teams."
)


@pytest.fixture(autouse=True)
def _no_llm(monkeypatch):
    # Default: no deep analysis, so analyze() returns metrics-only VoiceProfiles.
    monkeypatch.setattr(style, "_llm_voice", lambda corpus, count=0: {})


# ── metrics ──

def test_analyze_returns_none_for_no_text():
    assert style.analyze([]) is None
    assert style.analyze(["   "]) is None


def test_analyze_detects_warm_conversational_tone():
    v = style.analyze([_WARM])
    assert isinstance(v, VoiceProfile)
    assert v.tone == "warm and conversational"
    assert v.pronoun_style == "first person singular (I)"
    assert v.llm_analyzed is False


def test_analyze_detects_formal_long_sentences():
    v = style.analyze([_FORMAL])
    assert v.tone == "formal and measured"
    assert "long and detailed" in v.sentence_style


# ── deep analysis merges in ──

def test_deep_analysis_enriches_profile(monkeypatch):
    monkeypatch.setattr(style, "_llm_voice", lambda corpus, count=0: {
        "summary": "You write with quiet confidence.",
        "signature_phrases": ["I couldn't stop tinkering"],
        "vocabulary": ["ship", "craft"],
        "tone": "playful and precise",
    })
    v = style.analyze([_WARM])
    assert v.llm_analyzed is True
    assert v.summary.startswith("You write")
    assert v.tone == "playful and precise"          # LLM overrides the metric fallback
    assert "I couldn't stop tinkering" in v.signature_phrases


def test_build_voice_guide_includes_rich_fields():
    v = VoiceProfile(
        summary="You lead with impact.", tone="direct", signature_phrases=["ship it"],
        vocabulary=["craft"], emphasis=["ownership"], avoid=["synergy"], pronoun_style="I",
    )
    guide = style.build_voice_guide(v)
    assert "You lead with impact." in guide
    assert "ship it" in guide and "craft" in guide
    assert "ownership" in guide and "synergy" in guide


# ── chunking ──

def test_chunks_split_on_paragraphs():
    content = "First paragraph that is clearly long enough to keep here.\n\n" \
              "Second paragraph, also long enough to be its own separate chunk."
    assert len(style._chunks(content)) == 2


def test_chunks_drop_tiny_fragments():
    assert style._chunks("hi") == []


# ── retrieval + context (mocked embeddings/store) ──

def test_retrieve_exemplars_uses_vector_store(monkeypatch):
    monkeypatch.setattr(style.embeddings, "available", lambda: True)
    monkeypatch.setattr(style.embeddings, "embed_one", lambda t: [0.1, 0.2])
    monkeypatch.setattr(style.vs, "query", lambda *a, **k: [{"document": "your past passage"}])
    assert style.retrieve_exemplars("Frontend at Acme") == ["your past passage"]


def test_retrieve_exemplars_empty_without_embeddings(monkeypatch):
    monkeypatch.setattr(style.embeddings, "available", lambda: False)
    assert style.retrieve_exemplars("anything") == []


def test_style_context_combines_guide_and_exemplars(monkeypatch):
    monkeypatch.setattr(style, "_stored_voice", lambda: VoiceProfile(tone="warm", summary="You ship."))
    monkeypatch.setattr(style, "retrieve_exemplars", lambda q, k=3: ["passage"])
    ctx = style.style_context("Backend at Stripe")
    assert ctx["has_style"] is True
    assert "warm" in ctx["guide"] and ctx["exemplars"] == ["passage"]
