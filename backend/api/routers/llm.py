"""LLM endpoints — check the model is reachable and try a prompt.

Generation features (cover-letter streaming, CV extraction, repo analysis) are
added in later phases. For now this exposes:
  • GET  /llm/health   is the configured model reachable?
  • POST /llm/chat      send a message, get the full reply (handy from /docs)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from core import llm
from db import queries

router = APIRouter(prefix="/llm", tags=["llm"])


class ChatRequest(BaseModel):
    """A one-off prompt for manual testing from /docs."""

    message: str = Field(..., description="Your message to the model")
    system: str | None = Field(None, description="Optional system instruction")
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int | None = Field(None, gt=0, description="Cap the reply length")


class ChatResponse(BaseModel):
    reply: str
    model: str


@router.get("/health")
def llm_health() -> dict[str, object]:
    """Ping the configured model; report ok/model/base_url/detail."""
    return llm.health()


@router.post("/chat", response_model=ChatResponse)
def llm_chat(req: ChatRequest) -> ChatResponse:
    """Send a message to the model and return its full reply.

    Use this from /docs to sanity-check the LLM: type a message, Execute, read the
    reply. 502 if Foundry Local is unreachable (start it and try again).
    """
    messages: list[dict[str, str]] = []
    if req.system:
        messages.append({"role": "system", "content": req.system})
    messages.append({"role": "user", "content": req.message})

    try:
        reply = llm.complete(messages, temperature=req.temperature, max_tokens=req.max_tokens)
    except Exception as exc:  # noqa: BLE001 — surface the upstream error to the caller
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM request failed ({type(exc).__name__}): {exc}",
        ) from exc

    return ChatResponse(reply=reply, model=queries.get_settings()["llm_model"])
