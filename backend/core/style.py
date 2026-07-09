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
import time
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
_ANALYSIS_MAX_TOKENS = 4096   # headroom for the full voice JSON so it can't truncate mid-object
_ANALYSIS_ATTEMPTS = 3        # retry transient model/parse failures before giving up
_ANALYSIS_BACKOFF = 2.0       # seconds; grows per attempt so a demand spike can clear


class VoiceAnalysisError(RuntimeError):
    """The deep LLM voice analysis couldn't be produced (model error, or a reply we
    couldn't parse) after retries. Distinct from "ran fine, but the samples were too
    thin" — that is a normal result carried by `enough_signal=False`.

    `reasons` propagates the provider's failure reasons (e.g. {"unavailable"}) so the
    caller can decide whether to suggest switching model."""

    def __init__(self, message: str, *, reasons: set[str] | None = None) -> None:
        super().__init__(message)
        self.reasons: set[str] = reasons or set()

_VOICE_FIELDS = {
    "enough_signal", "tagline", "summary", "self_presentation", "tone", "formality",
    "strengths", "themes", "signature_phrases", "vocabulary", "sentence_patterns",
    "rhetorical_moves", "structure", "emphasis", "opening_habits", "closing_habits",
    "example_sentences", "avoid",
}


# ─────────────────────────────────────────────────────────────
#  Public API
# ─────────────────────────────────────────────────────────────

def learn() -> dict[str, Any]:
    """Analyze past letters (metrics + deep LLM voice), store, and (re)index exemplars.

    If the deep analysis fails (a transient model error), we do NOT silently persist a
    thin, metrics-only profile over a good one — we keep the existing deep profile and
    report `analysis_failed` so the UI can ask the user to try again."""
    letters = _sorted_letters()
    texts = [row["content"] for row in letters if row.get("content")]
    corpus = "\n\n---\n\n".join(t.strip() for t in texts if t and t.strip())

    voice: VoiceProfile | None = None
    llm_ok = False
    error: str | None = None
    reasons: set[str] = set()
    if corpus:
        fields = _metrics(corpus, texts)
        try:
            deep = _llm_voice(corpus, len(texts))
        except VoiceAnalysisError as exc:
            deep = {}
            error = str(exc)
            reasons = exc.reasons
        if deep:
            fields.update(deep)
            fields["llm_analyzed"] = True
            llm_ok = True
        voice = VoiceProfile(**fields)

    # Never downgrade a previously-learned deep profile because of a transient failure.
    existing = _stored_voice()
    keep_existing = not llm_ok and existing is not None and existing.llm_analyzed
    stored = existing if keep_existing else voice
    if voice is not None and not keep_existing:
        _save_voice(voice)

    chunks, used_embeddings = 0, False
    if texts and embeddings.available():
        try:
            chunks = _index_exemplars(letters)
            used_embeddings = True
        except Exception:  # noqa: BLE001 — indexing is best-effort; the profile is still saved
            chunks = 0

    settings = queries.get_settings()
    # Switching model only helps when the model itself is the blocker (busy/unavailable),
    # not when the keys are quota-exhausted or rejected.
    suggest_model_switch = settings.get("llm_provider") == "gemini" and "unavailable" in reasons

    return {
        "samples": len(texts),
        "chunks_indexed": chunks,
        "embeddings": used_embeddings,
        "llm_analyzed": bool(stored and stored.llm_analyzed),
        "analysis_failed": bool(corpus) and not llm_ok,
        "error": error,
        "failure_reasons": sorted(reasons),
        "suggest_model_switch": suggest_model_switch,
        "model": settings.get("llm_model"),
        "provider": settings.get("llm_provider"),
        "style_profile": stored.model_dump(mode="json") if stored else None,
    }


def analyze(texts: list[str]) -> VoiceProfile | None:
    """Compute a VoiceProfile: local metrics + a deep LLM voice analysis. None if no text."""
    corpus = "\n\n---\n\n".join(t.strip() for t in texts if t and t.strip())
    if not corpus:
        return None

    fields: dict[str, Any] = _metrics(corpus, texts)
    try:
        voice = _llm_voice(corpus, len([t for t in texts if t and t.strip()]))
    except VoiceAnalysisError:  # generation path: degrade to metrics only, never break
        voice = {}
    if voice:
        fields.update(voice)
        fields["llm_analyzed"] = True
    return VoiceProfile(**fields)


def build_voice_guide(v: VoiceProfile) -> str:
    """Render a VoiceProfile into a rich, imitation-grade instruction block."""
    # No trustworthy voice was learned (thin/gibberish samples) — don't fake one.
    if not v.enough_signal or (v.llm_analyzed and not v.summary):
        return ""
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
    """Reverse-engineer the voice with the LLM.

    Retries a few times on a transient model error or an unparseable reply (a later
    attempt nudges the temperature so a deterministic parse failure can differ).
    Raises `VoiceAnalysisError` if every attempt fails — callers decide whether that
    is fatal (explicit "Learn my voice") or a soft fallback (letter generation)."""
    messages = build_analysis_messages(corpus[:_CORPUS_CAP], count)
    last_error: Exception | None = None
    for attempt in range(_ANALYSIS_ATTEMPTS):
        try:
            raw = llm.complete(messages, temperature=0.0 if attempt == 0 else 0.3, max_tokens=_ANALYSIS_MAX_TOKENS)
            data = json.loads(_extract_json(raw))
        except Exception as exc:  # noqa: BLE001 — retry transient model/parse errors
            last_error = exc
            if attempt < _ANALYSIS_ATTEMPTS - 1:
                time.sleep(_ANALYSIS_BACKOFF * (attempt + 1))
            continue
        # Keep truthy fields; always keep enough_signal (a real False must survive).
        out = {k: v for k, v in data.items() if k in _VOICE_FIELDS and (v or k == "enough_signal")}
        out["enough_signal"] = bool(data.get("enough_signal", True))
        return out
    raise VoiceAnalysisError(
        f"Voice analysis failed after {_ANALYSIS_ATTEMPTS} attempts: "
        f"{type(last_error).__name__}: {last_error}",
        reasons=getattr(last_error, "reasons", None),
    )


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
