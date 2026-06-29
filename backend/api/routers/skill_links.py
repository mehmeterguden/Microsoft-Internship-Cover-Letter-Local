"""Skill ↔ evidence link endpoints.

Connects a skill to where it was used or proven (a repo, project, experience,
certificate, or training). A link is created or removed as a whole — there is no
partial update — so this resource exposes only list / create / delete.

    GET    /skill-links            all links (optional ?skill_id= filter)
    POST   /skill-links            create a link            → 201
    DELETE /skill-links/{id}       remove a link            → 204
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, HTTPException, status

from db import queries
from models import SkillLink

router = APIRouter(prefix="/skill-links", tags=["skill-links"])

TABLE = "skill_links"


@router.get("", response_model=list[SkillLink])
def list_skill_links(skill_id: int | None = None) -> list[SkillLink]:
    """List all skill links, optionally filtered to a single skill."""
    return [SkillLink(**row) for row in queries.list_skill_links(skill_id)]


@router.post("", response_model=SkillLink, status_code=status.HTTP_201_CREATED)
def create_skill_link(link: SkillLink) -> SkillLink:
    """Link a skill to evidence. 409 if the skill is missing or the link exists."""
    data = link.model_dump(mode="json", exclude={"id"})
    try:
        new_id = queries.insert(TABLE, data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return SkillLink(**queries.get_by_id(TABLE, new_id))


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_skill_link(link_id: int) -> None:
    """Remove a skill link."""
    if not queries.delete(TABLE, link_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"skill link {link_id} not found")
    return None
