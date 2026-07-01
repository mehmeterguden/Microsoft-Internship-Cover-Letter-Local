"""Prompt for generating a cover letter in the applicant's own voice.

Assembles three blocks — the applicant PROFILE (local), the JOB, and optional
RESEARCH CONTEXT (mission, values, fit, letter hooks from a cached company report)
— into a system+user message pair. The system prompt is where the craft lives:
first person, grounded in the profile, no fabrication, no AI-slop, tight structure.
"""

from __future__ import annotations

from core.llm.base import Message

# Tone → one style line injected into the system prompt.
TONES: dict[str, str] = {
    "professional": "Tone: polished and professional — warm, but not casual.",
    "warm": "Tone: warm, personable and human; let some personality through.",
    "confident": "Tone: confident and direct, results-forward, never arrogant.",
    "concise": "Tone: crisp and concise — every sentence earns its place.",
}

_SYSTEM = """You are helping a job applicant write their own cover letter. You write the letter itself in first person — not advice about it.

Hard rules:
- Ground every claim in the APPLICANT PROFILE. Never invent employers, titles, skills, dates or numbers. If the profile is thin, stay honest and general rather than fabricating.
- {tone}
- Open with a specific hook that connects the applicant to THIS company and role. Never open with "I am writing to express my interest" or similar clichés, and avoid generic AI phrasing ("I am excited to apply", "proven track record", "fast-paced environment").
- Structure, as flowing paragraphs (no bullet lists, no headings): a hook → why the applicant is a strong fit, with concrete evidence from the profile → why this company specifically (use the research context) → a confident, brief close.
- About 250–350 words. No placeholders like [Company] — use the real names given.
- If RESEARCH CONTEXT is provided, weave in the company's mission/values and the letter hooks naturally — do not quote them back mechanically. If fit gaps are noted, you may frame growth briefly and honestly, but do not dwell on weaknesses.

Output ONLY the letter itself, from the greeting through the sign-off. No preamble, no explanations, no notes."""


def build_messages(
    profile_context: str,
    company_name: str,
    role_title: str | None,
    job_description: str | None,
    research_context: str | None,
    tone: str = "professional",
) -> list[Message]:
    """Build the system+user messages for a cover-letter generation."""
    tone_line = TONES.get(tone, TONES["professional"])

    parts = [
        "=== APPLICANT PROFILE ===",
        profile_context or "(no profile imported — write a careful, general letter)",
        "",
        "=== JOB ===",
        f"Company: {company_name}",
        f"Role: {role_title or '(unspecified)'}",
    ]
    if job_description and job_description.strip():
        parts += ["", "Job description:", job_description.strip()[:6000]]
    if research_context:
        parts += ["", "=== RESEARCH CONTEXT (about the company — use it) ===", research_context]

    parts += ["", f"Write the cover letter for {company_name} now."]

    return [
        {"role": "system", "content": _SYSTEM.format(tone=tone_line)},
        {"role": "user", "content": "\n".join(parts)},
    ]
