"""Writing-style API — learn the user's voice and inspect what was learned.

`POST /api/style/learn` (re)analyzes the past cover letters into a style profile
and re-indexes them as local embeddings for exemplar retrieval. `GET /api/style`
returns the current profile without recomputing.
"""

from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from starlette.concurrency import iterate_in_threadpool

from core import embeddings, style
from db import queries

router = APIRouter(prefix="/style", tags=["style"])


@router.post("/learn", summary="Learn writing style from past cover letters (SSE)")
async def learn() -> StreamingResponse:
    """Analyze + index the user's past writing, streaming real progress.

    Events: ``{type: progress, percent, label}`` per phase, one ``{type: done,
    result}`` with the learned-summary payload, or ``{type: fatal, error}``.
    """

    async def event_stream():
        try:
            async for event in iterate_in_threadpool(style.learn_stream()):
                if event["type"] == "result":  # normalize to the shared `done` contract
                    event = {"type": "done", "result": event["result"]}
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:  # noqa: BLE001 — surface the failure, then end the stream
            yield f"data: {json.dumps({'type': 'fatal', 'error': f'Voice learning failed ({type(exc).__name__}): {exc}'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("", summary="Current writing-style profile")
def get_style() -> dict:
    """Return the stored style profile and how many samples exist."""
    profile = queries.get_profile() or {}
    samples = queries.list_all("past_cover_letters")
    return {
        "style_profile": profile.get("style_profile"),
        "samples": len(samples),
        "embeddings_available": embeddings.available(),
    }
