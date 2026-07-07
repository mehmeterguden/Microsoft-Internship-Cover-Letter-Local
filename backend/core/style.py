"""Writing-style learning — build a deep, reproducible fingerprint of the user's voice.

Three layers, so a generated letter reads as if the applicant wrote it:

  1. Local METRICS (always available, no model): length, sentence rhythm, pronouns.
  2. A deep LLM VOICE ANALYSIS over their past letters: how they present themselves,
     the exact phrases and words they reuse, how they build an argument, what they
     emphasize, what they never do (see `core/prompts/voice.py`).
  3. EXEMPLARS: their letters chunked + embedded locally so generation can retrieve
     the passages most relevant to the target job and mirror them verbatim in style.

The metrics and embeddings stay on the machine. The deep analysis and the exemplars
reach an LLM (the analysis pass; and, later, the generation prompt) only through the
provider the user chose — the same opt-in that applies to their profile.
"""

from __future__ import annotations

import json
import re
import statistics
from typing import Any

from core import embeddings, llm
from core import vector_store as vs
from core.prompts.voice import build_analysis_messages
from db import queries
from models import VoiceProfile

_SAMPLE_TABLE = "past_cover_letters"
_COLLECTION = vs.COVER_LETTERS
_MIN_CHUNK = 40
_CORPUS_CAP = 18000   # include all letters; a handful of cover letters fits comfortably

_VOICE_FIELDS = {
    "summary", "self_presentation", "tone", "formality", "strengths", "themes",
    "signature_phrases", "vocabulary", "sentence_patterns", "rhetorical_moves",
    "structure", "emphasis", "opening_habits", "closing_habits", "example_sentences",
    "avoid",
}


# ─────────────────────────────────────────────────────────────
#  Public API
# ─────────────────────────────────────────────────────────────

def learn() -> dict[str, Any]:
    """Analyze past letters (metrics + deep LLM voice), store, and (re)index exemplars."""
    letters = _sorted_letters()
    texts = [row["content"] for row in letters if row.get("content")]

    voice = analyze(texts)
    if voice is not None:
        _save_voice(voice)

    chunks, used_embeddings = 0, False
    if texts and embeddings.available():
        try:
            chunks = _index_exemplars(letters)
            used_embeddings = True
        except Exception:  # noqa: BLE001 — indexing is best-effort; the profile is still saved
            chunks = 0

    return {
        "samples": len(texts),
        "chunks_indexed": chunks,
        "embeddings": used_embeddings,
        "llm_analyzed": bool(voice and voice.llm_analyzed),
        "style_profile": voice.model_dump() if voice else None,
    }


def analyze(texts: list[str]) -> VoiceProfile | None:
    """Compute a VoiceProfile: local metrics + a deep LLM voice analysis. None if no text."""
    corpus = "\n\n---\n\n".join(t.strip() for t in texts if t and t.strip())
    if not corpus:
        return None

    fields: dict[str, Any] = _metrics(corpus, texts)
    voice = _llm_voice(corpus, len([t for t in texts if t and t.strip()]))
    if voice:
        fields.update(voice)
        fields["llm_analyzed"] = True
    return VoiceProfile(**fields)


def build_voice_guide(v: VoiceProfile) -> str:
    """Render a VoiceProfile into a rich, imitation-grade instruction block."""
    lines = ["Write this letter EXACTLY as this specific person writes — it must be "
             "indistinguishable from something they wrote themselves.", ""]

    if v.summary:
        lines.append(f"Who they are as a writer: {v.summary}")
    if v.self_presentation:
        lines.append(f"How they present themselves: {v.self_presentation}")
    if v.tone:
        lines.append(f"Tone: {v.tone}")
    if v.formality:
        lines.append(f"Formality: {v.formality}")
    if v.structure:
        lines.append(f"How they structure a letter: {v.structure}")
    if v.themes:
        lines.append("Themes they return to: " + ", ".join(v.themes))
    if v.strengths:
        lines.append("Strengths they foreground: " + ", ".join(v.strengths))
    if v.sentence_patterns:
        lines.append(f"Sentence patterns: {v.sentence_patterns}")
    elif v.sentence_style:
        lines.append(f"Sentences: {v.sentence_style}")
    if v.rhetorical_moves:
        lines.append(f"How they build an argument: {v.rhetorical_moves}")
    if v.opening_habits:
        lines.append(f"They open like: {v.opening_habits}")
    if v.closing_habits:
        lines.append(f"They close like: {v.closing_habits}")
    if v.pronoun_style:
        lines.append(f"Pronouns: {v.pronoun_style}")
    if v.length:
        lines.append(f"Typical length: {v.length}" + (f" (~{v.word_count} words)" if v.word_count else ""))
    if v.emphasis:
        lines.append("They consistently emphasize: " + ", ".join(v.emphasis))
    if v.vocabulary:
        lines.append("Favor their vocabulary where natural: " + ", ".join(v.vocabulary))
    if v.signature_phrases:
        lines.append("Reuse their signature phrasing where it fits (adapt, don't force): "
                     + "; ".join(f'"{p}"' for p in v.signature_phrases))
    if v.example_sentences:
        lines.append("Echo the rhythm/voice of these real sentences of theirs (don't copy verbatim): "
                     + " | ".join(v.example_sentences))
    if v.avoid:
        lines.append("Never use (they wouldn't): " + ", ".join(v.avoid))

    return "\n".join(lines)


def retrieve_exemplars(query_text: str, k: int = 3) -> list[str]:
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
    """Assemble the voice block for generation: deep guide + relevant exemplars."""
    voice = _stored_voice() or analyze(_sample_texts())
    guide = build_voice_guide(voice) if voice else None
    exemplars = retrieve_exemplars(query_text)
    return {"has_style": bool(guide or exemplars), "guide": guide, "exemplars": exemplars}


# ─────────────────────────────────────────────────────────────
#  Deep analysis (LLM)
# ─────────────────────────────────────────────────────────────

def _llm_voice(corpus: str, count: int = 0) -> dict[str, Any]:
    """Reverse-engineer the voice with the LLM. Returns {} if unavailable/malformed."""
    try:
        raw = llm.complete(build_analysis_messages(corpus[:_CORPUS_CAP], count), temperature=0.0, max_tokens=2600)
        data = json.loads(_extract_json(raw))
    except Exception:  # noqa: BLE001 — deep analysis is optional; fall back to metrics only
        return {}
    return {k: v for k, v in data.items() if k in _VOICE_FIELDS and v}


def _extract_json(text: str) -> str:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("no JSON object in reply")
    return text[start : end + 1]


# ─────────────────────────────────────────────────────────────
#  Local metrics
# ─────────────────────────────────────────────────────────────

def _metrics(corpus: str, texts: list[str]) -> dict[str, Any]:
    words = re.findall(r"\b[\w']+\b", corpus)
    sentences = [s for s in re.split(r"[.!?]+", corpus) if s.strip()]
    n_words, n_sentences, n_letters = len(words), max(len(sentences), 1), max(len(texts), 1)

    sentence_lengths = [len(re.findall(r"\b[\w']+\b", s)) for s in sentences] or [0]
    avg_sentence_len = n_words / n_sentences
    std = statistics.pstdev(sentence_lengths) if len(sentence_lengths) > 1 else 0.0

    i_count = len(re.findall(r"\bI\b", corpus))
    we_count = len(re.findall(r"\bwe\b", corpus, re.I))
    contractions = corpus.count("'")
    exclamations = corpus.count("!")

    return {
        "word_count": round(n_words / n_letters),
        "length": _length(n_words / n_letters),
        "sentence_style": _sentence_style(avg_sentence_len, std),
        "pronoun_style": _pronoun_style(i_count, we_count),
        "tone": _tone(contractions / max(n_words, 1), exclamations, avg_sentence_len),  # fallback tone
    }


# ─────────────────────────────────────────────────────────────
#  Exemplar indexing + storage
# ─────────────────────────────────────────────────────────────

def _index_exemplars(letters: list[dict]) -> int:
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
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", content) if len(p.strip()) >= _MIN_CHUNK]
    if paragraphs:
        return paragraphs
    trimmed = content.strip()
    return [trimmed] if len(trimmed) >= _MIN_CHUNK else []


def _sorted_letters() -> list[dict]:
    return sorted(
        queries.list_all(_SAMPLE_TABLE),
        key=lambda r: ((r.get("user_rating") or 0), (r.get("ai_rating") or 0)),
        reverse=True,
    )


def _sample_texts() -> list[str]:
    return [r["content"] for r in _sorted_letters() if r.get("content")]


def _stored_voice() -> VoiceProfile | None:
    raw = (queries.get_profile() or {}).get("style_profile")
    if not raw:
        return None
    try:
        return VoiceProfile(**raw)
    except Exception:  # noqa: BLE001 — a malformed/legacy stored profile means "recompute"
        return None


def _save_voice(voice: VoiceProfile) -> None:
    profile = queries.get_profile() or {}
    profile["style_profile"] = voice.model_dump(mode="json")
    queries.save_profile(profile)


def _length(avg_words: float) -> str:
    return "short" if avg_words < 180 else "medium" if avg_words < 320 else "long"


def _sentence_style(avg_len: float, std: float) -> str:
    base = "short and punchy" if avg_len < 14 else "balanced" if avg_len < 22 else "long and detailed"
    return f"{base}, with varied rhythm" if std > 7 else base


def _pronoun_style(i_count: int, we_count: int) -> str:
    if i_count >= 2 * max(we_count, 1):
        return "first person singular (I)"
    if we_count > i_count:
        return "first person plural (we)"
    return "mixed first person"


def _tone(contraction_ratio: float, exclamations: int, avg_sentence_len: float) -> str:
    if contraction_ratio > 0.015 or exclamations > 0:
        return "warm and conversational"
    if avg_sentence_len > 22:
        return "formal and measured"
    return "professional and direct"
