"""Structure raw CV text into validated JSON using the configured LLM.

Pipeline: CV text → LLM (with the CV system prompt) → extract the JSON object from
the reply → parse → validate against `CVExtraction`. The LLM call itself can raise
(e.g. the model is unreachable); JSON/validation problems are returned in the
result so we can inspect what the model produced.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from core import llm
from core.prompts.cv import build_messages
from models import CVExtraction


def _extract_json(text: str) -> str:
    """Pull the JSON object out of the model's reply (tolerates fences/prose)."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in the model output.")
    return text[start : end + 1]


def _named_list(items: object, key: str = "name") -> object:
    """Coerce a list that may contain bare strings into [{key: str}, ...].

    Models sometimes return skills/languages as ["Python", ...] instead of
    [{"name": "Python"}, ...]. Wrap strings so they validate; leave dicts as-is.
    """
    if not isinstance(items, list):
        return items
    return [{key: it} if isinstance(it, str) else it for it in items]


def _normalize(data: dict[str, Any]) -> dict[str, Any]:
    """Smooth over common LLM shape deviations before validation."""
    if "skills" in data:
        data["skills"] = _named_list(data["skills"])
    if "languages" in data:
        data["languages"] = _named_list(data["languages"])
    return data


def structure(cv_text: str) -> dict[str, Any]:
    """Run the LLM and validate its output.

    Returns a dict that always includes `raw_output` (what the model said). On
    success `ok` is True and `structured` holds the validated data; on a parse or
    validation failure `ok` is False and `error` explains why. Raises only if the
    LLM call itself fails (caller maps that to a 503).
    """
    raw = llm.complete(build_messages(cv_text), temperature=0.0, max_tokens=4096)
    try:
        data = _normalize(json.loads(_extract_json(raw)))
        structured = CVExtraction(**data)
    except (ValueError, json.JSONDecodeError, ValidationError) as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}", "raw_output": raw}
    # `structured` is the validated clean data (confidence dropped by the models);
    # `data` is the parsed dict that still carries the per-item confidence scores.
    return {"ok": True, "structured": structured.model_dump(mode="json"), "data": data, "raw_output": raw}
