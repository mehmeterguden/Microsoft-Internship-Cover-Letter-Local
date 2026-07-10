"""Company research API — the live streaming report, plus a dev tools demo.

`POST /research/company` streams a company-intelligence report over Server-Sent
Events: the agent fleet runs in parallel and the report fills in section by
section as agents finish (see `core.research.orchestrator`).

`GET /research/tools` is a developer aid that runs each raw tool once — kept for
debugging the data sources.
"""

from __future__ import annotations

import json
import time

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core import job_posting
from core.research.orchestrator import _cache_key, stream_research
from core.research.schema import ResearchInput
from core.research.tools import registry
from db import queries

router = APIRouter(prefix="/research", tags=["research"])


@router.get("/cached", summary="Return a cached report if one exists (within TTL)")
def cached_report(company: str = Query(..., min_length=1), role: str | None = None) -> dict:
    """Fetch a previously cached report for company+role, or 404 if none/expired."""
    hit = queries.get_research(_cache_key(company, role))
    if hit is None:
        raise HTTPException(status_code=404, detail="No cached report for this company/role.")
    return {"cached_at": hit["created_at"], "report": hit["report"]}


class JobUrlRequest(BaseModel):
    url: str = Field(..., min_length=4, description="A job posting page URL")


class JobUrlResponse(BaseModel):
    company: str = ""
    role: str = ""
    job_description: str = ""


@router.post("/job-url", response_model=JobUrlResponse, summary="Autofill company/role/JD from a job posting link")
def autofill_from_job_url(req: JobUrlRequest) -> JobUrlResponse:
    """Read a job posting page and extract company/role/job description with the LLM.

    Only the public page text is sent to the model (never the profile). Sync `def`
    so FastAPI runs the blocking fetch + LLM call in its threadpool.
    """
    url = req.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Enter a full URL starting with http:// or https://")
    try:
        data = job_posting.extract_from_url(url)
    except job_posting.JobPostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — LLM/provider failure → surface to the UI
        raise HTTPException(
            status_code=503, detail=f"AI request failed ({type(exc).__name__}): {exc}"
        ) from exc
    return JobUrlResponse(**data)


@router.get("/mcp", summary="Discover configured MCP servers and register their tools")
def mcp_status() -> dict:
    """Re-run MCP discovery against configured servers and report what registered."""
    from core.research.tools import registry
    from core.research.tools.mcp import register_mcp_tools

    return {"servers": register_mcp_tools(registry), "tools": registry.names()}


@router.post("/company", summary="Stream a company-intelligence report (SSE)")
async def research_company(payload: ResearchInput) -> StreamingResponse:
    """Research a company and stream progress + the assembled report as SSE."""

    async def event_stream():
        try:
            async for event in stream_research(
                company_name=payload.company_name,
                role_title=payload.role_title,
                job_description=payload.job_description,
                refresh=payload.refresh,
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:  # noqa: BLE001 — surface a fatal error to the client, then end
            yield f"data: {json.dumps({'type': 'fatal', 'error': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/tools", summary="Run every Phase 1 tool once (dev demo)")
def run_tools(company: str = Query(..., min_length=1), role: str | None = None) -> dict:
    """Call each tool for `company` and return their raw results."""
    query = f"{company} engineering culture, values and tech stack"
    calls: list[tuple[str, dict]] = [
        ("firmographics", {"company_name": company}),
        ("news", {"company_name": company}),
        ("github_org", {"company_name": company}),
        ("web_search", {"query": query}),
    ]

    results = []
    website: str | None = None
    for name, kwargs in calls:
        started = time.perf_counter()
        result = registry.call(name, **kwargs)
        results.append(_to_dict(result, started))
        if name == "firmographics" and result.ok and result.data:
            website = result.data.get("website")

    # web_fetch needs a URL — use the official site Wikidata gave us, if any.
    if website:
        started = time.perf_counter()
        results.append(_to_dict(registry.call("web_fetch", url=website), started))

    return {"company": company, "role": role, "tools": results}


def _to_dict(result, started: float) -> dict:
    return {
        "tool": result.tool,
        "ok": result.ok,
        "source": result.source,
        "ms": round((time.perf_counter() - started) * 1000),
        "data": result.data,
        "error": result.error,
    }
