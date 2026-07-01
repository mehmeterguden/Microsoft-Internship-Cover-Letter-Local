"""Firmographics agent — the hard facts, disambiguated.

Wikidata gives structured facts fast but can grab the wrong entity for an
ambiguous name (e.g. "Vercel" the French town vs. Vercel the company). So this
agent gathers both the Wikidata record *and* a web search, then asks the LLM to
reconcile them into the real company's facts — correcting Wikidata when the web
clearly describes a different (correct) entity.
"""

from __future__ import annotations

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import Firmographics
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are a company-research analyst. You extract firm facts about a company "
    "and return them as strict JSON. You never invent data: if a field is unknown, "
    "use null. You disambiguate carefully — if a data source describes a place, a "
    "person, or a different organization that merely shares the name, ignore it."
)


class FirmographicsAgent(Agent):
    name = "firmographics"
    section = "firmographics"
    output_model = Firmographics

    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        return [
            registry.call("firmographics", company_name=ctx.company_name),
            registry.call(
                "web_search",
                query=f"{ctx.company_name} company headquarters founded industry employees",
                max_results=5,
            ),
        ]

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        prompt = (
            f'Company to research: "{ctx.company_name}".\n\n'
            f"Gathered sources:\n{format_gathered(gathered)}\n\n"
            "Return ONLY a JSON object with these fields (use null when unknown):\n"
            '{"industry": str|null, "size": str|null, "employees": int|null, '
            '"hq": str|null, "founded": str|null, "website": str|null}\n\n'
            "Rules:\n"
            "- `size` is a human string like \"221,000 employees\".\n"
            "- `founded` is a year or ISO date.\n"
            "- `website` must be the company's OFFICIAL site. If the structured "
            "source points somewhere that clearly is not this company (a town, a "
            "different org), prefer the website found via web search instead.\n"
            "- Trust web-search results over the structured record when they conflict "
            "about which entity is the real company."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
