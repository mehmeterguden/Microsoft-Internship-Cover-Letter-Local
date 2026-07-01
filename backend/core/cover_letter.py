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

from collections.abc import Iterator
from typing import Any

from core import llm
from core.prompts.cover_letter import build_messages
from core.research.orchestrator import _cache_key
from db import queries

_MAX_PROFILE_CHARS = 3500


def stream(
    company_name: str,
    role_title: str | None = None,
    job_description: str | None = None,
    tone: str = "professional",
) -> Iterator[dict[str, Any]]:
    """Yield generation events: one `start`, many `token`, then `done`.

    Raises nothing for missing data (a thin profile still produces a letter); a
    provider failure propagates to the caller, which turns it into a `fatal` event.
    """
    profile_context, has_profile = _load_profile_context()
    research_context = _load_research_context(company_name, role_title)

    messages = build_messages(
        profile_context, company_name, role_title, job_description, research_context, tone
    )

    yield {
        "type": "start",
        "has_profile": has_profile,
        "used_research": research_context is not None,
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
