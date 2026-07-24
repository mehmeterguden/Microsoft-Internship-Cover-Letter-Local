"""JD Analyst agent — job posting decomposition & ATS requirement extraction.

Parses authoritative job descriptions or web search intel into clean responsibilities,
must-haves, nice-to-haves, and core ATS keywords for profile scoring and letter tailoring.
"""

from __future__ import annotations

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import RoleAnalysis
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are a technical talent analyst and ATS expert. You extract hard requirements, "
    "preferred qualifications, core responsibilities, and key ATS skill keywords from job postings. "
    "You eliminate duplicates and isolate exact technical/professional terms."
)


class JDAnalystAgent(Agent):
    name = "jd_analyst"
    section = "role"
    output_model = RoleAnalysis

    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        if ctx.job_description and ctx.job_description.strip():
            return []
        role = ctx.role_title or "the role"
        return [
            registry.call(
                "web_search",
                query=f"{role} at {ctx.company_name} job responsibilities requirements skills",
                max_results=6,
            )
        ]

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        if ctx.job_description and ctx.job_description.strip():
            material = f"Authoritative Job Description:\n{ctx.job_description.strip()[:8000]}"
        else:
            material = (
                "No pasted job description provided. Infer requirements from gathered search results:\n"
                f"{format_gathered(gathered)}"
            )
        prompt = (
            f'Target Role: "{ctx.role_title or "Unknown Role"}" at "{ctx.company_name}".\n\n'
            f"{material}\n\n"
            "Return ONLY a JSON object:\n"
            '{"title": str|null, "responsibilities": [str], "must_haves": [str], '
            '"nice_to_haves": [str], "keywords": [str]}\n\n'
            "Guidelines:\n"
            "- `must_haves`: Mandatory technical/experience requirements.\n"
            "- `nice_to_haves`: Preferred or bonus qualifications.\n"
            "- `keywords`: Concise ATS skills & technologies (e.g. \"React\", \"TypeScript\", \"Distributed Systems\", \"CI/CD\").\n"
            "- Keep items distinct, concise, and non-redundant."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
