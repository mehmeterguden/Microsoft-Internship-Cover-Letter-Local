"""Profile endpoints — the single-user identity record.

The profile is a singleton (one row, no id), so it has no list/create/delete:
just read the current profile and replace it.

    GET  /profile     current profile (empty defaults if never saved)
    PUT  /profile     replace the profile
"""

from __future__ import annotations

from fastapi import APIRouter

from db import queries
from models import Profile

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=Profile)
def get_profile() -> Profile:
    """Return the saved profile, or an empty one if onboarding hasn't started."""
    row = queries.get_profile()
    return Profile(**row) if row else Profile()


@router.put("", response_model=Profile)
def save_profile(profile: Profile) -> Profile:
    """Replace the profile with the submitted values."""
    queries.save_profile(profile.model_dump(mode="json"))
    return profile
