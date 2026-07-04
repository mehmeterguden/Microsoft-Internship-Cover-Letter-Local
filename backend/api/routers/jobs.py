"""Job application endpoints — CRUD over the `jobs` table.

Each job holds the role metadata (company, role, status, match) plus an optional
`letter` snapshot: the generated cover-letter content and its design, so an
application can be reopened and re-edited in the letter editor.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from db import queries
from models import Job

router = APIRouter(prefix="/jobs", tags=["jobs"])

TABLE = "jobs"


@router.get("", response_model=list[Job])
def list_jobs() -> list[Job]:
    """List all saved applications (newest first)."""
    rows = queries.list_all(TABLE)
    return [Job(**row) for row in reversed(rows)]


@router.post("", response_model=Job, status_code=status.HTTP_201_CREATED)
def create_job(job: Job) -> Job:
    """Save a new application."""
    new_id = queries.insert(TABLE, job.model_dump(mode="json", exclude={"id"}))
    return Job(**queries.get_by_id(TABLE, new_id))


@router.get("/{job_id}", response_model=Job)
def get_job(job_id: int) -> Job:
    """Fetch one application by id."""
    row = queries.get_by_id(TABLE, job_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"job {job_id} not found")
    return Job(**row)


@router.put("/{job_id}", response_model=Job)
def update_job(job_id: int, job: Job) -> Job:
    """Replace an existing application (also used to save an edited letter)."""
    if queries.get_by_id(TABLE, job_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"job {job_id} not found")
    queries.update(TABLE, job_id, job.model_dump(mode="json", exclude={"id"}))
    return Job(**queries.get_by_id(TABLE, job_id))


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(job_id: int) -> None:
    """Delete an application."""
    if not queries.delete(TABLE, job_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"job {job_id} not found")
    return None
