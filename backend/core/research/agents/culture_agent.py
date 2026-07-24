"""Culture agent — engineering & operational ways of working.

Extracts concrete operational signals (remote/hybrid stance, release cadence,
engineering autonomy, incident posture, documentation culture) grounded in public sources.
"""

from __future__ import annotations

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import Culture
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are a tech culture analyst. You extract how a company's engineering team "
    "actually operates day-to-day. You focus on concrete practices (remote stance, code review bar, "
    "deployment frequency, architecture autonomy, on-call culture) rather than marketing platitudes."
)


class CultureAgent(Agent):
    name = "culture"
    section = "culture"
    output_model = Culture

    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        return [
            registry.call(
                "web_search",
                query=f"{ctx.company_name} engineering culture ways of working remote hybrid deployment postmortem",
                max_results=6,
            )
        ]

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        prompt = (
            f'Target Company: "{ctx.company_name}".\n\n'
            f"Gathered Material:\n{format_gathered(gathered)}\n\n"
            "Return ONLY a JSON object:\n"
            '{"ways_of_working": [str]}\n\n'
            "Rules:\n"
            "- Extract 3-6 distinct, concrete statements about how they work (e.g. \"Hybrid-first, 3 days in office\", "
            "\"Continuous deployment with automated canary releases\", \"High documentation culture via RFCs\", \"Blameless postmortems\").\n"
            "- Avoid generic fluff like \"Fun work environment\" or \"Great teammates\". Focus on operational realities."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
