"""Streaming cover-letter generation — the bridge from research to a real letter.

Pulls the applicant's profile (local) and, when available, the cached company
research report (fit + ammo + values + mission) produced by the intelligence
engine, builds the prompt, and streams the letter token by token from the
configured LLM. The streaming is real — tokens come straight from the provider
as it generates (never faked), per the project's hard rule.

Privacy note: this prompt contains the CV/profile and goes to whatever provider
is selected. Local providers (Foundry Local, Ollama) keep it on the machine; a
cloud provider is only ever used because the user explicitly chose one in
settings — the documented opt-in.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from core import llm, style
from core.prompts.cover_letter import (
    build_messages,
    build_review_messages,
    build_tailoring_questions_messages,
)
from core.research.orchestrator import _cache_key
from db import queries

_MAX_PROFILE_CHARS = 3500


def generate_tailoring_questions(
    company_name: str,
    role_title: str | None = None,
    job_description: str | None = None,
    count: int = 3,
    focus: str = "all",
) -> list[dict[str, Any]]:
    """Generate targeted, job-specific tailoring questions using LLM."""
    profile_context, _ = _load_profile_context()
    research_context = _load_research_context(company_name, role_title)

    target_count = max(1, min(10, count))
    messages = build_tailoring_questions_messages(
        profile_context, company_name, role_title, job_description, research_context,
        count=target_count, focus=focus,
    )

    try:
        raw = llm.chat(messages, temperature=0.7, json_mode=True)
        data = json.loads(raw)
        questions = data.get("questions") if isinstance(data, dict) else []
        if isinstance(questions, list) and questions:
            return questions[:target_count]
    except Exception:  # noqa: BLE001
        pass

    # Fallback questions if LLM call fails or returns empty
    return [
        {
            "id": "q1",
            "question": f"What specific achievement or project makes you a great fit for {company_name}?",
            "context": f"Connect your past experience directly to {company_name}'s mission.",
            "placeholder": "e.g. Led a team of 4 to refactor legacy backend, reducing latency by 40%...",
        },
        {
            "id": "q2",
            "question": f"Why are you particularly interested in the {role_title or 'this'} role right now?",
            "context": "Shows genuine motivation and alignment beyond a standard job application.",
            "placeholder": "e.g. I have been following the company's recent work on...",
        },
        {
            "id": "q3",
            "question": "Is there a key technical skill or leadership experience you want highlighted?",
            "context": "Ensures your highest-impact skill takes center stage in the letter.",
            "placeholder": "e.g. Deep expertise in distributed systems and Rust...",
        },
    ]


def stream(
    company_name: str,
    role_title: str | None = None,
    job_description: str | None = None,
    tone: str = "professional",
    length: str = "standard",
    tailoring_answers: dict[str, str] | None = None,
) -> Iterator[dict[str, Any]]:
    """Yield generation events: one `start`, many `token`, then `done`.

    Raises nothing for missing data (a thin profile still produces a letter); a
    provider failure propagates to the caller, which turns it into a `fatal` event.
    """
    profile_context, has_profile = _load_profile_context()
    research_context = _load_research_context(company_name, role_title)
    voice = style.style_context(f"{role_title or ''} at {company_name}. {job_description or ''}")

    messages = build_messages(
        profile_context, company_name, role_title, job_description, research_context, tone,
        length=length,
        style_guide=voice["guide"], style_exemplars=voice["exemplars"],
        tailoring_answers=tailoring_answers,
    )

    yield {
        "type": "start",
        "has_profile": has_profile,
        "used_research": research_context is not None,
        "used_style": voice["has_style"],
        "voice_samples": len(voice["exemplars"]),
        "tone": tone if tone in {"professional", "warm", "confident", "concise"} else "professional",
    }

    words = 0
    for token in llm.stream(messages, temperature=0.7):
        if token:
            words += token.count(" ")
            yield {"type": "token", "text": token}
    yield {"type": "done", "approx_words": words}


# ─────────────────────────────────────────────────────────────
#  Context assembly (all local)
# ─────────────────────────────────────────────────────────────

def _load_profile_context() -> tuple[str, bool]:
    """Build a compact profile block from the local DB. Returns (text, has_profile)."""
    profile = queries.get_profile() or {}
    skills = queries.list_all("skills")
    experiences = queries.list_all("experiences")
    projects = queries.list_all("projects")
    repos = queries.list_all("github_repos")

    has_profile = bool(profile.get("name") or skills or experiences)
    if not has_profile:
        return "", False

    lines: list[str] = []
    name = " ".join(p for p in (profile.get("name"), profile.get("surname")) if p)
    if name:
        lines.append(f"Name: {name}")
    if profile.get("summary"):
        lines.append(f"Summary: {profile['summary']}")

    if skills:
        top = sorted(skills, key=lambda s: (s.get("self_rating") or 0), reverse=True)[:20]
        lines.append("Skills: " + ", ".join(s["name"] for s in top if s.get("name")))

    if experiences:
        lines.append("Experience:")
        for e in _recent(experiences)[:4]:
            span = _span(e)
            desc = (e.get("description") or "").strip().replace("\n", " ")[:220]
            lines.append(f"- {e.get('title')} @ {e.get('company')}{span}" + (f" — {desc}" if desc else ""))

    if projects:
        lines.append("Projects:")
        for p in projects[:4]:
            desc = (p.get("description") or "").strip().replace("\n", " ")[:160]
            lines.append(f"- {p.get('name')}" + (f": {desc}" if desc else ""))

    if repos:
        top_repos = sorted(repos, key=lambda r: (r.get("stars") or 0), reverse=True)[:5]
        lines.append("GitHub: " + ", ".join(
            f"{r.get('repo_name')}" + (f" ({r.get('description')[:60]})" if r.get("description") else "")
            for r in top_repos if r.get("repo_name")
        ))

    return "\n".join(lines)[:_MAX_PROFILE_CHARS], True


def _load_research_context(company_name: str, role_title: str | None) -> str | None:
    """Pull mission, values, fit and letter hooks from a cached report, if any."""
    hit = queries.get_research(_cache_key(company_name, role_title))
    if hit is None:
        return None
    report = hit["report"]

    lines: list[str] = []
    mission = (report.get("overview") or {}).get("mission")
    if mission:
        lines.append(f"Mission: {mission}")

    values = [v.get("name") for v in report.get("values", []) if v.get("name")][:5]
    if values:
        lines.append("They value: " + ", ".join(values))

    fit = report.get("fit") or {}
    if fit.get("matched_skills"):
        lines.append("Your matched strengths: " + ", ".join(fit["matched_skills"][:6]))
    if fit.get("gaps"):
        lines.append("Gaps to frame gracefully (do not dwell): " + ", ".join(fit["gaps"][:4]))

    hooks = report.get("ammo", [])
    if hooks:
        lines.append("Letter hooks to weave in:")
        for h in hooks[:6]:
            lines.append(f"- {h.get('hook')}" + (f": {h.get('use_in_letter')}" if h.get("use_in_letter") else ""))

    return "\n".join(lines) if lines else None


def _recent(experiences: list[dict]) -> list[dict]:
    """Current roles first, then by start date descending."""
    return sorted(
        experiences,
        key=lambda e: (bool(e.get("is_current")), e.get("start_date") or ""),
        reverse=True,
    )


def _span(exp: dict) -> str:
    start, end = exp.get("start_date"), exp.get("end_date")
    if exp.get("is_current"):
        end = "present"
    if start or end:
        return f" ({start or '?'}–{end or '?'})"
    return ""


# ─────────────────────────────────────────────────────────────
#  Review pass — advisory, never blocks the letter
# ─────────────────────────────────────────────────────────────

def review(letter: str) -> list[dict[str, str]]:
    """Return specific, checkable claims in `letter` that the local profile does
    NOT clearly support, so the applicant can double-check before sending.

    This is advisory only — no score, no ranking. Never raises: returns [] on any
    provider or parse failure (a failed review must not block a finished letter).
    """
    letter = (letter or "").strip()
    if not letter:
        return []
    profile_context, _ = _load_profile_context()
    try:
        raw = llm.complete(build_review_messages(profile_context, letter), temperature=0.0)
        data = _parse_json_object(raw)
    except Exception:  # noqa: BLE001 — advisory only
        return []

    claims = data.get("claims") if isinstance(data, dict) else None
    if not isinstance(claims, list):
        return []
    out: list[dict[str, str]] = []
    for c in claims[:8]:
        if isinstance(c, dict) and c.get("text"):
            out.append({
                "text": str(c["text"])[:400],
                "reason": str(c.get("reason") or "")[:200],
                "suggestion": str(c.get("suggestion") or "")[:300],
            })
    return out


def _parse_json_object(raw: str) -> dict[str, Any]:
    """Extract the first JSON object from a model response (tolerates code fences)."""
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end > start:
        return json.loads(raw[start : end + 1])
    return {}


def inline_edit(
    selected_text: str,
    action: str = "regenerate",
    instruction: str | None = None,
    full_letter: str | None = None,
    company_name: str | None = None,
    role_title: str | None = None,
) -> str:
    """Perform an inline AI edit or answer a question on selected text in a cover letter."""
    selected_text = (selected_text or "").strip()
    if not selected_text:
        return ""

    if action == "regenerate":
        sys_prompt = (
            "You are a professional cover-letter editor. Rewrite the selected excerpt so it is clear, "
            "compelling, grounded, and polished. Output ONLY the rewritten text snippet itself, "
            "with no quotes, no markdown, and no extra preamble."
        )
        user_prompt = f"Selected text to rewrite:\n{selected_text}"
    elif action == "custom":
        sys_prompt = (
            "You are a professional cover-letter editor. Rewrite the selected excerpt according to the user's instruction. "
            "Output ONLY the revised text snippet itself, with no quotes, no markdown, and no extra preamble."
        )
        user_prompt = f"User instruction: {instruction or 'Improve this text'}\n\nSelected text:\n{selected_text}"
    elif action == "ask":
        sys_prompt = (
            "You are a helpful AI writing mentor for job applications. Answer the user's question concisely "
            "and constructively about the provided text snippet. Format your response in clean, human-readable "
            "natural language with bold section headers (e.g. **Short Answer:**, **Suggestions:**) and bullet points (- item) for lists. "
            "CRITICAL: Do NOT output raw JSON objects, stringified dictionaries, or code fence wrappers."
        )
        user_prompt = f"Question: {instruction or 'How can I improve this text?'}\n\nText snippet:\n{selected_text}"
    else:
        sys_prompt = "Rewrite the selected text concisely."
        user_prompt = selected_text

    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        res = llm.complete(messages, temperature=0.3)
        return res.strip().strip('"').strip("'")
    except Exception as exc:
        return f"Error: {exc}"

