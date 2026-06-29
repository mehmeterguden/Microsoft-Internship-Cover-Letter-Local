"""Work / internship experience endpoints — CRUD over the `experiences` table."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from db import queries
from models import Experience

router = APIRouter(prefix="/experiences", tags=["experiences"])

TABLE = "experiences"


@router.get("", response_model=list[Experience])
def list_experiences() -> list[Experience]:
    """List all experiences."""
    return [Experience(**row) for row in queries.list_all(TABLE)]


@router.post("", response_model=Experience, status_code=status.HTTP_201_CREATED)
def create_experience(experience: Experience) -> Experience:
    """Add a new experience."""
    new_id = queries.insert(TABLE, experience.model_dump(mode="json", exclude={"id"}))
    return Experience(**queries.get_by_id(TABLE, new_id))


@router.get("/{experience_id}", response_model=Experience)
def get_experience(experience_id: int) -> Experience:
    """Fetch one experience by id."""
    row = queries.get_by_id(TABLE, experience_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"experience {experience_id} not found")
    return Experience(**row)


@router.put("/{experience_id}", response_model=Experience)
def update_experience(experience_id: int, experience: Experience) -> Experience:
    """Replace an existing experience."""
    if queries.get_by_id(TABLE, experience_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"experience {experience_id} not found")
    queries.update(TABLE, experience_id, experience.model_dump(mode="json", exclude={"id"}))
    return Experience(**queries.get_by_id(TABLE, experience_id))


@router.delete("/{experience_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_experience(experience_id: int) -> None:
    """Delete an experience."""
    if not queries.delete(TABLE, experience_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"experience {experience_id} not found")
    return None
