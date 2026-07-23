"""Cover-letter generation API — streams a letter token by token over SSE.

`POST /api/cover-letter/generate` builds the prompt from the local profile and
(if present) the cached company research, then streams the letter as it is
generated. Real streaming — tokens are forwarded straight from the provider.
"""

from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import iterate_in_threadpool

from core import cover_letter, errors, evaluate, groundedness
from models import Score

router = APIRouter(prefix="/cover-letter", tags=["cover-letter"])

_MAX_LETTER = 20000


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
        except Exception as exc:  # noqa: BLE001 — surface a classified failure, then end the stream
            yield f"data: {json.dumps({'type': 'fatal', 'error': errors.error_dict(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Quality score (LLM-as-judge) ──────────────────────────────────────

class EvaluateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=_MAX_LETTER)
    company: str | None = Field(default=None, max_length=200)
    role: str | None = Field(default=None, max_length=200)


class RubricScore(BaseModel):
    name: str
    score: Score


class EvaluateResponse(BaseModel):
    score: Score
    breakdown: list[RubricScore]
    rationale: str


@router.post("/evaluate", summary="Score a cover letter against a rubric (LLM-as-judge)")
def evaluate_letter(payload: EvaluateRequest) -> EvaluateResponse:
    """Grade a finished letter 0–100 on persuasion, personalization, tone, language and
    length, with a short rationale. Runs a second LLM call; sync so FastAPI offloads it."""
    return EvaluateResponse(**evaluate.evaluate(payload.text, payload.company, payload.role))


# ── Groundedness (claims vs the applicant's data) ─────────────────────

class GroundednessRequest(BaseModel):
    text: str = Field(min_length=1, max_length=_MAX_LETTER)


class ClaimOut(BaseModel):
    text: str
    supported: bool
    evidence: str | None = None
    span: tuple[int, int] | None = None


class GroundednessResponse(BaseModel):
    claims: list[ClaimOut]


@router.post("/groundedness", summary="Check each claim in a letter against the applicant's data")
def check_groundedness(payload: GroundednessRequest) -> GroundednessResponse:
    """Extract the letter's claims about the applicant and flag any the local profile
    (CV + GitHub + profile) does not support."""
    return GroundednessResponse(**groundedness.check(payload.text))


# ── Inline editing of a selection ─────────────────────────────────────

class EditRequest(BaseModel):
    text: str = Field(min_length=1, max_length=_MAX_LETTER)
    selection: str = Field(min_length=1, max_length=_MAX_LETTER)
    action: Literal["improve", "shorten", "lengthen", "tone"]
    tone: str | None = Field(default=None, max_length=40)


class EditResponse(BaseModel):
    text: str


@router.post("/edit", summary="Rewrite a selected passage (improve / shorten / lengthen / tone)")
def edit_selection(payload: EditRequest) -> EditResponse:
    """Apply an inline edit to the selected passage and return its replacement text."""
    return EditResponse(text=cover_letter.edit(payload.text, payload.selection, payload.action, payload.tone))
