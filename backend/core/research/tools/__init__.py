"""The research tool belt — every free data source, registered in one place.

Import `registry` to reach the tools by name:

    from core.research.tools import registry
    result = registry.call("firmographics", company_name="Microsoft")

Each tool gathers from a single free source and returns a `ToolResult`. Agents
(a later phase) pick tools from `registry.specs()`; nothing here decides *when*
to call what — that is orchestration, which lives elsewhere.
"""

from __future__ import annotations

from core.research.tools import (
    firmographics,
    github_org,
    hackernews,
    news,
    web_fetch,
    web_search,
    wikipedia,
)
from core.research.tools.registry import Tool, ToolRegistry, ToolResult

# The process-wide registry, populated once at import.
registry = ToolRegistry()

registry.register(
    "web_search",
    "Search the web for a query; returns ranked {title, url, snippet} hits.",
    web_search.search,
)
registry.register(
    "web_fetch",
    "Download a URL and extract its main readable text (careers/about/blog pages).",
    web_fetch.fetch,
)
registry.register(
    "firmographics",
    "Structured company facts (industry, size, HQ, founded, website) from Wikidata.",
    firmographics.lookup,
)
registry.register(
    "news",
    "Recent news articles mentioning the company (headline, date, url) from GDELT.",
    news.recent,
)
registry.register(
    "github_org",
    "The company's public GitHub org: top repos and language mix (open-source posture).",
    github_org.profile,
)
registry.register(
    "hackernews",
    "Most-discussed Hacker News stories mentioning the company (developer sentiment).",
    hackernews.discussions,
)
registry.register(
    "wikipedia",
    "A clean, neutral company summary from Wikipedia (grounding for the overview).",
    wikipedia.summary,
)

__all__ = ["registry", "Tool", "ToolRegistry", "ToolResult"]
