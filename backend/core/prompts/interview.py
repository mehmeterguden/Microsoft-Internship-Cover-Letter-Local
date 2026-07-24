"""Prompts for the AI Profile Interview & Context Generator.

1. `build_question_messages()` — Generates a dynamic, personalized interview question
   across varied types (boolean, single_choice, multi_select, rating, text) to explore
   shallow areas in a user's projects, experience, or skills.

2. `build_synthesis_messages()` — Takes user responses and synthesizes them into rich,
   compelling first-person technical narratives for each targeted profile entity.
"""

from __future__ import annotations

from core.llm.base import Message

_QUESTION_SYSTEM = (
    "You are an expert technical interviewer and career strategist. Your job is to analyze "
    "a candidate's profile (projects, work experience, skills) and ask ONE targeted, "
    "insightful interview question to uncover deeper technical context, metrics, challenges, "
    "or learned skills.\n\n"
    "VARIETY IS KEY. You MUST support varied question types depending on what best extracts "
    "the information:\n"
    "- 'boolean': True/False question (e.g. 'Did this project serve live production users?').\n"
    "- 'single_choice': Select one option from a list.\n"
    "- 'multi_select': Select multiple options from a list. Always set allow_custom: true "
    "so the user can write in an 'Other' option if their choice isn't listed.\n"
    "- 'rating': Rate an aspect on a scale of 1 to 5 (e.g. 'How much architecture design did you own?').\n"
    "- 'text': Short open-ended question for free text response.\n\n"
    "RULES:\n"
    "1. Pick a specific project, work experience, or skill that is shallow or lacks detail.\n"
    "2. Never repeat questions previously asked in the history.\n"
    "3. Keep options concise and relevant.\n"
    "4. Return strict JSON matching the required schema.\n"
)

QUESTION_JSON_SCHEMA = """{
  "id": "q_12345",                   // unique identifier
  "target_type": "project" | "experience" | "skill" | "general",
  "target_id": 12,                    // integer ID of the target entity (or null for general)
  "target_name": "Project Alpha",     // name/title of the entity being questioned
  "question": "What primary database did you use for Project Alpha?",
  "type": "multi_select",             // "boolean" | "single_choice" | "multi_select" | "rating" | "text"
  "options": ["PostgreSQL", "MongoDB", "Redis", "SQLite"], // list of strings (for single_choice / multi_select)
  "allow_custom": true,               // true allows an "Other" write-in field in UI
  "hint": "Select all technologies that apply or add your own."
}"""


def build_question_messages(context_str: str, history_str: str) -> list[Message]:
    """Build system and user prompts to generate the next interview question."""
    user = (
        f"== CANDIDATE PROFILE MATERIAL ==\n{context_str}\n\n"
        f"== QUESTION HISTORY (DO NOT REPEAT) ==\n{history_str or '(None yet)'}\n\n"
        "Generate ONE highly relevant interview question to deepen this profile. "
        f"Return ONLY a JSON object matching this schema:\n{QUESTION_JSON_SCHEMA}"
    )
    return [{"role": "system", "content": _QUESTION_SYSTEM}, {"role": "user", "content": user}]


_SYNTHESIS_SYSTEM = (
    "You are a technical profile writer. Given a candidate's profile entities and a series "
    "of answered interview questions, synthesize the new insights into updated, rich, "
    "compelling first-person technical descriptions.\n\n"
    "RULES:\n"
    "1. Retain existing facts, do not hallucinate.\n"
    "2. Integrate the user's answers into polished first-person descriptions ('I engineered...', 'I utilized...').\n"
    "3. Return strict JSON mapping each target entity to its updated description/notes.\n"
)

SYNTHESIS_JSON_SCHEMA = """{
  "updated_projects": [
    {
      "id": 12,
      "description": "Engineered the PostgreSQL database architecture for Project Alpha, optimizing query performance and deploying via Docker."
    }
  ],
  "updated_experiences": [
    {
      "id": 5,
      "description": "Led backend microservices development with Go and gRPC, handling high throughput and scaling challenges."
    }
  ],
  "updated_skills": [
    {
      "id": 3,
      "note": "Experienced in configuring PostgreSQL connection pooling and indexing for production workloads."
    }
  ]
}"""


def build_synthesis_messages(context_str: str, qa_pairs_str: str) -> list[Message]:
    """Build system and user prompts to synthesize Q&A pairs into rich profile updates."""
    user = (
        f"== CURRENT PROFILE MATERIAL ==\n{context_str}\n\n"
        f"== ANSWERED INTERVIEW QUESTIONS ==\n{qa_pairs_str}\n\n"
        "Synthesize these answers to enrich the targeted projects, experiences, and skills. "
        f"Return ONLY a JSON object matching this schema:\n{SYNTHESIS_JSON_SCHEMA}"
    )
    return [{"role": "system", "content": _SYNTHESIS_SYSTEM}, {"role": "user", "content": user}]
