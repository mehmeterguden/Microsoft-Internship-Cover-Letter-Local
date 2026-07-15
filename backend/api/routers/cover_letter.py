"""Cover-letter generation API — streams a letter token by token over SSE.

`POST /api/cover-letter/generate` builds the prompt from the local profile and
(if present) the cached company research, then streams the letter as it is
generated. Real streaming — tokens are forwarded straight from the provider.
"""

from __future__ import annotations

import json
import re
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import iterate_in_threadpool, run_in_threadpool

from core import cover_letter, export
from db import queries

router = APIRouter(prefix="/cover-letter", tags=["cover-letter"])


class CoverLetterRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)
    job_description: str | None = None
    tone: str = "professional"
    length: str = "standard"  # short | standard | detailed


class ReviewRequest(BaseModel):
    letter: str = Field(min_length=1)


class ExportRequest(BaseModel):
    text: str = Field(min_length=1)
    format: Literal["docx", "pdf"]
    company_name: str | None = Field(default=None, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)


_SENDER_FIELDS = ("name", "surname", "email", "phone", "linkedin", "github")


def _slug(value: str | None) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "draft").lower()).strip("-")
    return slug or "draft"


@router.post("/generate", summary="Stream a generated cover letter (SSE)")
async def generate(payload: CoverLetterRequest) -> StreamingResponse:
    """Generate a cover letter and stream it token by token as Server-Sent Events."""

    # `cover_letter.stream` is a blocking generator (the provider call blocks).
    # Drive it through the threadpool so each token flushes to the client as it
    # arrives instead of buffering until the whole letter is done.
    async def event_stream():
        generator = cover_letter.stream(
            company_name=payload.company_name,
            role_title=payload.role_title,
            job_description=payload.job_description,
            tone=payload.tone,
            length=payload.length,
        )
        try:
            async for event in iterate_in_threadpool(generator):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:  # noqa: BLE001 — surface a provider failure, then end the stream
            yield f"data: {json.dumps({'type': 'fatal', 'error': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/review", summary="Flag claims to double-check before sending (advisory)")
async def review(payload: ReviewRequest) -> dict:
    """Return specific, checkable claims the local profile doesn't clearly support.

    Advisory only — no score. Runs the blocking LLM call in a threadpool so it
    doesn't block the event loop. Returns {"claims": [{text, reason}, ...]}.
    """
    claims = await run_in_threadpool(cover_letter.review, payload.letter)
    return {"claims": claims}


@router.post("/export", summary="Download the letter as a templated .docx or .pdf")
async def export_letter(payload: ExportRequest) -> Response:
    """Render the letter into a business-letter document and return it for download.

    The sender header is filled from the local profile; nothing leaves the device.
    """
    profile = queries.get_profile() or {}
    sender = {k: profile.get(k) for k in _SENDER_FIELDS}
    try:
        data, media_type = await run_in_threadpool(
            export.render, payload.format, payload.text,
            company=payload.company_name, role=payload.role_title, sender=sender,
        )
    except ValueError as exc:  # unsupported format — shouldn't happen past validation
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    filename = f"cover-letter-{_slug(payload.company_name)}.{payload.format}"
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
