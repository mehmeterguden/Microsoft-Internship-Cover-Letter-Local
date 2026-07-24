"""Signals agent — high-relevance recent news & announcements.

Filters recent news and community discussions for events that genuinely matter
to a job applicant (major product launches, funding rounds, strategic pivots, tech releases).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import NewsSignal
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are a strategic career intelligence analyst. You review recent news and developer "
    "discussions about a company to select high-value signals (product launches, major funding, "
    "leadership changes, strategic technical pivots). You explain concisely why each item matters to a candidate."
)


class _SignalList(BaseModel):
    signals: list[NewsSignal] = Field(default_factory=list)


class SignalsAgent(Agent):
    name = "signals"
    section = "signals"
    output_model = _SignalList

    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        return [
            registry.call("news", company_name=ctx.company_name, max_results=12),
            registry.call("hackernews", company_name=ctx.company_name, max_results=6),
        ]

    def section_from(self, validated: _SignalList) -> list[NewsSignal]:
        return validated.signals

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        prompt = (
            f'Company: "{ctx.company_name}".\n\n'
            f"Recent Articles & Community Discussions:\n{format_gathered(gathered)}\n\n"
            "Select up to 5 articles that represent key strategic developments for an applicant.\n"
            "Return ONLY:\n"
            '{"signals": [{"headline": str, "date": str|null, "url": str|null, "why_it_matters": str}]}\n\n'
            "Guidelines:\n"
            "- Preserve exact headlines, dates, and URLs from the sources.\n"
            "- `why_it_matters`: 1 sharp, insightful sentence explaining why this event gives an applicant leverage or context during outreach/interviews."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
