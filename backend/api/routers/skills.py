"""Skill endpoints — CRUD over the `skills` table."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from db import queries
from models import Skill

router = APIRouter(prefix="/skills", tags=["skills"])

TABLE = "skills"


@router.get("", response_model=list[Skill])
def list_skills() -> list[Skill]:
    """List all skills."""
    return [Skill(**row) for row in queries.list_all(TABLE)]


@router.post("", response_model=Skill, status_code=status.HTTP_201_CREATED)
def create_skill(skill: Skill) -> Skill:
    """Add a new skill."""
    new_id = queries.insert(TABLE, skill.model_dump(mode="json", exclude={"id"}))
    return Skill(**queries.get_by_id(TABLE, new_id))


@router.get("/{skill_id}", response_model=Skill)
def get_skill(skill_id: int) -> Skill:
    """Fetch one skill by id."""
    row = queries.get_by_id(TABLE, skill_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"skill {skill_id} not found")
    return Skill(**row)


@router.put("/{skill_id}", response_model=Skill)
def update_skill(skill_id: int, skill: Skill) -> Skill:
    """Replace an existing skill."""
    if queries.get_by_id(TABLE, skill_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"skill {skill_id} not found")
    queries.update(TABLE, skill_id, skill.model_dump(mode="json", exclude={"id"}))
    return Skill(**queries.get_by_id(TABLE, skill_id))


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_skill(skill_id: int) -> None:
    """Delete a skill."""
    if not queries.delete(TABLE, skill_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"skill {skill_id} not found")
    return None
