"""Settings endpoints — user-editable runtime config (singleton).

Replaces the old `.env`: the LLM endpoint/model and API tokens live in the DB and
are changed from the frontend. The row always exists (seeded at init).

    GET  /settings     current settings
    PUT  /settings     replace settings
"""

from __future__ import annotations

from fastapi import APIRouter

from db import queries
from models import Settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=Settings)
def get_settings() -> Settings:
    """Return the current settings."""
    return Settings(**queries.get_settings())


@router.put("", response_model=Settings)
def update_settings(settings: Settings) -> Settings:
    """Replace settings with the submitted values."""
    queries.save_settings(settings.model_dump())
    return settings
