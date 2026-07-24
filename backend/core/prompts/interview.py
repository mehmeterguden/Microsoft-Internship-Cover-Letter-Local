"""Prompts for the AI Profile Interview & Context Generator.

1. `build_batch_question_messages()` — Generates N targeted interview questions
   across varied types (boolean, single_choice, multi_select, rating, text) based on
   user's chosen focus area (all, projects, experiences, skills, challenges).

2. `build_synthesis_diff_messages()` — Takes user responses and produces itemized
   Before-and-After diff proposals (current text vs proposed enriched text) for candidate review.
"""

from __future__ import annotations

from core.llm.base import Message

_BATCH_QUESTION_SYSTEM = (
    "You are an expert technical interviewer and career strategist. Your job is to analyze "
    "a candidate's profile (projects, work experience, skills) and generate a specified number "
    "of targeted interview questions tailored to a specific focus area.\n\n"
    "FOCUS AREAS:\n"
    "- 'all': Balanced mix across projects, experience, skills, and challenges.\n"
    "- 'projects': Focus on system architecture, tech stack choices, performance, and scaling.\n"
    "- 'experiences': Focus on team impact, leadership, responsibilities, and outcomes.\n"
    "- 'skills': Focus on practical mastery, tools, and hands-on usage.\n"
    "- 'challenges': Focus on technical obstacles, trade-offs, debugging, and key learnings.\n\n"
    "VARIETY IS KEY. Support varied question types depending on what best extracts information:\n"
    "- 'boolean': True/False question.\n"
    "- 'single_choice': Select one option from a list.\n"
    "- 'multi_select': Select multiple options. Always set allow_custom: true for 'Other' write-in.\n"
    "- 'rating': Rate an aspect 1 to 5.\n"
    "- 'text': Short open-ended response.\n\n"
    "Return strict JSON containing a 'questions' list matching the required schema.\n"
)

BATCH_QUESTION_JSON_SCHEMA = """{
  "questions": [
    {
      "id": "q_1",
      "target_type": "project",           // "project" | "experience" | "skill" | "general"
      "target_id": 12,                    // integer ID of target entity (or null)
      "target_name": "Discord Bot List",   // title of entity
      "question": "What primary database or cache did you implement in Discord Bot List?",
      "type": "multi_select",             // "boolean" | "single_choice" | "multi_select" | "rating" | "text"
      "options": ["Redis", "PostgreSQL", "MongoDB", "SQLite"],
      "allow_custom": true,
      "hint": "Select all that apply or type custom tech."
    }
  ]
}"""


def build_batch_question_messages(context_str: str, count: int, focus: str) -> list[Message]:
    """Build system and user prompts to generate N targeted interview questions."""
    user = (
        f"== CANDIDATE PROFILE MATERIAL ==\n{context_str}\n\n"
        f"== SETUP PARAMETERS ==\nQuestion Count: {count}\nFocus Area: {focus}\n\n"
        f"Generate EXACTLY {count} distinct, high-value interview questions focusing on '{focus}'. "
        f"Return ONLY a JSON object matching this schema:\n{BATCH_QUESTION_JSON_SCHEMA}"
    )
    return [{"role": "system", "content": _BATCH_QUESTION_SYSTEM}, {"role": "user", "content": user}]


_SYNTHESIS_DIFF_SYSTEM = (
    "You are a technical profile writer. Given candidate profile items and a series of "
    "answered interview questions, generate itemized Before-and-After diff proposals.\n\n"
    "RULES:\n"
    "1. Retain existing facts, do not hallucinate.\n"
    "2. For each updated project, experience, or skill, provide:\n"
    "   - 'current_text': the original description/note from the candidate material.\n"
    "   - 'proposed_text': the enriched first-person description integrating the user's answers ('I engineered...', 'I implemented...').\n"
    "3. Only include items that actually received new context from answers.\n"
    "4. Return strict JSON matching the required schema.\n"
)

SYNTHESIS_DIFF_JSON_SCHEMA = """{
  "diffs": [
    {
      "id": "diff_proj_12",
      "target_type": "project",
      "target_id": 12,
      "target_name": "Discord Bot List",
      "current_text": "Built a discord bot listing website.",
      "proposed_text": "Engineered the full-stack architecture for Discord Bot List, integrating Redis caching to handle high request volume and implementing automated CI/CD pipelines."
    }
  ]
}"""


def build_synthesis_diff_messages(context_str: str, qa_pairs_str: str) -> list[Message]:
    """Build system and user prompts to generate Before/After synthesis diff proposals."""
    user = (
        f"== CURRENT PROFILE MATERIAL ==\n{context_str}\n\n"
        f"== ANSWERED INTERVIEW QUESTIONS ==\n{qa_pairs_str}\n\n"
        "Synthesize these answers into Before/After description proposals for review. "
        f"Return ONLY a JSON object matching this schema:\n{SYNTHESIS_DIFF_JSON_SCHEMA}"
    )
    return [{"role": "system", "content": _SYNTHESIS_DIFF_SYSTEM}, {"role": "user", "content": user}]
