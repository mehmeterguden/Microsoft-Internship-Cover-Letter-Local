"""Education endpoints — CRUD over the `education` table."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from db import queries
from models import Education

router = APIRouter(prefix="/education", tags=["education"])

TABLE = "education"


@router.get("", response_model=list[Education])
def list_education() -> list[Education]:
    """List all education entries."""
    return [Education(**row) for row in queries.list_all(TABLE)]


@router.post("", response_model=Education, status_code=status.HTTP_201_CREATED)
def create_education(education: Education) -> Education:
    """Add a new education entry."""
    new_id = queries.insert(TABLE, education.model_dump(mode="json", exclude={"id"}))
    return Education(**queries.get_by_id(TABLE, new_id))


@router.get("/{education_id}", response_model=Education)
def get_education(education_id: int) -> Education:
    """Fetch one education entry by id."""
    row = queries.get_by_id(TABLE, education_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"education {education_id} not found")
    return Education(**row)


@router.put("/{education_id}", response_model=Education)
def update_education(education_id: int, education: Education) -> Education:
    """Replace an existing education entry."""
    if queries.get_by_id(TABLE, education_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"education {education_id} not found")
    queries.update(TABLE, education_id, education.model_dump(mode="json", exclude={"id"}))
    return Education(**queries.get_by_id(TABLE, education_id))


@router.delete("/{education_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_education(education_id: int) -> None:
    """Delete an education entry."""
    if not queries.delete(TABLE, education_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"education {education_id} not found")
    return None
