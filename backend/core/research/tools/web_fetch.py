"""Fetch a page and extract its readable text — careers pages, blogs, about pages.

Uses trafilatura, which strips nav/ads/boilerplate and returns the main article
text. Free and local (only the page fetch is outbound, and its URL is checked by
`outbound_guard`). Output is capped so a single huge page can't blow up an agent's
context window.
"""

from __future__ import annotations

import trafilatura

from core.research import outbound_guard
from core.research.tools.registry import ToolResult

TOOL = "web_fetch"
_MAX_CHARS = 20_000


def fetch(url: str) -> ToolResult:
    """Download `url` and return `{url, text}` with the main content extracted."""
    outbound_guard.assert_safe(url)
    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        return ToolResult.fail(TOOL, url, "Could not download the page.")

    text = trafilatura.extract(downloaded, include_comments=False, include_tables=False)
    if not text:
        return ToolResult.fail(TOOL, url, "No readable content found on the page.")

    return ToolResult(tool=TOOL, source=url, data={"url": url, "text": text[:_MAX_CHARS]})
