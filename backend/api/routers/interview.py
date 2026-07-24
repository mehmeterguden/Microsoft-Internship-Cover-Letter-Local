"""API endpoints for the AI Profile Interview & Context Generator.

    POST /api/profile/interview/next-question    generate next typed question
    POST /api/profile/interview/synthesize       synthesize answers & update profile DB
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from core import interview

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
    question: str
    answer: Any


class SynthesizeRequest(BaseModel):
    answers: list[AnswerItem] = []


@router.post("/next-question", summary="Generate next dynamic interview question")
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


@router.post("/synthesize", summary="Synthesize user answers into rich profile context")
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
