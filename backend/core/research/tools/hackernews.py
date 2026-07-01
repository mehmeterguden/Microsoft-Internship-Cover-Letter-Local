"""Developer-community signal from Hacker News — free, keyless (Algolia API).

For a developer-facing company, HN discussion is often a sharper signal than
mainstream news: launches, Show HN posts, outages, sentiment. Returns the most
discussed stories mentioning the company, which feed the signals section.
"""

from __future__ import annotations

from core.research import outbound_guard
from core.research.tools.registry import ToolResult

TOOL = "hackernews"
_API = "https://hn.algolia.com/api/v1/search"  # ranked by popularity


def discussions(company_name: str, *, max_results: int = 6) -> ToolResult:
    """Return the most-discussed HN stories mentioning the company."""
    try:
        data = outbound_guard.get_json(
            _API, params={"query": company_name, "tags": "story", "hitsPerPage": max_results}
        )
    except ValueError as exc:
        return ToolResult.fail(TOOL, "Hacker News", str(exc))

    stories = []
    for hit in data.get("hits", []):
        if not hit.get("title"):
            continue
        object_id = hit.get("objectID")
        stories.append(
            {
                "title": hit.get("title"),
                "url": hit.get("url") or f"https://news.ycombinator.com/item?id={object_id}",
                "hn_url": f"https://news.ycombinator.com/item?id={object_id}",
                "points": hit.get("points", 0),
                "comments": hit.get("num_comments", 0),
                "date": (hit.get("created_at") or "")[:10] or None,
            }
        )
    return ToolResult(tool=TOOL, source="Hacker News", data={"stories": stories})
