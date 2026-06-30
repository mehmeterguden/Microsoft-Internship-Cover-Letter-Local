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


def structure(cv_text: str) -> dict[str, Any]:
    """Run the LLM and validate its output.

    Returns a dict that always includes `raw_output` (what the model said). On
    success `ok` is True and `structured` holds the validated data; on a parse or
    validation failure `ok` is False and `error` explains why. Raises only if the
    LLM call itself fails (caller maps that to a 503).
    """
    raw = llm.complete(build_messages(cv_text), temperature=0.0, max_tokens=4096)
    try:
        data = json.loads(_extract_json(raw))
        structured = CVExtraction(**data)
    except (ValueError, json.JSONDecodeError, ValidationError) as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}", "raw_output": raw}
    return {"ok": True, "structured": structured.model_dump(mode="json"), "raw_output": raw}
