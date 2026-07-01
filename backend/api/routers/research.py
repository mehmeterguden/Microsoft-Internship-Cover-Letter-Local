"""Dev-only demo endpoint for the Phase 1 research tools.

Runs each free data-gathering tool once for a given company and returns their raw
results (payload + provenance + timing). This is a temporary developer aid so the
tools can be exercised from the browser; the real streaming research API (agents,
SSE, the assembled report) arrives in Phase 2 and will replace this.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Query

from core.research.tools import registry

router = APIRouter(prefix="/research", tags=["research (dev)"])


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
