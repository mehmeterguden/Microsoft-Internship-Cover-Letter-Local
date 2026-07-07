"""AI profile-completion endpoints — guide the user through filling the gaps.

    GET  /profile-completion/plan          the ordered list of gaps (no LLM)
    POST /profile-completion/suggest       one JSON call proposing all short values
    POST /profile-completion/draft         stream a free-text field (SSE)
    POST /profile-completion/refine        stream a revised draft (SSE)
    POST /profile-completion/apply         persist the accepted answers

Suggestions and drafts are grounded in the user's own CV + GitHub material (see
core.profile_completion). Accepted answers are the user's own choice, so they are
saved with `source='manual'` and `source_detail='AI-assisted'` for provenance.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import iterate_in_threadpool

from core import profile_completion
from db import queries
from models import Language, Profile, Project, Skill

router = APIRouter(prefix="/profile-completion", tags=["profile-completion"])

# List tables an item-update is allowed to touch (guards the dynamic table name).
_UPDATABLE = frozenset({
    "experiences", "projects", "education", "certificates",
    "trainings", "links", "languages", "skills",
})


@router.get("/plan")
def get_plan() -> dict[str, Any]:
    """Find every gap in the profile and return the ordered steps to fill them."""
    return profile_completion.build_plan()


class SuggestRequest(BaseModel):
    steps: list[dict[str, Any]]


@router.post("/suggest")
def suggest(req: SuggestRequest) -> dict[str, Any]:
    """Propose values for all the short/factual/enumerated gaps in one call."""
    try:
        return profile_completion.suggest_structured(req.steps)
    except Exception as exc:  # noqa: BLE001 — LLM connection/provider failure
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"LLM request failed ({type(exc).__name__}): {exc}",
        ) from exc


class DraftRequest(BaseModel):
    field_label: str
    target: str = ""


class RefineRequest(BaseModel):
    field_label: str
    current: str
    instruction: str


def _sse(generator) -> StreamingResponse:
    """Wrap a sync event generator as an SSE response (errors end the stream)."""

    async def event_stream():
        try:
            async for event in iterate_in_threadpool(generator):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:  # noqa: BLE001 — surface a provider failure, then end
            yield f"data: {json.dumps({'type': 'fatal', 'error': f'{type(exc).__name__}: {exc}'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/draft", summary="Stream a drafted free-text field (SSE)")
def draft(req: DraftRequest) -> StreamingResponse:
    """Stream a grounded draft for one free-text field (summary, a description)."""
    return _sse(profile_completion.draft_stream(req.field_label, req.target))


@router.post("/refine", summary="Stream a revised draft (SSE)")
def refine(req: RefineRequest) -> StreamingResponse:
    """Stream a revision of the current text following the user's instruction."""
    return _sse(profile_completion.refine_stream(req.field_label, req.current, req.instruction))


# ── Apply ─────────────────────────────────────────────────────────

class ItemUpdate(BaseModel):
    table: str
    id: int
    field: str
    value: Any = None


class LanguageNew(BaseModel):
    name: str
    proficiency: str | None = None


class SkillUpdate(BaseModel):
    id: int
    category: str | None = None
    self_rating: int | None = None


class SkillNew(BaseModel):
    name: str
    category: str | None = None
    self_rating: int | None = None


class ProjectNew(BaseModel):
    name: str
    description: str | None = None
    role: str | None = None
    technologies: list[str] = []
    url: str | None = None
    github_repo_id: int | None = None


class ApplyRequest(BaseModel):
    profile: dict[str, Any] = {}          # identity + summary: field -> value
    languages_new: list[LanguageNew] = []
    skills_updates: list[SkillUpdate] = []
    skills_new: list[SkillNew] = []
    item_updates: list[ItemUpdate] = []   # a single field on an existing row
    new_projects: list[ProjectNew] = []


@router.post("/apply")
def apply(req: ApplyRequest) -> dict[str, Any]:
    """Persist the accepted answers, stamped as manual + AI-assisted provenance."""
    today = date.today().isoformat()
    stamp = {"source": "manual", "source_detail": "AI-assisted", "source_at": today}
    saved: dict[str, int] = {}

    # Profile identity + summary — merge onto the existing row, keep a full record.
    if req.profile:
        row = queries.get_profile() or {}
        field_sources = dict(row.get("field_sources") or {})
        for key, value in req.profile.items():
            row[key] = value
            field_sources[key] = {"source": "manual", "detail": "AI-assisted", "at": today}
        row["field_sources"] = field_sources
        queries.save_profile(Profile(**row).model_dump(mode="json"))
        saved["profile"] = len(req.profile)

    # New spoken languages.
    for lang in req.languages_new:
        queries.insert("languages", {**Language(**lang.model_dump()).model_dump(mode="json", exclude={"id"}), **stamp})
    saved["languages"] = len(req.languages_new)

    # Skill category/rating on existing rows.
    for upd in req.skills_updates:
        patch = {k: v for k, v in (("category", upd.category), ("self_rating", upd.self_rating)) if v is not None}
        if patch:
            queries.update("skills", upd.id, patch)

    # Brand-new skills evidenced in the CV/repos.
    for skill in req.skills_new:
        queries.insert("skills", {**Skill(**skill.model_dump()).model_dump(mode="json", exclude={"id"}), **stamp})
    saved["skills"] = len(req.skills_updates) + len(req.skills_new)

    # Single-field updates on existing list rows (enums, dates, notes, descriptions).
    applied = 0
    for upd in req.item_updates:
        if upd.table not in _UPDATABLE:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Cannot update table {upd.table!r}.")
        if queries.update(upd.table, upd.id, {upd.field: upd.value}):
            applied += 1
    saved["item_updates"] = applied

    # Projects created from analyzed GitHub repos.
    for proj in req.new_projects:
        try:
            queries.insert("projects", {**Project(**proj.model_dump()).model_dump(mode="json", exclude={"id"}), **stamp})
        except sqlite3.IntegrityError:
            pass  # skip a project whose linked repo no longer exists
    saved["projects"] = len(req.new_projects)

    return {"ok": True, "saved": saved}
