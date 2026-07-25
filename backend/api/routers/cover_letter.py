"""Cover-letter generation API — streams a letter token by token over SSE.

`POST /api/cover-letter/generate` builds the prompt from the local profile and
(if present) the cached company research, then streams the letter as it is
generated. Real streaming — tokens are forwarded straight from the provider.
"""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from collections.abc import Iterator

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import iterate_in_threadpool, run_in_threadpool

from core import cover_letter, export, pii, verification
from db import queries

router = APIRouter(prefix="/cover-letter", tags=["cover-letter"])


def _sse(generator: Iterator[dict[str, Any]]) -> StreamingResponse:
    """Drive a blocking event generator through the threadpool as SSE.

    Each event flushes to the client as it arrives; a provider failure is surfaced
    as a final `fatal` event and then the stream ends.
    """

    async def event_stream():
        try:
            async for event in iterate_in_threadpool(generator):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:  # noqa: BLE001 — surface a provider failure, then end
            yield f"data: {json.dumps({'type': 'fatal', 'error': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class CoverLetterRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)
    job_description: str | None = None
    tone: str = "professional"
    length: str = "standard"  # short | standard | detailed
    tailoring_answers: dict[str, str] | None = None


class QuestionsRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)
    job_description: str | None = None
    count: int = Field(default=3, ge=1, le=10)
    focus: str = Field(default="all")


class ReviewRequest(BaseModel):
    letter: str = Field(min_length=1)


class PiiScanRequest(BaseModel):
    text: str = Field(min_length=1)


class ExportRequest(BaseModel):
    text: str = Field(min_length=1)
    format: Literal["docx", "pdf"]
    company_name: str | None = Field(default=None, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)


_SENDER_FIELDS = ("name", "surname", "email", "phone", "linkedin", "github")


def _slug(value: str | None) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "draft").lower()).strip("-")
    return slug or "draft"


class VerifyRequest(BaseModel):
    content: str = Field(min_length=1)
    company_name: str = Field(min_length=1, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)


class Claim(BaseModel):
    text: str
    status: str = "partly"
    note: str = ""


class ReviseRequest(BaseModel):
    content: str = Field(min_length=1)
    company_name: str = Field(min_length=1, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)
    flagged: list[Claim] = Field(default_factory=list)


@router.post("/questions", summary="Generate targeted job-specific tailoring questions")
async def get_tailoring_questions(payload: QuestionsRequest) -> dict:
    """Return targeted questions tailored specifically for this application."""
    questions = await run_in_threadpool(
        cover_letter.generate_tailoring_questions,
        company_name=payload.company_name,
        role_title=payload.role_title,
        job_description=payload.job_description,
        count=payload.count,
        focus=payload.focus,
    )
    return {"questions": questions}


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
            tailoring_answers=payload.tailoring_answers,
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


@router.post("/pii-scan", summary="Flag personal / sensitive data in the letter (local, advisory)")
async def pii_scan(payload: PiiScanRequest) -> dict:
    """Scan the letter for PII and return masked findings per the `pii_shield` setting.

    Fully local — regex only, nothing leaves the device. Returns
    ``{"mode": <off|risky_only|on>, "findings": [{type, label, severity, count, samples}]}``.
    When the shield is off, findings are always empty.
    """
    mode = queries.get_settings().get("pii_shield", "risky_only")
    findings = pii.scan(payload.text, mode)
    return {"mode": mode, "findings": findings}


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
@router.post("/verify", summary="Audit a letter's groundedness against the profile (SSE)")
async def verify(payload: VerifyRequest) -> StreamingResponse:
    """Run the always-on groundedness check: stream progress, then a per-claim verdict."""
    return _sse(verification.verify_stream(payload.content, payload.company_name, payload.role_title))


@router.post("/revise", summary="Rewrite a letter to fix only its flagged claims (SSE)")
async def revise(payload: ReviseRequest) -> StreamingResponse:
    """Stream a grounded revision that removes/softens only the flagged claims."""
    flagged = [c.model_dump() for c in payload.flagged]
    return _sse(verification.revise_stream(payload.content, payload.company_name, payload.role_title, flagged))


class InlineEditRequest(BaseModel):
    selected_text: str = Field(min_length=1)
    action: Literal["regenerate", "custom", "ask"] = "regenerate"
    instruction: str | None = None
    full_letter: str | None = None
    company_name: str | None = Field(default=None, max_length=200)
    role_title: str | None = Field(default=None, max_length=200)


@router.post("/inline-edit", summary="Perform inline AI edit or QA on selected cover letter text")
async def inline_edit_endpoint(payload: InlineEditRequest) -> dict:
    """Rewrite or ask AI about a selected text snippet in the cover letter editor."""
    res = await run_in_threadpool(
        cover_letter.inline_edit,
        selected_text=payload.selected_text,
        action=payload.action,
        instruction=payload.instruction,
        full_letter=payload.full_letter,
        company_name=payload.company_name,
        role_title=payload.role_title,
    )
    return {"result": res, "action": payload.action}

