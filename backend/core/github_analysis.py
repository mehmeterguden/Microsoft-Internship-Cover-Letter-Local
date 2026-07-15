"""Analyze fetched GitHub repos (with their READMEs) into reusable context via the LLM.

Repos are analyzed in small batches (to stay within local-model context limits),
results are merged back onto each repo, and skills are aggregated and deduplicated.
Returns GithubRepo-shaped dicts (summary → description, plus refined technologies,
contribution, involvement_rating, and the stored README) and a flat skills list.
"""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from typing import Any

from core import llm
from core.cv_structuring import _extract_json
from core.prompts.github import build_messages

CHUNK = 4            # repos analyzed per LLM call (keeps the prompt within context limits)
README_CAP = 4000    # README chars sent to the model (deeper comprehension)
README_STORE = 8000  # README chars stored in the DB
RETRIES = 3          # transient provider errors (e.g. Gemini "503 high demand") are retried


def _complete_with_retry(messages: list[dict]) -> str:
    """Call the LLM, retrying a few times on transient errors (overload/timeouts)."""
    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            return llm.complete(messages, temperature=0.0, max_tokens=4096)
        except Exception as exc:  # noqa: BLE001 — retry any provider error
            last = exc
            time.sleep(2 * (attempt + 1))
    raise last  # type: ignore[misc]


def _clamp_rating(value: object) -> int | None:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return max(1, min(5, n))


def analyze_stream(repos: list[dict[str, Any]]) -> Iterator[dict[str, Any]]:
    """Analyze repos batch by batch, yielding real progress as each batch finishes.

    Yields ``{"type": "progress", "percent": int, "label": str}`` per batch and a
    final ``{"type": "result", "result": {...}}`` with enriched repos + skills.
    Raises only if *every* batch failed (so nothing useful came back).
    """
    analyses: dict[str, dict] = {}
    skill_display: dict[str, str] = {}   # key → first-seen display name
    skill_score: dict[str, int] = {}     # key → best score
    last_error: Exception | None = None

    starts = list(range(0, len(repos), CHUNK))
    total = max(1, len(starts))
    for idx, start in enumerate(starts):
        chunk = [
            {**r, "readme": (r.get("readme") or "")[:README_CAP]}
            for r in repos[start : start + CHUNK]
        ]
        names = ", ".join(str(r.get("repo_name") or "") for r in chunk if r.get("repo_name"))
        try:
            raw = _complete_with_retry(build_messages(chunk))
            data = json.loads(_extract_json(raw))
        except Exception as exc:  # noqa: BLE001 — remember it; skip the batch, keep the rest
            last_error = exc
            yield {"type": "progress", "percent": round((idx + 1) / total * 100),
                   "label": f"Batch {idx + 1}/{total} skipped (retrying later)"}
            continue
        for item in data.get("repos", []):
            if item.get("repo_name"):
                analyses[str(item["repo_name"]).strip().lower()] = item
        for skill in data.get("skills", []):
            name = (skill.get("name") if isinstance(skill, dict) else skill) or ""
            name = str(name).strip()
            if not name:
                continue
            score = _clamp_rating(skill.get("score") if isinstance(skill, dict) else None) or 3
            key = name.lower()
            skill_display.setdefault(key, name)
            skill_score[key] = max(skill_score.get(key, 0), score)
        yield {"type": "progress", "percent": round((idx + 1) / total * 100),
               "label": f"Analyzed {names}" if names else f"Batch {idx + 1}/{total}"}

    # If every batch failed (e.g. quota exhausted), surface the error instead of
    # silently returning repos with no analysis.
    if not analyses and last_error is not None:
        raise last_error

    enriched = []
    for r in repos:
        a = analyses.get((r.get("repo_name") or "").strip().lower(), {})
        highlights = a.get("highlights")
        enriched.append({
            "repo_name": r.get("repo_name"),
            "url": r.get("url"),
            "stars": r.get("stars"),
            "last_updated": r.get("last_updated"),
            "technologies": a.get("technologies") or r.get("technologies") or [],
            "description": a.get("summary") or r.get("description"),
            "purpose": a.get("purpose"),
            "highlights": [str(h) for h in highlights] if isinstance(highlights, list) else [],
            "contribution": a.get("contribution"),
            "involvement_rating": _clamp_rating(a.get("involvement")),
            "readme": (r.get("readme") or "")[:README_STORE] or None,
        })

    skills = [
        {"name": skill_display[k], "score": skill_score[k]}
        for k in sorted(skill_score, key=lambda k: -skill_score[k])
    ]
    yield {"type": "result", "result": {"repos": enriched, "skills": skills}}


def analyze(repos: list[dict[str, Any]]) -> dict[str, Any]:
    """Analyze repos in batches; return enriched repos + a deduplicated skill list.

    Non-streaming convenience wrapper — drains :func:`analyze_stream`.
    """
    result: dict[str, Any] = {"repos": [], "skills": []}
    for event in analyze_stream(repos):
        if event["type"] == "result":
            result = event["result"]
    return result
