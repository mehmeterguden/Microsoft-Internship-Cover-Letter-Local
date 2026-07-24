"""Tech stack agent — languages, frameworks, cloud & developer tooling.

Identifies languages, frameworks, databases, cloud infrastructure, and DevOps tooling
the company builds with from public repositories, blog posts, and technical postings.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import TechItem
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are a principal software architect. You identify the concrete technologies, "
    "programming languages, frameworks, cloud services, and developer tooling a company builds with. "
    "You use exact technology names and avoid broad categories."
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
                query=f"{ctx.company_name} tech stack programming languages frameworks infrastructure database cloud",
                max_results=6,
            ),
        ]

    def section_from(self, validated: _TechList) -> list[TechItem]:
        return validated.tech_stack

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        prompt = (
            f'Company: "{ctx.company_name}".\n\n'
            f"Gathered Material:\n{format_gathered(gathered)}\n\n"
            "Identify up to 10 specific, concrete technologies used by this company.\n"
            "Return ONLY:\n"
            '{"tech_stack": [{"name": str}]}\n\n'
            "Guidelines:\n"
            "- Use precise technological names (e.g., \"TypeScript\", \"Python\", \"React\", \"PostgreSQL\", \"Kubernetes\", \"AWS\", \"Kafka\", \"GraphQL\").\n"
            "- Do NOT use vague terms like \"Frontend\", \"Databases\", or \"Cloud\".\n"
            "- De-duplicate and list the most prevalent technologies."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
