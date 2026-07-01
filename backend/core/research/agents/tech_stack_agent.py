"""Tech stack agent — the technologies the company builds with.

Combines the company's public GitHub language mix with what job posts and
engineering pages mention, and returns a de-duplicated list of technologies. It
does NOT decide what the user knows — the you-know / worth-learning flags are set
later by the local fit step, so the profile never enters this (possibly cloud) call.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import TechItem
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are a technical company-research analyst. You identify the technologies a "
    "company builds with, grounded in its GitHub languages and engineering sources, "
    "and return JSON. You never guess technologies that the sources do not support."
)


class _TechList(BaseModel):
    tech_stack: list[TechItem] = Field(default_factory=list)


class TechStackAgent(Agent):
    name = "tech_stack"
    section = "tech_stack"
    output_model = _TechList

    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        return [
            registry.call("github_org", company_name=ctx.company_name),
            registry.call(
                "web_search",
                query=f"{ctx.company_name} tech stack technologies programming languages engineering",
                max_results=4,
            ),
        ]

    def section_from(self, validated: _TechList) -> list[TechItem]:
        return validated.tech_stack

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        prompt = (
            f'Company: "{ctx.company_name}".\n\n'
            f"Gathered sources:\n{format_gathered(gathered)}\n\n"
            "List up to 10 concrete technologies the company uses "
            "(languages, frameworks, platforms).\n"
            "Return ONLY:\n"
            '{"tech_stack": [{"name": str}]}\n\n'
            "- Prefer specific names (\"TypeScript\", \"Rust\", \"Kubernetes\") over categories.\n"
            "- Do NOT include you_know/worth_learning — those are set elsewhere.\n"
            "- Ground every item in the sources; de-duplicate."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
