"""Company Profile agent — unified core identity pass (Firmographics, Overview, Values).

Synthesizes firm facts, company mission/summary, and core leadership principles/values
in a single structured JSON response. Eliminates fluff and grounds every fact in
the gathered public web sources.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import Firmographics, Overview, ValueSignal
from core.research.tools import registry
from core.research.tools.registry import ToolResult


class CompanyProfile(BaseModel):
    firmographics: Firmographics = Field(default_factory=Firmographics)
    overview: Overview = Field(default_factory=Overview)
    values: list[ValueSignal] = Field(default_factory=list)


_SYSTEM = (
    "You are an elite corporate intelligence analyst. Your goal is to extract zero-fluff, "
    "high-precision facts about a company's business model, identity, firmographics, and "
    "core cultural values into a valid JSON object. Avoid generic buzzwords (e.g. 'industry leader', "
    "'fast-growing startup', 'passionate team'). Be concrete, factual, and strictly truthful to sources."
)


class CompanyProfileAgent(Agent):
    name = "company_profile"
    section = "company_profile"
    output_model = CompanyProfile

    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        gathered = [
            registry.call("firmographics", company_name=ctx.company_name),
            registry.call("wikipedia", company_name=ctx.company_name),
            registry.call(
                "web_search",
                query=f"{ctx.company_name} official website headquarters founded employee count mission about",
                max_results=5,
            ),
            registry.call(
                "web_search",
                query=f"{ctx.company_name} core values leadership principles candidate attributes",
                max_results=5,
            ),
        ]
        top_url = _first_url(gathered[2])
        if top_url:
            gathered.append(registry.call("web_fetch", url=top_url))
        return gathered

    def section_from(self, validated: CompanyProfile) -> CompanyProfile:
        validated.values = sorted(validated.values, key=lambda v: v.weight, reverse=True)
        return validated

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        role_line = (
            f'Target role: "{ctx.role_title}". '
            "Provide 1 specific sentence in `division_context` explaining the core focus of such a engineering/business unit at this company.\n"
            if ctx.role_title
            else "No target role provided; set `division_context` to null.\n"
        )
        prompt = (
            f'Target Company: "{ctx.company_name}".\n\n'
            f"Gathered Material:\n{format_gathered(gathered)}\n\n"
            f"{role_line}\n"
            "Produce ONLY a valid JSON object following this exact schema:\n"
            "{\n"
            '  "firmographics": {\n'
            '    "industry": str|null,\n'
            '    "size": str|null,\n'
            '    "employees": int|null,\n'
            '    "hq": str|null,\n'
            '    "founded": str|null,\n'
            '    "website": str|null\n'
            '  },\n'
            '  "overview": {\n'
            '    "summary": str|null,\n'
            '    "mission": str|null,\n'
            '    "division_context": str|null\n'
            '  },\n'
            '  "values": [\n'
            '    {"name": str, "weight": int}\n'
            '  ]\n'
            "}\n\n"
            "Guidelines:\n"
            "- `overview.summary`: 1-2 concise, high-substance sentences describing what product/platform they build, who pays for it, and their core scale.\n"
            "- `firmographics.website`: Must be the official primary domain (e.g. \"https://anthropic.com\").\n"
            "- `values`: Up to 5 authentic leadership/cultural principles using their actual terminology (e.g., \"Customer Obsession\", \"Bias for Action\", \"Safety First\"). `weight` is 0-100 indicating emphasis."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]


def _first_url(search: ToolResult) -> str | None:
    if not search.ok or not search.data:
        return None
    results = search.data.get("results", [])
    return results[0]["url"] if results and results[0].get("url") else None
