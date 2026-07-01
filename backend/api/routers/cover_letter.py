"""Cover-letter generation API — streams a letter token by token over SSE.

`POST /api/cover-letter/generate` builds the prompt from the local profile and
(if present) the cached company research, then streams the letter as it is
generated. Real streaming — tokens are forwarded straight from the provider.
"""

from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import iterate_in_threadpool

from core import cover_letter

router = APIRouter(prefix="/cover-letter", tags=["cover-letter"])


class CoverLetterRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)
    job_description: str | None = None
    tone: str = "professional"


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
