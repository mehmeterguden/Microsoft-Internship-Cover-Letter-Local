"""Recent news signals from GDELT — free, keyless, global news index.

GDELT's Document API indexes worldwide news and needs no key. We ask for the most
recent English articles mentioning the company and return `{headline, date, url,
domain}` items, newest first. The "why it matters" interpretation is left to an
agent in a later phase; this tool only gathers.
"""

from __future__ import annotations

import time

from core.research import outbound_guard
from core.research.tools.registry import ToolResult

TOOL = "news"
_API = "https://api.gdeltproject.org/api/v2/doc/doc"


def recent(company_name: str, *, max_results: int = 8) -> ToolResult:
    """Return recent news articles mentioning the company, newest first."""
    # Quote the name so multi-word companies match as a phrase.
    query = f'"{company_name}"' if " " in company_name else company_name
    params = {
        "query": f"{query} sourcelang:english",
        "mode": "artlist",
        "maxrecords": max_results,
        "sort": "datedesc",
        "format": "json",
    }
    # GDELT rate-limits bursts (HTTP 429); one short backoff clears it.
    try:
        data = _get(params)
    except ValueError as exc:
        if "429" not in str(exc):
            return ToolResult.fail(TOOL, "GDELT", str(exc))
        time.sleep(5)
        try:
            data = _get(params)
        except ValueError as retry_exc:
            return ToolResult.fail(TOOL, "GDELT", str(retry_exc))

    articles = [
        {
            "headline": a.get("title", ""),
            "url": a.get("url", ""),
            "domain": a.get("domain", ""),
            "date": _iso_date(a.get("seendate", "")),
        }
        for a in data.get("articles", [])
        if a.get("title")
    ]
    return ToolResult(tool=TOOL, source="GDELT", data={"articles": articles})


def _get(params: dict) -> dict:
    return outbound_guard.get_json(_API, params=params)


def _iso_date(seendate: str) -> str | None:
    """GDELT dates look like '20260615T120000Z' — return '2026-06-15'."""
    if len(seendate) >= 8 and seendate[:8].isdigit():
        y, m, d = seendate[:4], seendate[4:6], seendate[6:8]
        return f"{y}-{m}-{d}"
    return None
