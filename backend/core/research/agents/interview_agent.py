"""Interview agent — what the company's loop tends to test.

Researches the interview process for the role and returns an ordered set of focus
areas with a short prep note each (coding, system design, behavioral, project
deep-dive, …), grounded in what the sources describe about this company's process.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import InterviewFocus
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are an interview coach. From what sources say about a company's hiring loop, "
    "you produce an ordered list of focus areas with a concrete prep note each, and "
    "return JSON. You keep it specific to this company/role and avoid generic filler."
)


class _InterviewList(BaseModel):
    interview: list[InterviewFocus] = Field(default_factory=list)


class InterviewAgent(Agent):
    name = "interview"
    section = "interview"
    output_model = _InterviewList

    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        role = ctx.role_title or "software engineer"
        return [
            registry.call(
                "web_search",
                query=f"{ctx.company_name} {role} interview process what to expect questions rounds",
                max_results=5,
            )
        ]

    def section_from(self, validated: _InterviewList) -> list[InterviewFocus]:
        return sorted(validated.interview, key=lambda i: i.order)

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        role = ctx.role_title or "the role"
        prompt = (
            f'Company: "{ctx.company_name}", role: "{role}".\n\n'
            f"Gathered sources:\n{format_gathered(gathered)}\n\n"
            "Return ONLY:\n"
            '{"interview": [{"order": int, "area": str, "note": str}]}\n\n'
            "- 3–5 focus areas the loop tends to test, ordered by `order` (1, 2, 3…).\n"
            "- `area` is short (e.g. \"System design at scale\"); `note` is one concrete tip.\n"
            "- Ground it in the sources; if specifics are thin, give the standard loop for this kind of role."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
