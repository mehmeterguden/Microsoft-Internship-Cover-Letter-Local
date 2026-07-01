"""Web search — Tavily (free tier) if a key is set, else keyless DuckDuckGo.

Returns a list of `{title, url, snippet}` hits. Tavily gives cleaner, ranked
results and a short answer; without a key we fall back to scraping DuckDuckGo's
HTML endpoint so the feature still works with zero setup (lower quality, flagged
via the `source` label). Both paths go through `outbound_guard`.

Free by design: Tavily's free tier needs only a signup key (stored in settings);
the DuckDuckGo fallback needs nothing at all.
"""

from __future__ import annotations

import html
import re

from core.research import outbound_guard
from core.research.tools.registry import ToolResult
from db import queries

TOOL = "web_search"
_TAVILY_URL = "https://api.tavily.com/search"
_DDG_URL = "https://lite.duckduckgo.com/lite/"

# DuckDuckGo Lite renders each hit as an <a class='result-link'> plus a following
# <td class='result-snippet'>. Class attributes use single quotes.
_DDG_LINK = re.compile(
    r"""<a\s+rel="nofollow"\s+href="([^"]+)"\s+class=['"]result-link['"][^>]*>(.*?)</a>""",
    re.DOTALL,
)
_DDG_SNIPPET = re.compile(
    r"""class=['"]result-snippet['"][^>]*>(.*?)</td>""", re.DOTALL
)


def search(query: str, *, max_results: int = 6) -> ToolResult:
    """Search the web. Prefers Tavily; falls back to DuckDuckGo on no key / error."""
    key = (queries.get_settings().get("tavily_api_key") or "").strip()
    if key:
        result = _tavily(query, max_results, key)
        if result.ok:
            return result
        # Tavily failed (quota/network) — degrade gracefully to the keyless path.
    return _duckduckgo(query, max_results)


def _tavily(query: str, max_results: int, api_key: str) -> ToolResult:
    payload = {
        "api_key": api_key,
        "query": query,
        "max_results": max_results,
        "search_depth": "basic",
        "include_answer": True,
    }
    try:
        data = outbound_guard.post_json(_TAVILY_URL, payload)
    except ValueError as exc:
        return ToolResult.fail(TOOL, _TAVILY_URL, str(exc))
    hits = [
        {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")}
        for r in data.get("results", [])
    ]
    return ToolResult(
        tool=TOOL,
        source="Tavily",
        data={"answer": data.get("answer"), "results": hits},
    )


def _duckduckgo(query: str, max_results: int) -> ToolResult:
    try:
        body = outbound_guard.post_form(_DDG_URL, {"q": query})
    except ValueError as exc:
        return ToolResult.fail(TOOL, "DuckDuckGo", str(exc))

    links = _DDG_LINK.findall(body)
    snippets = _DDG_SNIPPET.findall(body)
    hits = [
        {
            "title": _clean(title),
            "url": _normalize(url),
            "snippet": _clean(snippets[i]) if i < len(snippets) else "",
        }
        for i, (url, title) in enumerate(links[:max_results])
    ]
    return ToolResult(tool=TOOL, source="DuckDuckGo (keyless)", data={"answer": None, "results": hits})


def _normalize(href: str) -> str:
    """DDG Lite gives direct URLs; add a scheme to any protocol-relative link."""
    return "https:" + href if href.startswith("//") else href


def _clean(fragment: str) -> str:
    """Strip HTML tags/entities from a fragment."""
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()
