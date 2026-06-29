"""Personal link endpoints — CRUD over the `links` table."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from db import queries
from models import Link

router = APIRouter(prefix="/links", tags=["links"])

TABLE = "links"


@router.get("", response_model=list[Link])
def list_links() -> list[Link]:
    """List all personal links."""
    return [Link(**row) for row in queries.list_all(TABLE)]


@router.post("", response_model=Link, status_code=status.HTTP_201_CREATED)
def create_link(link: Link) -> Link:
    """Add a new personal link."""
    new_id = queries.insert(TABLE, link.model_dump(mode="json", exclude={"id"}))
    return Link(**queries.get_by_id(TABLE, new_id))


@router.get("/{link_id}", response_model=Link)
def get_link(link_id: int) -> Link:
    """Fetch one link by id."""
    row = queries.get_by_id(TABLE, link_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"link {link_id} not found")
    return Link(**row)


@router.put("/{link_id}", response_model=Link)
def update_link(link_id: int, link: Link) -> Link:
    """Replace an existing link."""
    if queries.get_by_id(TABLE, link_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"link {link_id} not found")
    queries.update(TABLE, link_id, link.model_dump(mode="json", exclude={"id"}))
    return Link(**queries.get_by_id(TABLE, link_id))


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_link(link_id: int) -> None:
    """Delete a link."""
    if not queries.delete(TABLE, link_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"link {link_id} not found")
    return None
