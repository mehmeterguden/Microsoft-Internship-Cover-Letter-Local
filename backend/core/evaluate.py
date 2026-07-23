"""Quality scoring for a generated cover letter — an LLM-as-judge pass.

A second model reads the finished letter and grades it against a fixed rubric
(persuasion, personalization, tone, language, length), each 0–100, plus a short
rationale. The overall score is the mean of the rubric dimensions — derived in
code, never a separately-hallucinated number, so it always agrees with the
breakdown the user sees.

The judgment goes through `core.structured_output`, so a malformed reply is
repaired (or reported) rather than crashing the request — the whole point of the
robust-output work. Same provider/privacy rules as generation apply: the letter
reaches an LLM only through the provider the user chose.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from core import structured_output as so
from core.llm.base import Message
from models import Score

_MAX_LETTER_CHARS = 8000
_MAX_TOKENS = 1024

# The rubric is fixed so scores are comparable across letters. Each entry is
# (name, what a high score means) — the description is injected into the prompt.
RUBRIC: list[tuple[str, str]] = [
    ("persuasion", "Makes a compelling, specific case with concrete evidence — not generic claims."),
    ("personalization", "Tailored to THIS company and role; would not fit any other application."),
    ("tone", "Confident and human, appropriate for the role — neither arrogant nor groveling."),
    ("language", "Clear, fluent, grammatical prose, free of AI-slop clichés and filler."),
    ("length", "Well-judged length and density (roughly 250–350 words); every sentence earns its place."),
]
_RUBRIC_NAMES = [name for name, _ in RUBRIC]


class RubricScore(BaseModel):
    """One rubric dimension's score."""

    name: str
    score: Score


class Evaluation(BaseModel):
    """The judge's raw output — per-dimension scores plus a short rationale.

    `score` is filled in by `evaluate` (the mean of the breakdown), not by the model."""

    breakdown: list[RubricScore] = Field(default_factory=list)
    rationale: str = ""
    score: Score = 0


def _build_messages(text: str, company: str | None, role: str | None) -> list[Message]:
    rubric_lines = "\n".join(f"- {name}: {desc}" for name, desc in RUBRIC)
    system = (
        "You are an exacting evaluator of job-application cover letters, calibrated like a "
        "senior hiring manager who reads hundreds of them. Grade the letter honestly and "
        "critically — reserve scores above 85 for genuinely excellent writing, and do not "
        "inflate.\n\n"
        "Score each rubric dimension from 0 to 100:\n"
        f"{rubric_lines}\n\n"
        "Then write a rationale: one to three sentences, concrete and actionable, naming the "
        "strongest and weakest aspects.\n\n"
        "Return ONLY a JSON object of this exact shape — no prose, no markdown, no code fences:\n"
        '{"breakdown": [{"name": "persuasion", "score": 0}, {"name": "personalization", "score": 0}, '
        '{"name": "tone", "score": 0}, {"name": "language", "score": 0}, {"name": "length", "score": 0}], '
        '"rationale": "..."}'
    )
    header = []
    if company:
        header.append(f"Target company: {company}")
    if role:
        header.append(f"Target role: {role}")
    user = "\n".join(
        [
            *header,
            "",
            "Cover letter to evaluate:",
            text.strip()[:_MAX_LETTER_CHARS],
        ]
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _normalize(data: dict[str, Any]) -> dict[str, Any]:
    """Coerce the judge's reply toward the rubric: keep known dimensions, clamp scores."""
    raw = {
        item.get("name", "").strip().lower(): item.get("score")
        for item in data.get("breakdown", [])
        if isinstance(item, dict)
    }
    breakdown = [{"name": name, "score": _clamp(raw.get(name))} for name in _RUBRIC_NAMES if name in raw]
    return {"breakdown": breakdown, "rationale": str(data.get("rationale") or "").strip()}


def _clamp(value: Any) -> int:
    try:
        return max(0, min(100, round(float(value))))
    except (TypeError, ValueError):
        return 0


def evaluate(text: str, company: str | None = None, role: str | None = None) -> dict[str, Any]:
    """Score a cover letter against the rubric. Returns {score, breakdown, rationale}.

    Raises `ValueError` only if the model can't produce a usable judgment even after a
    repair retry (surfaced by the API as a classified error — never a raw crash)."""
    messages = _build_messages(text, company, role)
    result = so.structure(
        messages, Evaluation, normalize=_normalize, temperature=0.0, max_tokens=_MAX_TOKENS
    )
    if not result.ok or result.value is None:
        raise ValueError(f"The evaluator returned an unreadable response: {result.error}")

    evaluation = result.value
    breakdown = [{"name": item.name, "score": item.score} for item in evaluation.breakdown]
    if not breakdown:
        raise ValueError("The evaluator returned no rubric scores.")

    overall = round(sum(item["score"] for item in breakdown) / len(breakdown))
    return {"score": overall, "breakdown": breakdown, "rationale": evaluation.rationale}
