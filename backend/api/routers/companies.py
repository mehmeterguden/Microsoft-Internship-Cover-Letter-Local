"""Company autocomplete API.

    GET /companies/suggest?q=asel   → [{name, domain, description, logo}] company matches
    GET /companies/logo?src=<url>   → proxies + caches a logo image from an allowlisted host

The logo proxy keeps the browser same-origin (no third-party image requests) and
lets us serve a clean 404 → the frontend then shows a monogram fallback.
"""

from __future__ import annotations

import urllib.error

from fastapi import APIRouter, HTTPException, Query, Response

from core import companies
from models import CompanySuggestion

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("/suggest", response_model=list[CompanySuggestion])
def suggest(
    q: str = Query(..., min_length=1, description="What the user has typed so far"),
    limit: int = Query(8, ge=1, le=15),
) -> list[CompanySuggestion]:
    """Suggest companies for the query, using the provider configured in settings."""
    return companies.suggest(q, limit)


@router.get("/logo")
def logo(src: str = Query(..., description="Upstream logo URL from a suggestion")) -> Response:
    """Proxy a logo image from an allowlisted host (Wikimedia/Brandfetch/favicon services)."""
    try:
        data, content_type = companies.fetch_logo(src)
    except ValueError as exc:  # host not allowed
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:  # upstream unreachable/missing
        raise HTTPException(status_code=404, detail="Logo not available") from exc
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},  # logos rarely change
    )
