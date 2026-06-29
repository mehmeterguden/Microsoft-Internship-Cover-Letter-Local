"""Spoken-language endpoints — CRUD over the `languages` table."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from db import queries
from models import Language

router = APIRouter(prefix="/languages", tags=["languages"])

TABLE = "languages"


@router.get("", response_model=list[Language])
def list_languages() -> list[Language]:
    """List all languages."""
    return [Language(**row) for row in queries.list_all(TABLE)]


@router.post("", response_model=Language, status_code=status.HTTP_201_CREATED)
def create_language(language: Language) -> Language:
    """Add a new language."""
    new_id = queries.insert(TABLE, language.model_dump(mode="json", exclude={"id"}))
    return Language(**queries.get_by_id(TABLE, new_id))


@router.get("/{language_id}", response_model=Language)
def get_language(language_id: int) -> Language:
    """Fetch one language by id."""
    row = queries.get_by_id(TABLE, language_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"language {language_id} not found")
    return Language(**row)


@router.put("/{language_id}", response_model=Language)
def update_language(language_id: int, language: Language) -> Language:
    """Replace an existing language."""
    if queries.get_by_id(TABLE, language_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"language {language_id} not found")
    queries.update(TABLE, language_id, language.model_dump(mode="json", exclude={"id"}))
    return Language(**queries.get_by_id(TABLE, language_id))


@router.delete("/{language_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_language(language_id: int) -> None:
    """Delete a language."""
    if not queries.delete(TABLE, language_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"language {language_id} not found")
    return None
