"""Training / course endpoints — CRUD over the `trainings` table."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from db import queries
from models import Training

router = APIRouter(prefix="/trainings", tags=["trainings"])

TABLE = "trainings"


@router.get("", response_model=list[Training])
def list_trainings() -> list[Training]:
    """List all trainings."""
    return [Training(**row) for row in queries.list_all(TABLE)]


@router.post("", response_model=Training, status_code=status.HTTP_201_CREATED)
def create_training(training: Training) -> Training:
    """Add a new training."""
    new_id = queries.insert(TABLE, training.model_dump(mode="json", exclude={"id"}))
    return Training(**queries.get_by_id(TABLE, new_id))


@router.get("/{training_id}", response_model=Training)
def get_training(training_id: int) -> Training:
    """Fetch one training by id."""
    row = queries.get_by_id(TABLE, training_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"training {training_id} not found")
    return Training(**row)


@router.put("/{training_id}", response_model=Training)
def update_training(training_id: int, training: Training) -> Training:
    """Replace an existing training."""
    if queries.get_by_id(TABLE, training_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"training {training_id} not found")
    queries.update(TABLE, training_id, training.model_dump(mode="json", exclude={"id"}))
    return Training(**queries.get_by_id(TABLE, training_id))


@router.delete("/{training_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_training(training_id: int) -> None:
    """Delete a training."""
    if not queries.delete(TABLE, training_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"training {training_id} not found")
    return None
