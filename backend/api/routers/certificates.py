"""Certificate endpoints — CRUD over the `certificates` table."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from db import queries
from models import Certificate

router = APIRouter(prefix="/certificates", tags=["certificates"])

TABLE = "certificates"


@router.get("", response_model=list[Certificate])
def list_certificates() -> list[Certificate]:
    """List all certificates."""
    return [Certificate(**row) for row in queries.list_all(TABLE)]


@router.post("", response_model=Certificate, status_code=status.HTTP_201_CREATED)
def create_certificate(certificate: Certificate) -> Certificate:
    """Add a new certificate."""
    new_id = queries.insert(TABLE, certificate.model_dump(mode="json", exclude={"id"}))
    return Certificate(**queries.get_by_id(TABLE, new_id))


@router.get("/{certificate_id}", response_model=Certificate)
def get_certificate(certificate_id: int) -> Certificate:
    """Fetch one certificate by id."""
    row = queries.get_by_id(TABLE, certificate_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"certificate {certificate_id} not found")
    return Certificate(**row)


@router.put("/{certificate_id}", response_model=Certificate)
def update_certificate(certificate_id: int, certificate: Certificate) -> Certificate:
    """Replace an existing certificate."""
    if queries.get_by_id(TABLE, certificate_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"certificate {certificate_id} not found")
    queries.update(TABLE, certificate_id, certificate.model_dump(mode="json", exclude={"id"}))
    return Certificate(**queries.get_by_id(TABLE, certificate_id))


@router.delete("/{certificate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_certificate(certificate_id: int) -> None:
    """Delete a certificate."""
    if not queries.delete(TABLE, certificate_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"certificate {certificate_id} not found")
    return None
