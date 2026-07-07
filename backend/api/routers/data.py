"""Destructive data operations — reset the whole profile.

Wipes every user-data table (profile, skills, portfolio, letters, applications,
learned voice) and the local vector store. Settings (provider/model/keys) are
kept. Irreversible — the frontend guards it behind an explicit typed confirmation.
"""

from __future__ import annotations

from fastapi import APIRouter

from core import vector_store
from db import queries

router = APIRouter(prefix="/data", tags=["data"])


@router.post("/reset", summary="Delete ALL profile data (irreversible)")
def reset_data() -> dict[str, object]:
    """Erase all user data and clear the RAG vector store. Settings are preserved."""
    removed = queries.reset_all()
    try:
        vector_store.reset()
    except Exception:  # noqa: BLE001 — DB wipe already succeeded; vector reset is best-effort
        pass
    return {"ok": True, "removed": removed, "total": sum(removed.values())}
