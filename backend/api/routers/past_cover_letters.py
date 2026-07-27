"""Past cover letter endpoints — CRUD over the `past_cover_letters` table.

These are writing samples the user wrote before. They carry our rating (ai_rating)
and an optional user rating, and later feed the writing-style learning step.
"""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from datetime import datetime, timezone

from core import document_parser
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
    payload = letter.model_dump(mode="json", exclude={"id"})
    if not payload.get("created_at"):
        payload["created_at"] = datetime.now(timezone.utc).isoformat()
    new_id = queries.insert(TABLE, payload)
    return PastCoverLetter(**queries.get_by_id(TABLE, new_id))


@router.post("/extract")
async def extract_file_text(file: UploadFile = File(...)) -> dict:
    """Extract text from an uploaded file (PDF, Word, Image, TXT, MD) without saving yet."""
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    try:
        extraction = document_parser.extract(file.filename, file.content_type, data)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not extract text from file ({type(exc).__name__}): {exc}",
        ) from exc

    extracted_text = (extraction.get("text") or "").strip()
    if not extracted_text and extraction.get("pages"):
        pages = [p.get("text", "") for p in extraction["pages"] if p.get("text")]
        extracted_text = "\n\n".join(pages).strip()

    if not extracted_text:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Could not extract readable text from the file. Please paste text directly.",
        )

    return {
        "filename": file.filename,
        "text": extracted_text,
        "word_count": len(extracted_text.split()),
        "source_type": extraction.get("source_type", "document"),
    }


@router.post("/upload", response_model=PastCoverLetter, status_code=status.HTTP_201_CREATED)
async def upload_past_cover_letter(file: UploadFile = File(...)) -> PastCoverLetter:
    """Upload a file (PDF, Word, Image, TXT, MD), convert to text, and save as a past letter sample."""
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    try:
        extraction = document_parser.extract(file.filename, file.content_type, data)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not extract text from file ({type(exc).__name__}): {exc}",
        ) from exc

    extracted_text = (extraction.get("text") or "").strip()
    if not extracted_text and extraction.get("pages"):
        pages = [p.get("text", "") for p in extraction["pages"] if p.get("text")]
        extracted_text = "\n\n".join(pages).strip()

    if not extracted_text:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Could not extract readable text from the file. Please paste text directly.",
        )

    payload = {
        "content": extracted_text,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_rating": 5,
    }
    new_id = queries.insert(TABLE, payload)
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
