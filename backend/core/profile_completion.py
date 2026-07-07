"""AI profile completion — find the gaps in a profile and help fill them.

The user has already imported material (a CV, GitHub repos). This module:

  1. `build_plan()` — deterministically finds what's still missing and returns an
     ordered list of typed steps (one gap each). No LLM; fast.
  2. `suggest_structured()` — one JSON call that proposes values for all the short
     factual / enumerated / list gaps at once (identity, spoken languages, skill
     categories & ratings, per-item enums & dates).
  3. `draft_stream()` / `refine_stream()` — stream a single free-text field
     (summary, a role/project description), or revise one following an instruction.

Every suggestion is grounded strictly in the user's own material; nothing is
invented. Steps for empty career sections (experience, education, …) are NOT
produced — the AI completes what exists, it doesn't fabricate a history. Empty
skills/languages get grounded suggestions, and empty projects can be created from
already-analyzed GitHub repos.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from pydantic import ValidationError

from core import llm
from core.prompts.profile_completion import (
    build_draft_messages,
    build_refine_messages,
    build_suggestions_messages,
)
from models import CertificateType, EmploymentType, LanguageLevel

CV_CHARS_CAP = 6000
REPO_CAP = 15

# Identity fields, in the order we ask about them. `generative` streams; the rest
# are short factual values suggested in the one-shot JSON call.
_IDENTITY_FIELDS: list[tuple[str, str, str]] = [
    ("name", "short_text", "First name"),
    ("surname", "short_text", "Last name"),
    ("email", "short_text", "Email address"),
    ("phone", "short_text", "Phone number"),
    ("linkedin", "short_text", "LinkedIn URL"),
    ("github", "short_text", "GitHub URL"),
    ("summary", "generative", "Professional summary"),
]

# Per-item completable fields for the list sections (skills/languages handled
# separately as composite steps). (field, kind, label).
_ITEM_FIELDS: dict[str, list[tuple[str, str, str]]] = {
    "experiences": [
        ("description", "generative", "Description"),
        ("employment_type", "enum", "Employment type"),
        ("location", "short_text", "Location"),
        ("start_date", "date", "Start date"),
        ("end_date", "date", "End date"),
    ],
    "projects": [
        ("description", "generative", "Description"),
        ("role", "short_text", "Your role"),
        ("start_date", "date", "Start date"),
        ("end_date", "date", "End date"),
    ],
    "education": [
        ("degree", "short_text", "Degree"),
        ("field", "short_text", "Field of study"),
        ("location", "short_text", "Location"),
        ("start_date", "date", "Start date"),
        ("end_date", "date", "End date"),
    ],
    "certificates": [
        ("issuer", "short_text", "Issuer"),
        ("cert_type", "enum", "Certificate type"),
        ("issue_date", "date", "Issue date"),
    ],
    "trainings": [
        ("provider", "short_text", "Provider"),
        ("description", "generative", "Description"),
        ("completion_date", "date", "Completion date"),
    ],
    "links": [
        ("description", "short_text", "Note"),
    ],
}

_ENUM_OPTIONS: dict[str, type] = {
    "employment_type": EmploymentType,
    "cert_type": CertificateType,
    "proficiency": LanguageLevel,
}

_SECTION_LABEL = {
    "identity": "Identity",
    "skills": "Skills",
    "languages": "Languages",
    "experiences": "Experience",
    "projects": "Projects",
    "education": "Education",
    "certificates": "Certificates",
    "trainings": "Trainings",
    "links": "Links",
}


def _queries():
    # Imported lazily so importing this module never triggers DB setup.
    from db import queries

    return queries


def _enum_options(field: str) -> list[dict[str, str]]:
    """[{value, label}] for an enum field (title-cased labels)."""
    enum = _ENUM_OPTIONS[field]
    return [{"value": m.value, "label": m.value.replace("_", " ").title()} for m in enum]


# ── Context ───────────────────────────────────────────────────────

def _gather() -> dict[str, Any]:
    """Read the profile, its list sections, the CV text, and GitHub repos."""
    q = _queries()
    profile = q.get_profile() or {}
    tables = (
        "skills", "experiences", "education", "projects",
        "certificates", "trainings", "languages", "links",
    )
    lists = {t: q.list_all(t) for t in tables}
    documents = q.list_all("documents")
    cv_text = "\n\n".join((d.get("content") or "") for d in documents).strip()
    repos = q.list_all("github_repos")
    return {"profile": profile, "lists": lists, "cv_text": cv_text, "repos": repos}


def _format_context(ctx: dict[str, Any]) -> str:
    """Render the gathered material into a compact block for the prompt."""
    profile = ctx["profile"]
    lists = ctx["lists"]
    lines: list[str] = ["== CURRENT PROFILE =="]
    for field, _kind, label in _IDENTITY_FIELDS:
        value = (profile.get(field) or "").strip()
        lines.append(f"{label}: {value or '(empty)'}")

    def _names(rows: list[dict], key: str = "name") -> str:
        return ", ".join(str(r.get(key) or "").strip() for r in rows if r.get(key)) or "(none)"

    lines.append(f"Skills: {_names(lists['skills'])}")
    lines.append(f"Spoken languages: {_names(lists['languages'])}")
    if lists["experiences"]:
        lines.append("Experience:")
        for r in lists["experiences"]:
            lines.append(f"  - {r.get('title')} at {r.get('company')} ({r.get('start_date') or '?'}–{r.get('end_date') or ('present' if r.get('is_current') else '?')})")
    if lists["education"]:
        lines.append("Education:")
        for r in lists["education"]:
            lines.append(f"  - {r.get('degree') or ''} {r.get('field') or ''} @ {r.get('institution')}".strip())
    if lists["projects"]:
        lines.append("Projects:")
        for r in lists["projects"]:
            lines.append(f"  - {r.get('name')}: {(r.get('description') or '').strip()[:160]}")
    if lists["certificates"]:
        lines.append(f"Certificates: {_names(lists['certificates'])}")
    if lists["trainings"]:
        lines.append(f"Trainings: {_names(lists['trainings'])}")

    repos = ctx["repos"][:REPO_CAP]
    if repos:
        lines.append("\n== GITHUB REPOS ==")
        for r in repos:
            techs = ", ".join(r.get("technologies") or [])
            lines.append(f"- {r.get('repo_name')} [{techs}]: {(r.get('purpose') or r.get('description') or '').strip()[:200]}")

    cv_text = ctx["cv_text"]
    if cv_text:
        lines.append("\n== CV TEXT ==")
        lines.append(cv_text[:CV_CHARS_CAP])

    return "\n".join(lines)


# ── Plan ──────────────────────────────────────────────────────────

def _row_label(table: str, row: dict[str, Any]) -> str:
    """A short human label for the item a per-item field belongs to."""
    if table == "experiences":
        return f"{row.get('title') or 'role'} at {row.get('company') or '?'}"
    if table == "education":
        return row.get("institution") or "school"
    if table in ("projects", "trainings", "certificates"):
        return row.get("name") or table[:-1]
    if table == "links":
        return row.get("label") or "link"
    return table


def _step(**kw: Any) -> dict[str, Any]:
    base = {
        "id": "", "kind": "", "section": "", "label": "", "context_label": "",
        "table": None, "entity_id": None, "field": None, "options": None, "extra": None,
    }
    base.update(kw)
    return base


def build_plan() -> dict[str, Any]:
    """Find every gap and return typed steps plus a summary count.

    Returns {"steps": [...], "total": int}. `total` is the number of steps.
    """
    ctx = _gather()
    profile = ctx["profile"]
    lists = ctx["lists"]
    steps: list[dict[str, Any]] = []

    # 1. Identity (incl. the streamed summary).
    for field, kind, label in _IDENTITY_FIELDS:
        if not (str(profile.get(field) or "").strip()):
            steps.append(_step(
                id=f"profile.{field}", kind=kind, section="identity",
                label=label, table="profile", field=field,
            ))

    # 2. Languages — always asked when empty or any level is missing (composite).
    langs = lists["languages"]
    if not langs or any(not r.get("proficiency") for r in langs):
        steps.append(_step(
            id="languages", kind="languages", section="languages",
            label="Languages you speak", table="languages",
            options=_enum_options("proficiency"),
            extra={"existing": [{"id": r.get("id"), "name": r.get("name"), "proficiency": r.get("proficiency")} for r in langs]},
        ))

    # 3. Skills — categorize / rate existing ones, or suggest new ones when empty.
    skills = lists["skills"]
    need_meta = [s for s in skills if not s.get("category") or not s.get("self_rating")]
    if not skills or need_meta:
        steps.append(_step(
            id="skills", kind="skills", section="skills",
            label="Skill details", table="skills",
            extra={
                "existing": [{"id": s.get("id"), "name": s.get("name"), "category": s.get("category"), "self_rating": s.get("self_rating")} for s in skills],
                "empty": not skills,
            },
        ))

    # 4. Per-item gaps on existing rows.
    for table, fields in _ITEM_FIELDS.items():
        for row in lists[table]:
            label_ctx = _row_label(table, row)
            for field, kind, label in fields:
                if field == "end_date" and row.get("is_current"):
                    continue
                value = row.get(field)
                if value in (None, "", []):
                    steps.append(_step(
                        id=f"{table}.{row.get('id')}.{field}", kind=kind,
                        section=table, label=label, context_label=label_ctx,
                        table=table, entity_id=row.get("id"), field=field,
                        options=_enum_options(field) if kind == "enum" else None,
                    ))

    # 5. Empty projects, when there are analyzed GitHub repos to draw from.
    if not lists["projects"] and ctx["repos"]:
        steps.append(_step(
            id="projects_from_github", kind="projects_from_github", section="projects",
            label="Turn your GitHub repos into projects", table="projects",
            extra={"repos": [
                {
                    "github_repo_id": r.get("id"), "name": r.get("repo_name"),
                    "purpose": r.get("purpose") or r.get("description"),
                    "technologies": r.get("technologies") or [], "url": r.get("url"),
                }
                for r in ctx["repos"][:REPO_CAP]
            ]},
        ))

    for step in steps:
        step["section_label"] = _SECTION_LABEL.get(step["section"], step["section"].title())
    return {"steps": steps, "total": len(steps)}


# ── Structured suggestions (one JSON call) ───────────────────────

def _extract_json(text: str) -> str:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in the model output.")
    return text[start : end + 1]


def _build_request(steps: list[dict[str, Any]], ctx: dict[str, Any]) -> str:
    """Describe, for the LLM, exactly which values to propose."""
    lines: list[str] = []

    identity = [s for s in steps if s["section"] == "identity" and s["kind"] == "short_text"]
    if identity:
        lines.append("IDENTITY fields to fill (copy verbatim from the CV; omit if not present): "
                     + ", ".join(s["field"] for s in identity))

    if any(s["kind"] == "languages" for s in steps):
        existing = ", ".join(r.get("name") for r in ctx["lists"]["languages"] if r.get("name")) or "(none yet)"
        lines.append(f"LANGUAGES: propose the spoken languages this person likely knows, each with a "
                     f"proficiency. Already listed: {existing}.")

    skills_step = next((s for s in steps if s["kind"] == "skills"), None)
    if skills_step:
        names = [x["name"] for x in skills_step["extra"]["existing"]]
        if names:
            lines.append("SKILLS to categorize + rate (skills_categories / skills_ratings): " + ", ".join(names))
        if skills_step["extra"]["empty"]:
            lines.append("SKILLS_NEW: no skills are listed yet — propose the ones clearly evidenced in the CV/repos.")

    item_steps = [s for s in steps if s["kind"] in ("short_text", "enum", "date") and s["section"] != "identity"]
    if item_steps:
        lines.append("ITEMS (return under \"items\" keyed by the exact step id):")
        for s in item_steps:
            hint = ""
            if s["kind"] == "enum":
                hint = " — one of: " + ", ".join(o["value"] for o in s["options"])
            elif s["kind"] == "date":
                hint = " — a date \"YYYY-MM\""
            lines.append(f'  - "{s["id"]}": {s["label"]} for {s["context_label"]}{hint}')

    return "\n".join(lines) if lines else "(nothing structured to fill)"


def suggest_structured(steps: list[dict[str, Any]]) -> dict[str, Any]:
    """One LLM call proposing values for all non-generative gaps.

    Returns {"ok": True, "suggestions": {...}} or {"ok": False, "error": ...}.
    Raises only if the LLM call itself fails (caller maps to 503).
    """
    ctx = _gather()
    request = _build_request(steps, ctx)
    raw = llm.complete(
        build_suggestions_messages(_format_context(ctx), request),
        temperature=0.0, max_tokens=2048,
    )
    try:
        data = json.loads(_extract_json(raw))
    except (ValueError, json.JSONDecodeError) as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}", "raw_output": raw}
    # Normalize the shape defensively — the frontend expects these keys to exist.
    suggestions = {
        "identity": data.get("identity") or {},
        "languages": _valid_languages(data.get("languages") or []),
        "skills_categories": data.get("skills_categories") or {},
        "skills_ratings": data.get("skills_ratings") or {},
        "skills_new": _valid_new_skills(data.get("skills_new") or []),
        "items": data.get("items") or {},
    }
    return {"ok": True, "suggestions": suggestions}


def _valid_languages(items: list[Any]) -> list[dict[str, Any]]:
    levels = {m.value for m in LanguageLevel}
    out = []
    for it in items:
        if isinstance(it, dict) and (it.get("name") or "").strip():
            prof = it.get("proficiency")
            out.append({"name": it["name"].strip(), "proficiency": prof if prof in levels else None})
    return out


def _valid_new_skills(items: list[Any]) -> list[dict[str, Any]]:
    out = []
    for it in items:
        if isinstance(it, dict) and (it.get("name") or "").strip():
            rating = it.get("self_rating")
            out.append({
                "name": it["name"].strip(),
                "category": (it.get("category") or "").strip() or None,
                "self_rating": rating if isinstance(rating, int) and 1 <= rating <= 5 else 3,
            })
    return out


# ── Generative draft + refine (streamed) ─────────────────────────

def draft_stream(field_label: str, target: str) -> Iterator[dict[str, Any]]:
    """Stream a draft for one free-text field: `token` events, then `done`."""
    messages = build_draft_messages(_format_context(_gather()), field_label, target)
    yield from _stream(messages)


def refine_stream(field_label: str, current: str, instruction: str) -> Iterator[dict[str, Any]]:
    """Stream a revised draft following the user's instruction."""
    messages = build_refine_messages(_format_context(_gather()), field_label, current, instruction)
    yield from _stream(messages)


def _stream(messages: list[dict[str, str]]) -> Iterator[dict[str, Any]]:
    parts: list[str] = []
    for chunk in llm.stream(messages, temperature=0.4):
        if not chunk:
            continue
        parts.append(chunk)
        yield {"type": "token", "text": chunk}
    yield {"type": "done", "text": "".join(parts).strip()}
