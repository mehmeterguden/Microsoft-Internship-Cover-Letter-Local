"""Culture agent — how the company actually works.

Summarizes the company's ways of working (hybrid/remote, pace, open-source
posture, mentorship, reliability bar) as a short, concrete checklist grounded in
the gathered sources.
"""

from __future__ import annotations

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import Culture
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are a company-research analyst. You describe how a company works day to day "
    "in short, concrete statements grounded in the sources, and return JSON. "
    "You avoid vague filler and never invent claims."
)


class CultureAgent(Agent):
    name = "culture"
    section = "culture"
    output_model = Culture

    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        return [
            registry.call(
                "web_search",
                query=f"{ctx.company_name} engineering culture ways of working remote hybrid team",
                max_results=5,
            )
        ]

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        prompt = (
            f'Company: "{ctx.company_name}".\n\n'
            f"Gathered sources:\n{format_gathered(gathered)}\n\n"
            "Return ONLY:\n"
            '{"ways_of_working": [str]}\n\n'
            "- 3–6 short, concrete statements (e.g. \"Hybrid-first, outcomes over hours\", "
            "\"Open-source as a default posture\").\n"
            "- Ground each in the sources; omit anything you cannot support."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
