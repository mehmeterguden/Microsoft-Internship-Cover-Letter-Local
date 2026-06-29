"""Past cover letter endpoints — CRUD over the `past_cover_letters` table.

These are writing samples the user wrote before. They carry our rating (ai_rating)
and an optional user rating, and later feed the writing-style learning step.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from db import queries
from models import PastCoverLetter

router = APIRouter(prefix="/past-cover-letters", tags=["past-cover-letters"])

TABLE = "past_cover_letters"


@router.get("", response_model=list[PastCoverLetter])
def list_past_cover_letters() -> list[PastCoverLetter]:
    """List all past cover letters."""
    return [PastCoverLetter(**row) for row in queries.list_all(TABLE)]


@router.post("", response_model=PastCoverLetter, status_code=status.HTTP_201_CREATED)
def create_past_cover_letter(letter: PastCoverLetter) -> PastCoverLetter:
    """Add a new past cover letter."""
    new_id = queries.insert(TABLE, letter.model_dump(mode="json", exclude={"id"}))
    return PastCoverLetter(**queries.get_by_id(TABLE, new_id))


@router.get("/{letter_id}", response_model=PastCoverLetter)
def get_past_cover_letter(letter_id: int) -> PastCoverLetter:
    """Fetch one past cover letter by id."""
    row = queries.get_by_id(TABLE, letter_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"past cover letter {letter_id} not found")
    return PastCoverLetter(**row)


@router.put("/{letter_id}", response_model=PastCoverLetter)
def update_past_cover_letter(letter_id: int, letter: PastCoverLetter) -> PastCoverLetter:
    """Replace an existing past cover letter."""
    if queries.get_by_id(TABLE, letter_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"past cover letter {letter_id} not found")
    queries.update(TABLE, letter_id, letter.model_dump(mode="json", exclude={"id"}))
    return PastCoverLetter(**queries.get_by_id(TABLE, letter_id))


@router.delete("/{letter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_past_cover_letter(letter_id: int) -> None:
    """Delete a past cover letter."""
    if not queries.delete(TABLE, letter_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"past cover letter {letter_id} not found")
    return None
