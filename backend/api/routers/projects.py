"""Project endpoints — CRUD over the `projects` table.

A project may optionally link to a GitHub repo via `github_repo_id`. If that id
points at a repo that doesn't exist, the database rejects it and we return 409.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, HTTPException, status

from db import queries
from models import Project

router = APIRouter(prefix="/projects", tags=["projects"])

TABLE = "projects"


@router.get("", response_model=list[Project])
def list_projects() -> list[Project]:
    """List all projects."""
    return [Project(**row) for row in queries.list_all(TABLE)]


@router.post("", response_model=Project, status_code=status.HTTP_201_CREATED)
def create_project(project: Project) -> Project:
    """Add a new project. 409 if the linked GitHub repo doesn't exist."""
    data = project.model_dump(mode="json", exclude={"id"})
    try:
        new_id = queries.insert(TABLE, data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return Project(**queries.get_by_id(TABLE, new_id))


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: int) -> Project:
    """Fetch one project by id."""
    row = queries.get_by_id(TABLE, project_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"project {project_id} not found")
    return Project(**row)


@router.put("/{project_id}", response_model=Project)
def update_project(project_id: int, project: Project) -> Project:
    """Replace an existing project. 409 if the linked GitHub repo doesn't exist."""
    if queries.get_by_id(TABLE, project_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"project {project_id} not found")
    data = project.model_dump(mode="json", exclude={"id"})
    try:
        queries.update(TABLE, project_id, data)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return Project(**queries.get_by_id(TABLE, project_id))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int) -> None:
    """Delete a project."""
    if not queries.delete(TABLE, project_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"project {project_id} not found")
    return None
