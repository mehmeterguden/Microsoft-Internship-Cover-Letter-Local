"""Writing-style API — learn the user's voice and inspect what was learned.

`POST /api/style/learn` (re)analyzes the past cover letters into a style profile
and re-indexes them as local embeddings for exemplar retrieval. `GET /api/style`
returns the current profile without recomputing.
"""

from __future__ import annotations

from fastapi import APIRouter

from core import embeddings, style
from db import queries

router = APIRouter(prefix="/style", tags=["style"])


@router.post("/learn", summary="Learn writing style from past cover letters")
def learn() -> dict:
    """Analyze + index the user's past writing. Returns a summary of what was learned."""
    return style.learn()


@router.get("", summary="Current writing-style profile")
def get_style() -> dict:
    """Return the stored style profile and how many samples exist."""
    profile = queries.get_profile() or {}
    samples = queries.list_all("past_cover_letters")
    return {
        "style_profile": profile.get("style_profile"),
        "samples": len(samples),
        "embeddings_available": embeddings.available(),
    }
