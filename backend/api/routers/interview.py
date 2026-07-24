"""API endpoints for the AI Profile Interview & Context Generator.

Endpoints:
    POST /api/profile/interview/generate-batch    generate N questions for focus area
    POST /api/profile/interview/preview-synthesis  generate Before/After diff proposals
    POST /api/profile/interview/apply-synthesis    persist approved updates & log session
    POST /api/profile/interview/next-question      (legacy) generate next typed question
    POST /api/profile/interview/synthesize         (legacy) direct synthesize & update
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from core import interview
from models import ApplySynthesisRequest, InterviewSetupRequest, SynthesisDiffItem

router = APIRouter(prefix="/profile/interview", tags=["profile-interview"])


class QuestionHistoryItem(BaseModel):
    id: str | None = None
    question: str
    answer: Any = None


class NextQuestionRequest(BaseModel):
    history: list[QuestionHistoryItem] = []


class AnswerItem(BaseModel):
    question_id: str
    target_type: str
    target_id: int | None = None
    target_name: str | None = None
    question: str
    answer: Any


class SynthesizeRequest(BaseModel):
    answers: list[AnswerItem] = []


@router.post("/generate-batch", summary="Generate a batch of interview questions based on count and focus")
def generate_batch(req: InterviewSetupRequest) -> dict[str, Any]:
    """Generate N targeted questions conditioned by question count and focus area."""
    try:
        questions = interview.generate_batch_questions(count=req.count, focus=req.focus)
        return {"questions": questions}
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate question batch ({type(exc).__name__}): {exc}",
        ) from exc


@router.post("/preview-synthesis", summary="Generate Before-and-After synthesis diff proposals")
def preview_synthesis(req: SynthesizeRequest) -> dict[str, Any]:
    """Synthesize Q&A responses into itemized Before/After description diff proposals."""
    try:
        answers_dicts = [a.model_dump() for a in req.answers]
        return interview.preview_synthesis(answers_dicts)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate synthesis preview ({type(exc).__name__}): {exc}",
        ) from exc


@router.post("/apply-synthesis", summary="Apply approved synthesis diff updates to database")
def apply_synthesis(req: ApplySynthesisRequest) -> dict[str, Any]:
    """Persist candidate-approved diff updates into SQLite and record interview session."""
    try:
        diffs_dicts = [d.model_dump() for d in req.approved_diffs]
        return interview.apply_synthesis(approved_diffs=diffs_dicts, session_info=req.session_info)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply synthesis updates ({type(exc).__name__}): {exc}",
        ) from exc


@router.post("/next-question", summary="Generate next dynamic interview question (Legacy)")
def next_question(req: NextQuestionRequest) -> dict[str, Any]:
    """Generate a dynamic, typed interview question based on candidate profile & history."""
    try:
        history_dicts = [h.model_dump() for h in req.history]
        return interview.get_next_question(history_dicts)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate interview question ({type(exc).__name__}): {exc}",
        ) from exc


@router.post("/synthesize", summary="Synthesize user answers into rich profile context (Legacy)")
def synthesize(req: SynthesizeRequest) -> dict[str, Any]:
    """Synthesize collected Q&A responses into enriched technical narrative descriptions."""
    try:
        answers_dicts = [a.model_dump() for a in req.answers]
        return interview.synthesize_answers(answers_dicts)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to synthesize interview answers ({type(exc).__name__}): {exc}",
        ) from exc
