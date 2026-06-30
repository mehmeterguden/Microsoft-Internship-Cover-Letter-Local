"""Analyze fetched GitHub repos (with their READMEs) into reusable context via the LLM.

Repos are analyzed in small batches (to stay within local-model context limits),
results are merged back onto each repo, and skills are aggregated and deduplicated.
Returns GithubRepo-shaped dicts (summary → description, plus refined technologies,
contribution, involvement_rating, and the stored README) and a flat skills list.
"""

from __future__ import annotations

import json
import time
from typing import Any

from core import llm
from core.cv_structuring import _extract_json
from core.prompts.github import build_messages

CHUNK = 5            # repos analyzed per LLM call (keeps the prompt within context limits)
README_CAP = 1200    # README chars sent to the model
README_STORE = 8000  # README chars stored in the DB
RETRIES = 3          # transient provider errors (e.g. Gemini "503 high demand") are retried


def _complete_with_retry(messages: list[dict]) -> str:
    """Call the LLM, retrying a few times on transient errors (overload/timeouts)."""
    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            return llm.complete(messages, temperature=0.0, max_tokens=2048)
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


def analyze(repos: list[dict[str, Any]]) -> dict[str, Any]:
    """Analyze repos in batches; return enriched repos + a deduplicated skill list."""
    analyses: dict[str, dict] = {}
    skills_order: list[str] = []
    seen_skills: set[str] = set()
    last_error: Exception | None = None

    for start in range(0, len(repos), CHUNK):
        chunk = [
            {**r, "readme": (r.get("readme") or "")[:README_CAP]}
            for r in repos[start : start + CHUNK]
        ]
        try:
            raw = _complete_with_retry(build_messages(chunk))
            data = json.loads(_extract_json(raw))
        except Exception as exc:  # noqa: BLE001 — remember it; skip the batch, keep the rest
            last_error = exc
            continue
        for item in data.get("repos", []):
            if item.get("repo_name"):
                analyses[str(item["repo_name"]).strip().lower()] = item
        for skill in data.get("skills", []):
            key = str(skill).strip().lower()
            if skill and key not in seen_skills:
                seen_skills.add(key)
                skills_order.append(str(skill).strip())

    # If every batch failed (e.g. quota exhausted), surface the error instead of
    # silently returning repos with no analysis.
    if not analyses and last_error is not None:
        raise last_error

    enriched = []
    for r in repos:
        a = analyses.get((r.get("repo_name") or "").strip().lower(), {})
        enriched.append({
            "repo_name": r.get("repo_name"),
            "url": r.get("url"),
            "stars": r.get("stars"),
            "last_updated": r.get("last_updated"),
            "technologies": a.get("technologies") or r.get("technologies") or [],
            "description": a.get("summary") or r.get("description"),
            "contribution": a.get("contribution"),
            "involvement_rating": _clamp_rating(a.get("involvement")),
            "readme": (r.get("readme") or "")[:README_STORE] or None,
        })

    return {"repos": enriched, "skills": skills_order}
