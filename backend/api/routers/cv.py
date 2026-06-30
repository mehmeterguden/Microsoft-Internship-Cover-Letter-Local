"""CV / document endpoints — upload a file, see the extracted text, optionally save.

Accepts PDF and Word (.docx) always. Images (screenshots/photos) are an optional
OCR feature: the user turns it on in settings (stored in the DB), and it also needs
the Tesseract binary installed. The OCR-status endpoint reports both and gives
install instructions when the binary is missing.

    GET  /cv/ocr-status   is image OCR enabled / available, and how to install it
    POST /cv/parse        multipart upload → extracted text as JSON
    POST /cv/documents    save an extracted document to the DB → 201
    GET  /cv/documents    list saved documents
"""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from core import cv_structuring, document_parser
from db import queries
from models import Document

router = APIRouter(prefix="/cv", tags=["cv"])

TABLE = "documents"
MAX_BYTES = 15 * 1024 * 1024  # 15 MB covers scanned PDFs and high-res screenshots

# How to install the Tesseract OCR binary, per OS.
OCR_INSTALL = {
    "macOS": "brew install tesseract",
    "Windows": "Install from https://github.com/UB-Mannheim/tesseract/wiki",
    "Linux (Debian/Ubuntu)": "sudo apt install tesseract-ocr",
}


@router.get("/ocr-status")
def ocr_status() -> dict:
    """Report whether image OCR is enabled (setting) and available (binary)."""
    enabled = bool(queries.get_settings().get("ocr_enabled"))
    available = document_parser.ocr_available()
    return {
        "enabled": enabled,
        "available": available,
        "ready": enabled and available,
        "install": OCR_INSTALL,
    }


async def _read_and_extract(file: UploadFile) -> tuple[bytes, dict]:
    """Validate an upload, read it, and extract text. Raises HTTPException on problems."""
    source_type = document_parser.detect_type(file.filename, file.content_type)
    if source_type is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type — upload a PDF, image, or Word (.docx) file.",
        )

    # Images need the optional OCR feature: enabled in settings AND tesseract present.
    if source_type == "image":
        if not queries.get_settings().get("ocr_enabled"):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Image OCR is off. Turn it on in Settings to read images.",
            )
        if not document_parser.ocr_available():
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OCR is on, but Tesseract isn't installed. Install it (e.g. "
                "`brew install tesseract`) and restart the server.",
            )

    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="The uploaded file is empty.")
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File is larger than 15 MB.")

    try:
        extraction = document_parser.extract(file.filename, file.content_type, data)
    except Exception as exc:  # noqa: BLE001 — report a bad/corrupt file instead of 500
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not read the file ({type(exc).__name__}): {exc}",
        ) from exc
    return data, extraction


@router.post("/parse")
async def parse_document(file: UploadFile = File(...)) -> dict:
    """Extract text from an uploaded PDF, image, or Word file."""
    data, extraction = await _read_and_extract(file)
    return {"filename": file.filename, "size_bytes": len(data), **extraction}


@router.post("/import")
async def import_cv(file: UploadFile = File(...)) -> dict:
    """Upload a CV → extract text → structure it with the LLM, in one call.

    Returns the document meta plus the structuring result (`ok`, `structured` or
    `error`, `raw_output`). Used by the import demo page.
    """
    data, extraction = await _read_and_extract(file)
    text = extraction.get("text") or "\n\n".join(p["text"] for p in extraction.get("pages", []))
    try:
        result = cv_structuring.structure(text)
    except Exception as exc:  # noqa: BLE001 — LLM connection/provider failure
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"LLM request failed ({type(exc).__name__}): {exc}",
        ) from exc

    return {
        "filename": file.filename,
        "source_type": extraction.get("source_type"),
        "num_pages": extraction.get("num_pages"),
        "char_count": len(text),
        **result,
    }


class StructureRequest(BaseModel):
    text: str


@router.post("/structure")
def structure_cv(req: StructureRequest) -> dict:
    """Turn extracted CV text into structured JSON via the configured LLM.

    Always returns the model's `raw_output`; `ok` says whether it parsed and
    validated, with `structured` (success) or `error` (failure). 503 if the LLM
    itself is unreachable.
    """
    if not req.text.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No text to structure.")
    try:
        return cv_structuring.structure(req.text)
    except Exception as exc:  # noqa: BLE001 — LLM connection/provider failure
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"LLM request failed ({type(exc).__name__}): {exc}",
        ) from exc


@router.post("/documents", response_model=Document, status_code=status.HTTP_201_CREATED)
def save_document(document: Document) -> Document:
    """Save an extracted document's text to the database."""
    new_id = queries.insert(TABLE, document.model_dump(exclude={"id"}))
    return Document(**queries.get_by_id(TABLE, new_id))


@router.get("/documents", response_model=list[Document])
def list_documents() -> list[Document]:
    """List saved documents."""
    return [Document(**row) for row in queries.list_all(TABLE)]
