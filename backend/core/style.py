"""Writing-style learning — teach the generator to sound like the user.

Two local mechanisms, both offline:

  1. A style PROFILE: deterministic metrics computed from the user's past cover
     letters (length, sentence rhythm, pronouns, tone, opening habit). Always
     available — no model needed — and stored on the profile row.
  2. Style EXEMPLARS: the past letters, chunked and embedded locally into the
     `cover_letters` vector collection, so at generation time we can retrieve the
     passages most relevant to the target job and show the model "this is your
     voice — match it". Needs sentence-transformers; degrades to profile-only.

Nothing leaves the machine here. The retrieved exemplars only reach an LLM later,
inside the generation prompt, under the same provider opt-in as the profile.
"""

from __future__ import annotations

import re
import statistics
from typing import Any

from core import embeddings
from core import vector_store as vs
from db import queries
from models import StyleProfile

_SAMPLE_TABLE = "past_cover_letters"
_COLLECTION = vs.COVER_LETTERS
_MIN_CHUNK = 40


# ─────────────────────────────────────────────────────────────
#  Public API
# ─────────────────────────────────────────────────────────────

def learn() -> dict[str, Any]:
    """Analyze past letters, store the style profile, and (re)index exemplars."""
    letters = _sorted_letters()
    texts = [row["content"] for row in letters if row.get("content")]

    style = analyze(texts)
    if style is not None:
        _save_style_profile(style)

    chunks = 0
    used_embeddings = False
    if texts and embeddings.available():
        try:
            chunks = _index_exemplars(letters)
            used_embeddings = True
        except Exception:  # noqa: BLE001 — indexing is best-effort; profile still saved
            chunks = 0

    return {
        "samples": len(texts),
        "chunks_indexed": chunks,
        "embeddings": used_embeddings,
        "style_profile": style.model_dump() if style else None,
    }


def analyze(texts: list[str]) -> StyleProfile | None:
    """Compute a StyleProfile from writing samples (pure, local). None if no text."""
    corpus = "\n\n".join(t.strip() for t in texts if t and t.strip())
    if not corpus:
        return None

    words = re.findall(r"\b[\w']+\b", corpus)
    sentences = [s for s in re.split(r"[.!?]+", corpus) if s.strip()]
    n_words, n_sentences, n_letters = len(words), max(len(sentences), 1), max(len(texts), 1)

    sentence_lengths = [len(re.findall(r"\b[\w']+\b", s)) for s in sentences] or [0]
    avg_sentence_len = n_words / n_sentences
    std_sentence = statistics.pstdev(sentence_lengths) if len(sentence_lengths) > 1 else 0.0

    i_count = len(re.findall(r"\bI\b", corpus))
    we_count = len(re.findall(r"\bwe\b", corpus, re.I))
    contractions = corpus.count("'")
    exclamations = corpus.count("!")

    return StyleProfile(
        tone=_tone(contractions / max(n_words, 1), exclamations, avg_sentence_len),
        length=_length(n_words / n_letters),
        word_count=round(n_words / n_letters),
        opening_style=_opening_style(texts),
        pronoun_style=_pronoun_style(i_count, we_count),
        sentence_style=_sentence_style(avg_sentence_len, std_sentence),
    )


def build_style_guide(style: StyleProfile) -> str:
    """Render a StyleProfile into a compact instruction block for the prompt."""
    return (
        "Match the applicant's own writing voice:\n"
        f"- Tone: {style.tone}\n"
        f"- Sentences: {style.sentence_style}\n"
        f"- Pronouns: {style.pronoun_style}\n"
        f"- Typical length: {style.length} (~{style.word_count} words)\n"
        f"- Opening habit: {style.opening_style}"
    )


def retrieve_exemplars(query_text: str, k: int = 2) -> list[str]:
    """Return the user's past passages most relevant to the target job. []-safe."""
    if not embeddings.available() or not query_text.strip():
        return []
    try:
        vector = embeddings.embed_one(query_text)
        hits = vs.query(_COLLECTION, vector, n_results=k, where={"type": "past"})
    except Exception:  # noqa: BLE001 — retrieval is optional; never break generation
        return []
    return [h["document"] for h in hits if h.get("document")]


def style_context(query_text: str) -> dict[str, Any]:
    """Assemble the voice block for generation: metric guide + relevant exemplars."""
    style = _stored_style() or analyze(_sample_texts())
    guide = build_style_guide(style) if style else None
    exemplars = retrieve_exemplars(query_text)
    return {"has_style": bool(guide or exemplars), "guide": guide, "exemplars": exemplars}


# ─────────────────────────────────────────────────────────────
#  Internals
# ─────────────────────────────────────────────────────────────

def _index_exemplars(letters: list[dict]) -> int:
    """Chunk past letters into passages, embed locally, and store in the collection."""
    vs.delete_where(_COLLECTION, {"type": "past"})
    ids, docs, metas = [], [], []
    for letter in letters:
        for i, chunk in enumerate(_chunks(letter.get("content") or "")):
            ids.append(f"past-{letter.get('id')}-{i}")
            docs.append(chunk)
            metas.append({"type": "past", "letter_id": letter.get("id")})
    if not docs:
        return 0
    vs.add(_COLLECTION, ids, docs, embeddings.embed(docs), metas)
    return len(docs)


def _chunks(content: str) -> list[str]:
    """Split a letter into paragraph-sized passages (fallback: the whole letter)."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", content) if len(p.strip()) >= _MIN_CHUNK]
    if paragraphs:
        return paragraphs
    trimmed = content.strip()
    return [trimmed] if len(trimmed) >= _MIN_CHUNK else []


def _sorted_letters() -> list[dict]:
    """Past letters, best-rated first (so the opening example is the strongest)."""
    return sorted(
        queries.list_all(_SAMPLE_TABLE),
        key=lambda r: ((r.get("user_rating") or 0), (r.get("ai_rating") or 0)),
        reverse=True,
    )


def _sample_texts() -> list[str]:
    return [r["content"] for r in _sorted_letters() if r.get("content")]


def _stored_style() -> StyleProfile | None:
    raw = (queries.get_profile() or {}).get("style_profile")
    if not raw:
        return None
    try:
        return StyleProfile(**raw)
    except Exception:  # noqa: BLE001 — a malformed stored profile just means "recompute"
        return None


def _save_style_profile(style: StyleProfile) -> None:
    profile = queries.get_profile() or {}
    profile["style_profile"] = style.model_dump(mode="json")
    queries.save_profile(profile)


def _tone(contraction_ratio: float, exclamations: int, avg_sentence_len: float) -> str:
    if contraction_ratio > 0.015 or exclamations > 0:
        return "warm and conversational"
    if avg_sentence_len > 22:
        return "formal and measured"
    return "professional and direct"


def _length(avg_words: float) -> str:
    if avg_words < 180:
        return "short"
    if avg_words < 320:
        return "medium"
    return "long"


def _sentence_style(avg_len: float, std: float) -> str:
    base = "short and punchy" if avg_len < 14 else "balanced" if avg_len < 22 else "long and detailed"
    return f"{base}, with varied rhythm" if std > 7 else base


def _pronoun_style(i_count: int, we_count: int) -> str:
    if i_count >= 2 * max(we_count, 1):
        return "first person singular (I)"
    if we_count > i_count:
        return "first person plural (we)"
    return "mixed first person"


def _opening_style(texts: list[str]) -> str:
    """Describe how the user's strongest letter opens."""
    if not texts:
        return "a direct, specific statement"
    first = re.split(r"(?<=[.!?])\s", texts[0].strip(), maxsplit=1)[0]
    if first.endswith("?"):
        return "opens with a question"
    if len(re.findall(r"\b[\w']+\b", first)) <= 8:
        return "opens with a short, punchy line"
    return "opens with a direct, specific statement"
