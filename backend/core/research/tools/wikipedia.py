"""Clean company summary from Wikipedia — free, keyless (REST summary API).

Gives a neutral, well-edited prose description to ground the overview. Skips
disambiguation and missing pages so a wrong or absent match fails soft rather
than polluting the report.
"""

from __future__ import annotations

import urllib.parse

from core.research import outbound_guard
from core.research.tools.registry import ToolResult

TOOL = "wikipedia"
_API = "https://en.wikipedia.org/api/rest_v1/page/summary/"


def summary(company_name: str) -> ToolResult:
    """Return `{title, extract, description, url}` for the company's Wikipedia page."""
    title = urllib.parse.quote(company_name.strip().replace(" ", "_"))
    try:
        data = outbound_guard.get_json(_API + title)
    except ValueError as exc:
        return ToolResult.fail(TOOL, "Wikipedia", str(exc))

    if data.get("type") == "disambiguation" or not data.get("extract"):
        return ToolResult.fail(TOOL, "Wikipedia", "No unambiguous Wikipedia page.")

    page_url = data.get("content_urls", {}).get("desktop", {}).get("page")
    return ToolResult(
        tool=TOOL,
        source=page_url or "Wikipedia",
        data={
            "title": data.get("title"),
            "extract": data.get("extract"),
            "description": data.get("description"),
            "url": page_url,
        },
    )
