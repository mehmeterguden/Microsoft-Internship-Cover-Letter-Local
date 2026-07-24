"""Company Profile agent — combines Firmographics, Overview, and Values into a single efficient agent pass.

Instead of running 3 separate LLM calls to analyze company facts, overview summary,
and core values, this agent gathers sources once and synthesizes all three core
identity sections in a single unified prompt.
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
    "You are a senior company-research analyst. You extract firm factual identity, "
    "overview summary, and core company values into a single structured JSON response. "
    "You ground every claim in the provided sources, never invent data, and use null when unknown."
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
                query=f"{ctx.company_name} company headquarters founded industry employees mission core values",
                max_results=6,
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
            f'The applicant is targeting the role: "{ctx.role_title}". '
            "Add one sentence of division_context in overview about what such a team likely does.\n"
            if ctx.role_title
            else "No specific role given; set division_context to null.\n"
        )
        prompt = (
            f'Company to research: "{ctx.company_name}".\n\n'
            f"Gathered sources:\n{format_gathered(gathered)}\n\n"
            f"{role_line}\n"
            "Return ONLY a JSON object with this exact structure:\n"
            "{\n"
            '  "firmographics": {\n'
            '    "industry": str|null, "size": str|null, "employees": int|null,\n'
            '    "hq": str|null, "founded": str|null, "website": str|null\n'
            '  },\n'
            '  "overview": {\n'
            '    "summary": str|null, "mission": str|null, "division_context": str|null\n'
            '  },\n'
            '  "values": [\n'
            '    {"name": str, "weight": int}\n'
            '  ]\n'
            "}\n\n"
            "Rules:\n"
            "- `firmographics.size` is a human string like \"221,000 employees\".\n"
            "- `firmographics.website` must be the official site.\n"
            "- `overview.summary`: 1-2 factual sentences on what the company builds/does.\n"
            "- `values`: up to 5 things this company weights most in people (weight 0-100).\n"
            "- Ground all data strictly in the sources."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]


def _first_url(search: ToolResult) -> str | None:
    if not search.ok or not search.data:
        return None
    results = search.data.get("results", [])
    return results[0]["url"] if results and results[0].get("url") else None
