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

import json
import sqlite3
import time
from datetime import date

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import iterate_in_threadpool

from core import cv_structuring, document_parser
from db import queries
from models import CVExtraction, Document, Source

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


@router.post("/import/stream", summary="Upload a CV and stream the structuring (SSE)")
async def import_cv_stream(file: UploadFile = File(...)) -> StreamingResponse:
    """Upload a CV → extract text → stream the LLM's JSON output as it's written.

    Emits SSE events: `meta` (filename/pages) · `token` (each JSON chunk) ·
    `done` (validated result + duration) · `fatal` (LLM/connection failure).
    """
    data, extraction = await _read_and_extract(file)
    text = extraction.get("text") or "\n\n".join(p["text"] for p in extraction.get("pages", []))

    async def event_stream():
        meta = {
            "type": "meta",
            "filename": file.filename,
            "source_type": extraction.get("source_type"),
            "num_pages": extraction.get("num_pages"),
            "char_count": len(text),
        }
        yield f"data: {json.dumps(meta)}\n\n"
        start = time.monotonic()
        try:
            generator = cv_structuring.structure_stream(text)
            async for event in iterate_in_threadpool(generator):
                if event.get("type") == "done":
                    event["duration_s"] = round(time.monotonic() - start, 1)
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:  # noqa: BLE001 — surface a provider failure, then end the stream
            yield f"data: {json.dumps({'type': 'fatal', 'error': f'{type(exc).__name__}: {exc}'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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


@router.post("/save")
def save_structured(cv: CVExtraction, replace: bool = True, source_detail: str | None = None) -> dict:
    """Persist structured CV data into the profile/skills/experience/... tables.

    Everything saved here came from a CV import, so each row is stamped with
    `source='cv'`, the originating filename (`source_detail`), and today's date —
    that provenance is what the Profile page surfaces on each card. The profile's
    per-field `field_sources` map is filled the same way.

    `replace=True` (default) clears each list table first so re-importing a CV
    doesn't pile up duplicates. GitHub-imported rows are preserved (a CV refresh
    never wipes the user's imported repos) — but the CV is authoritative, so a CV
    skill/project overwrites a GitHub row of the same name. Returns how many rows
    were written per section.
    """
    today = date.today().isoformat()
    stamp = {"source": Source.cv.value, "source_detail": source_detail, "source_at": today}
    # Sections that GitHub also writes to, keyed by name — used to resolve clashes.
    github_sections = {"skills", "projects"}

    # Profile: stamp provenance for every field the CV actually filled.
    profile_data = cv.profile.model_dump(mode="json")
    field_source = {"source": Source.cv.value, "detail": source_detail, "at": today}
    profile_data["field_sources"] = {
        key: field_source
        for key, value in profile_data.items()
        if key not in ("style_profile", "field_sources") and value not in (None, "", [])
    }
    queries.save_profile(profile_data)
    saved: dict[str, int] = {"profile": 1}

    sections: dict[str, list] = {
        "skills": cv.skills,
        "experiences": cv.experiences,
        "education": cv.education,
        "projects": cv.projects,
        "certificates": cv.certificates,
        "trainings": cv.trainings,
        "languages": cv.languages,
        "links": cv.links,
    }
    for table, items in sections.items():
        if replace:
            # Preserve GitHub-imported rows; drop everything else in this section.
            queries.clear_except_github(table)
            if table in github_sections:
                # CV wins over GitHub for a same-named skill/project: drop the
                # preserved GitHub row so the CV version replaces it below.
                cv_names = {(getattr(it, "name", "") or "").strip().lower() for it in items}
                for row in queries.list_all(table):
                    if (row.get("name") or "").strip().lower() in cv_names:
                        queries.delete(table, row["id"])
        # Skills genuinely appear on the CV, so flag them as such for the UI.
        extra = {"cv_mentioned": True} if table == "skills" else {}
        written = 0
        for item in items:
            try:
                queries.insert(table, {**item.model_dump(mode="json", exclude={"id"}), **stamp, **extra})
                written += 1
            except sqlite3.IntegrityError:
                pass  # skip rows that violate a constraint (e.g. a stale FK)
        saved[table] = written

    return {"ok": True, "saved": saved}


@router.post("/documents", response_model=Document, status_code=status.HTTP_201_CREATED)
def save_document(document: Document) -> Document:
    """Save an extracted document's text to the database."""
    new_id = queries.insert(TABLE, document.model_dump(exclude={"id"}))
    return Document(**queries.get_by_id(TABLE, new_id))


@router.get("/documents", response_model=list[Document])
def list_documents() -> list[Document]:
    """List saved documents."""
    return [Document(**row) for row in queries.list_all(TABLE)]
