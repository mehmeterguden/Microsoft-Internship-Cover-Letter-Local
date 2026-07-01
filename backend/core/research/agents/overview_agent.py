"""Overview agent — what the company does, its mission, and the role's context.

Searches for the company's own description, reads the best result in full, then
writes a tight overview. When a role title is given, it adds a sentence of
division context (what the team the applicant is targeting likely does).
"""

from __future__ import annotations

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import Overview
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are a company-research analyst. You summarize what a company does in clear, "
    "factual prose grounded strictly in the provided sources, and return JSON. "
    "You do not hype or speculate."
)


class OverviewAgent(Agent):
    name = "overview"
    section = "overview"
    output_model = Overview

    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        # Wikipedia gives a clean, neutral base; search + a full page read add depth.
        gathered = [
            registry.call("wikipedia", company_name=ctx.company_name),
            registry.call(
                "web_search",
                query=f"{ctx.company_name} company mission about what they do",
                max_results=5,
            ),
        ]
        top_url = _first_url(gathered[1])
        if top_url:
            gathered.append(registry.call("web_fetch", url=top_url))
        return gathered

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        role_line = (
            f'The applicant is targeting the role: "{ctx.role_title}". '
            "Add one sentence of division_context about what such a team likely does there.\n"
            if ctx.role_title
            else "No specific role given; set division_context to null.\n"
        )
        prompt = (
            f'Company: "{ctx.company_name}".\n\n'
            f"Gathered sources:\n{format_gathered(gathered)}\n\n"
            f"{role_line}\n"
            "Return ONLY a JSON object:\n"
            '{"summary": str, "mission": str|null, "division_context": str|null}\n\n'
            "- `summary`: 1–2 sentences on what the company builds and for whom.\n"
            "- `mission`: the company's mission/vision if stated, else null.\n"
            "Ground every claim in the sources; use null rather than guessing."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]


def _first_url(search: ToolResult) -> str | None:
    if not search.ok or not search.data:
        return None
    results = search.data.get("results", [])
    return results[0]["url"] if results and results[0].get("url") else None
