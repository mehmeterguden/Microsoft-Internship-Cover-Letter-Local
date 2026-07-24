"""Interview agent — ordered hiring loop focus areas & candidate prep notes.

Researches the company's technical/hiring interview process and returns an ordered list
of rounds/focus areas with actionable preparation tips for the candidate.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import InterviewFocus
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are an executive tech interview coach. You analyze a company's hiring process "
    "to provide candidates with an accurate, ordered breakdown of what the loop tests, "
    "paired with high-impact, specific prep advice."
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
                query=f"{ctx.company_name} {role} interview process rounds system design coding questions loop",
                max_results=6,
            )
        ]

    def section_from(self, validated: _InterviewList) -> list[InterviewFocus]:
        return sorted(validated.interview, key=lambda i: i.order)

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        role = ctx.role_title or "the target role"
        prompt = (
            f'Target Company: "{ctx.company_name}", Role: "{role}".\n\n'
            f"Gathered Interview Intel:\n{format_gathered(gathered)}\n\n"
            "Return ONLY:\n"
            '{"interview": [{"order": int, "area": str, "note": str}]}\n\n'
            "Guidelines:\n"
            "- Provide 3-5 ordered interview focus areas (1, 2, 3...).\n"
            "- `area`: Specific round title (e.g., \"Coding & Problem Solving\", \"Distributed System Design\", \"Architecture & Past Projects Deep Dive\", \"Behavioral & Culture Alignment\").\n"
            "- `note`: 1 concrete, actionable preparation tip for this specific company."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
