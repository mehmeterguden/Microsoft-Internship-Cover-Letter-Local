"""Signals agent — recent news that matters to an applicant.

Pulls recent articles from GDELT and asks the LLM to keep the few that genuinely
matter to someone applying (launches, funding, strategy, hiring, controversy),
each with a one-line "why it matters", dropping noise and duplicates.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import NewsSignal
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are a company-research analyst. From a list of recent news articles you "
    "select the ones that would actually matter to a job applicant and explain why, "
    "returning JSON. You keep the original dates and URLs; you never fabricate news."
)


class _SignalList(BaseModel):
    signals: list[NewsSignal] = Field(default_factory=list)


class SignalsAgent(Agent):
    name = "signals"
    section = "signals"
    output_model = _SignalList

    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        return [registry.call("news", company_name=ctx.company_name, max_results=12)]

    def section_from(self, validated: _SignalList) -> list[NewsSignal]:
        return validated.signals

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        prompt = (
            f'Company: "{ctx.company_name}".\n\n'
            f"Recent articles:\n{format_gathered(gathered)}\n\n"
            "Pick up to 5 articles that genuinely matter to a job applicant "
            "(product launches, funding, strategy shifts, hiring, notable events). "
            "Drop tangential mentions and near-duplicates.\n\n"
            "Return ONLY:\n"
            '{"signals": [{"headline": str, "date": str|null, "url": str|null, '
            '"why_it_matters": str}]}\n\n'
            "Keep each article's original headline, date, and url. `why_it_matters` "
            "is one concrete sentence on the relevance to a candidate."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
