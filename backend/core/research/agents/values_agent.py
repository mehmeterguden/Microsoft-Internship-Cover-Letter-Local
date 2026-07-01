"""Values agent — what the company weights in candidates, scored.

Reads the company's stated values / leadership principles / careers messaging and
returns a ranked list with a 0–100 weight each — the "echo these in your letter"
signals. Grounded in the gathered sources; weights reflect how strongly each value
is emphasized, not invented precision.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import ValueSignal
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are a company-research analyst. You infer what a company most values in "
    "its people from its own words (values, leadership principles, careers pages) "
    "and return JSON. You ground every value in the sources and never invent them."
)


class _ValueList(BaseModel):
    values: list[ValueSignal] = Field(default_factory=list)


class ValuesAgent(Agent):
    name = "values"
    section = "values"
    output_model = _ValueList

    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        return [
            registry.call(
                "web_search",
                query=f"{ctx.company_name} core values leadership principles what they look for in candidates",
                max_results=5,
            )
        ]

    def section_from(self, validated: _ValueList) -> list[ValueSignal]:
        return sorted(validated.values, key=lambda v: v.weight, reverse=True)

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        prompt = (
            f'Company: "{ctx.company_name}".\n\n'
            f"Gathered sources:\n{format_gathered(gathered)}\n\n"
            "Identify up to 5 things this company weights most in candidates.\n"
            "Return ONLY:\n"
            '{"values": [{"name": str, "weight": int}]}\n\n'
            "- `weight` is 0–100 reflecting how strongly the sources emphasize it.\n"
            "- Use the company's own language (e.g. \"Growth mindset\", \"Customer obsession\").\n"
            "- Order does not matter; ground every item in the sources."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
