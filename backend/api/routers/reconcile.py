"""Reconcile endpoints — a non-destructive merge plan for any profile import.

Shared by the LinkedIn and CV imports: both produce a `CVExtraction`, then

    POST /reconcile/plan   compare it against the saved profile → a decision plan
    POST /reconcile/apply  apply the user's decisions (fills, adds, replaces)

The plan classifies each field/row as fill · same · new · conflict; apply only
touches what the user accepted, so a filled profile is never blindly overwritten.
"""

from __future__ import annotations

import sqlite3
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from core import reconcile
from db import queries
from models import CVExtraction, Source

router = APIRouter(prefix="/reconcile", tags=["reconcile"])

_SECTIONS = ("skills", "experiences", "education", "projects", "certificates", "trainings", "languages", "links")
_SOURCES = {"linkedin": Source.linkedin, "cv": Source.cv, "manual": Source.manual}


class PlanRequest(CVExtraction):
    profile_url: str | None = None


@router.post("/plan")
def plan(req: PlanRequest, use_ai: bool = True) -> dict:
    """Build a reconcile plan for incoming data against the current profile."""
    existing_profile = queries.get_profile() or {}
    existing_by_section = {section: queries.list_all(section) for section in _SECTIONS}
    incoming = CVExtraction(**req.model_dump(exclude={"profile_url"}))
    return reconcile.build_plan(
        incoming,
        existing_profile,
        existing_by_section,
        profile_url=req.profile_url,
        use_ai=use_ai,
    )


class ProfileField(BaseModel):
    field: str
    value: Any = None


class ItemUpsert(BaseModel):
    section: str
    existing_id: int | None = None
    data: dict[str, Any]


class ApplyRequest(BaseModel):
    source: str = "manual"
    source_detail: str | None = None
    profile_fields: list[ProfileField] = []
    items: list[ItemUpsert] = []


@router.post("/apply")
def apply(req: ApplyRequest) -> dict:
    """Apply accepted decisions: fill/replace identity fields, add/replace rows."""
    source = _SOURCES.get(req.source, Source.manual)
    today = date.today().isoformat()
    stamp = {"source": source.value, "source_detail": req.source_detail, "source_at": today}

    # ── Identity fields (fills + accepted conflicts) ──
    profile_written = 0
    if req.profile_fields:
        existing = queries.get_profile() or {}
        merged = dict(existing)
        field_sources = dict(existing.get("field_sources") or {})
        for pf in req.profile_fields:
            merged[pf.field] = pf.value
            field_sources[pf.field] = {"source": source.value, "detail": req.source_detail, "at": today}
            profile_written += 1
        merged["field_sources"] = field_sources
        queries.save_profile(merged)

    # ── List rows (upsert: replace when existing_id given, else insert) ──
    added = updated = 0
    for item in req.items:
        if item.section not in _SECTIONS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Unknown section: {item.section}")
        payload = {k: v for k, v in item.data.items() if k != "id"}
        payload.update(stamp)
        if item.section == "skills" and source is Source.cv:
            payload["cv_mentioned"] = True
        try:
            if item.existing_id is not None:
                if queries.update(item.section, item.existing_id, payload):
                    updated += 1
                else:  # the row vanished — insert instead of silently dropping it
                    queries.insert(item.section, payload)
                    added += 1
            else:
                queries.insert(item.section, payload)
                added += 1
        except sqlite3.IntegrityError:
            pass  # skip rows that violate a constraint (e.g. a stale FK)

    return {"ok": True, "profile_fields": profile_written, "added": added, "updated": updated}
