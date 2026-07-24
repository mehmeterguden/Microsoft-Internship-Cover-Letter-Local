"""Groundedness verification — the always-on truth check for a generated letter.

After a cover letter is written, we run a SECOND LLM pass that audits every
concrete claim against the ONLY things we actually know about the applicant
(their local profile + the cached company research). It returns a per-claim
verdict (supported / partly / unsupported) so the UI can show whether the letter
is grounded and which lines need a look. A companion `revise_stream` rewrites the
letter to fix only the flagged claims.

Both use the same pluggable provider as generation, so this works fully locally
(Foundry Local / Ollama). The audit streams real tokens (never faked) to drive a
live progress indicator; the structured verdict is parsed from the completed
reply. Grounding context is reused from `core.cover_letter` so the audit sees
exactly what generation saw.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from core import llm
from core.cover_letter import _load_profile_context, _load_research_context
from core.prompts.verification import build_revise_messages, build_verify_messages

_LEVELS = {"supported", "partly", "unsupported"}


def _extract_json(text: str) -> str:
    """Pull the JSON object out of the model's reply (tolerates fences/prose)."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in the model output.")
    return text[start : end + 1]


def _grounding(company_name: str, role_title: str | None) -> tuple[str, str | None]:
    """The same profile + research context that generation was grounded in."""
    profile_context, _ = _load_profile_context()
    research_context = _load_research_context(company_name, role_title)
    return profile_context, research_context


def _normalize(data: dict[str, Any]) -> dict[str, Any]:
    """Coerce the audit output into the shape the frontend expects."""
    raw_claims = data.get("claims") if isinstance(data.get("claims"), list) else []
    claims: list[dict[str, Any]] = []
    for c in raw_claims:
        if not isinstance(c, dict) or not (c.get("text") or "").strip():
            continue
        status = c.get("status") if c.get("status") in _LEVELS else "partly"
        claims.append({
            "text": c["text"].strip(),
            "status": status,
            "note": (c.get("note") or "").strip(),
            "suggestion": (c.get("suggestion") or c.get("note") or "").strip(),
        })

    has_unsupported = any(c["status"] == "unsupported" for c in claims)
    partly = sum(1 for c in claims if c["status"] == "partly")
    verdict = data.get("verdict")
    if verdict not in {"grounded", "review"}:
        verdict = "review" if (has_unsupported or partly >= 2) else "grounded"

    summary = (data.get("summary") or "").strip()
    if not summary:
        flagged = sum(1 for c in claims if c["status"] != "supported")
        summary = "Everything checks out against your profile." if flagged == 0 \
            else f"{flagged} claim{'s' if flagged != 1 else ''} may not be backed by your profile — worth a look."
    return {"verdict": verdict, "summary": summary, "claims": claims}


def verify_stream(letter: str, company_name: str, role_title: str | None = None) -> Iterator[dict[str, Any]]:
    """Audit a letter's groundedness. Yields `start`, `token` (progress), then `done`.

    `done` carries {verdict: grounded|review|error, summary, claims:[{text,status,note}]}.
    A provider failure propagates to the caller (turned into a `fatal` event).
    """
    if not letter.strip():
        yield {"type": "done", "verdict": "grounded", "summary": "Nothing to check yet.", "claims": []}
        return

    profile_context, research_context = _grounding(company_name, role_title)
    messages = build_verify_messages(letter, profile_context, research_context)

    yield {"type": "start", "has_profile": bool(profile_context), "used_research": research_context is not None}
    parts: list[str] = []
    for token in llm.stream(messages, temperature=0.0):
        if token:
            parts.append(token)
            yield {"type": "token", "text": token}

    raw = "".join(parts)
    try:
        result = _normalize(json.loads(_extract_json(raw)))
    except (ValueError, json.JSONDecodeError):
        yield {"type": "done", "verdict": "error", "summary": "The automatic check couldn't be parsed — review the letter yourself.", "claims": []}
        return
    yield {"type": "done", **result}


def revise_stream(
    letter: str, company_name: str, role_title: str | None, flagged: list[dict]
) -> Iterator[dict[str, Any]]:
    """Rewrite the letter to fix only the flagged claims. Yields `token`s then `done`."""
    profile_context, research_context = _grounding(company_name, role_title)
    messages = build_revise_messages(letter, profile_context, research_context, flagged or [])

    yield {"type": "start"}
    parts: list[str] = []
    for token in llm.stream(messages, temperature=0.3):
        if token:
            parts.append(token)
            yield {"type": "token", "text": token}
    yield {"type": "done", "text": "".join(parts).strip()}
