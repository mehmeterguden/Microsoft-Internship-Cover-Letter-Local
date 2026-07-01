"""JD analyst agent — decompose the job posting.

If the user pasted a job description, this parses it into responsibilities,
must-haves, nice-to-haves, and keywords. If not, it searches for what the role
typically involves at the company so the report is still useful. This section is
the raw material the local fit analysis (Phase 3) scores the profile against.
"""

from __future__ import annotations

from core.llm.base import Message
from core.research.agent_base import Agent, AgentContext, format_gathered
from core.research.schema import RoleAnalysis
from core.research.tools import registry
from core.research.tools.registry import ToolResult

_SYSTEM = (
    "You are a technical recruiter. You decompose a job posting into structured, "
    "de-duplicated lists and return JSON. You extract only what the posting states "
    "or clearly implies; you do not invent requirements."
)


class JDAnalystAgent(Agent):
    name = "jd_analyst"
    section = "role"
    output_model = RoleAnalysis

    def gather(self, ctx: AgentContext) -> list[ToolResult]:
        # A pasted description is the source of truth — no external call needed.
        if ctx.job_description and ctx.job_description.strip():
            return []
        role = ctx.role_title or "the role"
        return [
            registry.call(
                "web_search",
                query=f"{role} at {ctx.company_name} responsibilities requirements",
                max_results=5,
            )
        ]

    def build_messages(self, ctx: AgentContext, gathered: list[ToolResult]) -> list[Message]:
        if ctx.job_description and ctx.job_description.strip():
            material = f"Job description (authoritative):\n{ctx.job_description.strip()[:8000]}"
        else:
            material = (
                "No job description was provided. Infer the typical shape of this role "
                f"from these search results:\n{format_gathered(gathered)}"
            )
        prompt = (
            f'Role title: "{ctx.role_title or "unknown"}" at "{ctx.company_name}".\n\n'
            f"{material}\n\n"
            "Return ONLY a JSON object:\n"
            '{"title": str|null, "responsibilities": [str], "must_haves": [str], '
            '"nice_to_haves": [str], "keywords": [str]}\n\n'
            "- `keywords`: concrete skills/technologies (e.g. \"React\", \"Kubernetes\").\n"
            "- Keep each list concise and de-duplicated. Empty lists are fine."
        )
        return [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
