"""AI Profile Interview & Context Generator Core Engine.

Gathers candidate profile context, invokes LLM to generate dynamic, typed interview
questions (boolean, single_choice, multi_select, rating, text), and synthesizes user
answers into rich technical narratives in the database.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from core import llm
from core.prompts.interview import (
    build_question_messages,
    build_synthesis_messages,
)
from db import queries


def gather_context() -> dict[str, Any]:
    """Gather current profile, projects, experiences, skills, and repos."""
    profile = queries.get_profile() or {}
    tables = ("projects", "experiences", "skills", "education", "github_repos")
    lists = {t: queries.list_all(t) for t in tables}
    return {
        "profile": profile,
        "projects": lists["projects"],
        "experiences": lists["experiences"],
        "skills": lists["skills"],
        "education": lists["education"],
        "github_repos": lists["github_repos"],
    }


def _format_context(ctx: dict[str, Any]) -> str:
    """Format gathered profile material into a concise block for LLM prompts."""
    lines: list[str] = ["== CANDIDATE PROFILE SUMMARY =="]
    p = ctx["profile"]
    if p.get("name") or p.get("surname"):
        lines.append(f"Name: {p.get('name', '')} {p.get('surname', '')}".strip())
    if p.get("summary"):
        lines.append(f"Summary: {p.get('summary')}")

    if ctx["projects"]:
        lines.append("\n-- PROJECTS --")
        for proj in ctx["projects"]:
            desc = (proj.get("description") or "(No description)").strip()
            techs = ", ".join(proj.get("technologies") or [])
            lines.append(f"• ID {proj.get('id')}: {proj.get('name')} [Tech: {techs}] - {desc}")

    if ctx["experiences"]:
        lines.append("\n-- WORK EXPERIENCES --")
        for exp in ctx["experiences"]:
            desc = (exp.get("description") or "(No description)").strip()
            lines.append(f"• ID {exp.get('id')}: {exp.get('title')} at {exp.get('company')} - {desc}")

    if ctx["skills"]:
        lines.append("\n-- SKILLS --")
        skill_names = [f"{s.get('name')} (Rating: {s.get('self_rating', '?')}/5)" for s in ctx["skills"]]
        lines.append(", ".join(skill_names))

    return "\n".join(lines)


def get_next_question(history: list[dict[str, Any]]) -> dict[str, Any]:
    """Generate the next dynamic interview question based on profile context & history.

    Returns a typed question dict matching schema:
    {
      "id": str,
      "target_type": "project" | "experience" | "skill" | "general",
      "target_id": int | None,
      "target_name": str,
      "question": str,
      "type": "boolean" | "single_choice" | "multi_select" | "rating" | "text",
      "options": list[str] | None,
      "allow_custom": bool,
      "hint": str
    }
    """
    ctx = gather_context()
    context_str = _format_context(ctx)

    history_str = ""
    asked_questions: set[str] = set()
    if history:
        history_lines = []
        for item in history:
            q_text = item.get("question", "")
            if q_text:
                asked_questions.add(q_text)
                ans_text = item.get("answer", "(Skipped)")
                history_lines.append(f"Q: {q_text} -> A: {ans_text}")
        history_str = "\n".join(history_lines)

    messages = build_question_messages(context_str, history_str)

    try:
        raw = llm.complete(messages, temperature=0.5, max_tokens=1000)
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            data = json.loads(raw[start : end + 1])
            # Ensure required fields exist
            if data.get("question") and data.get("type"):
                data["id"] = data.get("id") or f"q_{uuid.uuid4().hex[:8]}"
                if data["type"] in ("single_choice", "multi_select") and not data.get("options"):
                    data["options"] = ["Option A", "Option B", "Option C"]
                data["allow_custom"] = bool(data.get("allow_custom", True))
                return data
    except Exception:
        pass  # Fallback logic if LLM call or parsing fails

    # Robust fallback questions if LLM fails or profile is minimal
    return _generate_fallback_question(ctx, asked_questions)


def _generate_fallback_question(ctx: dict[str, Any], asked_questions: set[str]) -> dict[str, Any]:
    """Produce deterministic fallback questions if LLM generation is unavailable."""
    projects = ctx.get("projects") or []
    experiences = ctx.get("experiences") or []

    for proj in projects:
        q1 = f"What was your biggest technical challenge in {proj.get('name')}?"
        if q1 not in asked_questions:
            return {
                "id": f"q_fallback_proj_{proj.get('id')}",
                "target_type": "project",
                "target_id": proj.get("id"),
                "target_name": proj.get("name"),
                "question": q1,
                "type": "text",
                "options": None,
                "allow_custom": True,
                "hint": "Describe the technical hurdle, how you solved it, and what you learned.",
            }

        q2 = f"Did {proj.get('name')} involve automated testing or CI/CD pipelines?"
        if q2 not in asked_questions:
            return {
                "id": f"q_fallback_proj_bool_{proj.get('id')}",
                "target_type": "project",
                "target_id": proj.get("id"),
                "target_name": proj.get("name"),
                "question": q2,
                "type": "boolean",
                "options": ["Yes, full CI/CD", "No, manual testing"],
                "allow_custom": False,
                "hint": "Select your testing/deployment setup.",
            }

    for exp in experiences:
        q_exp = f"Which key technologies did you use most during your role at {exp.get('company')}?"
        if q_exp not in asked_questions:
            return {
                "id": f"q_fallback_exp_{exp.get('id')}",
                "target_type": "experience",
                "target_id": exp.get("id"),
                "target_name": f"{exp.get('title')} at {exp.get('company')}",
                "question": q_exp,
                "type": "multi_select",
                "options": ["Python", "JavaScript / TypeScript", "Docker", "PostgreSQL", "React", "Git"],
                "allow_custom": True,
                "hint": "Select all that apply or add your own in 'Other'.",
            }

    # General fallback
    return {
        "id": f"q_fallback_gen_{uuid.uuid4().hex[:4]}",
        "target_type": "general",
        "target_id": None,
        "target_name": "General Career Context",
        "question": "What is the primary technical skill or domain you want to highlight for upcoming roles?",
        "type": "text",
        "options": None,
        "allow_custom": True,
        "hint": "e.g. Full-Stack System Architecture, AI/ML Infrastructure, Cloud DevOps",
    }


def synthesize_answers(answers: list[dict[str, Any]]) -> dict[str, Any]:
    """Synthesize collected Q&A pairs into rich technical descriptions and update DB.

    `answers` is a list of:
    {
       "question_id": str,
       "target_type": "project" | "experience" | "skill" | "general",
       "target_id": int | None,
       "question": str,
       "answer": str | list[str] | bool | int
    }
    """
    if not answers:
        return {"ok": True, "updated_count": 0, "updates": {}}

    ctx = gather_context()
    context_str = _format_context(ctx)

    qa_lines = []
    for a in answers:
        q_txt = a.get("question", "")
        ans_val = a.get("answer")
        if isinstance(ans_val, list):
            ans_str = ", ".join(str(x) for x in ans_val)
        else:
            ans_str = str(ans_val)
        qa_lines.append(f"Target [{a.get('target_type')}:{a.get('target_id')}]: Question: '{q_txt}' -> Answer: '{ans_str}'")

    qa_pairs_str = "\n".join(qa_lines)
    messages = build_synthesis_messages(context_str, qa_pairs_str)

    try:
        raw = llm.complete(messages, temperature=0.3, max_tokens=2000)
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            data = json.loads(raw[start : end + 1])
            return _apply_synthesis_updates(data)
    except Exception as exc:
        # Fallback: direct string append if LLM synthesis fails
        return _apply_fallback_updates(answers)

    return {"ok": True, "updated_count": 0, "updates": {}}


def _apply_synthesis_updates(data: dict[str, Any]) -> dict[str, Any]:
    """Apply structured updates from LLM synthesis to DB rows."""
    updated_count = 0
    updates_applied: dict[str, list[int]] = {"projects": [], "experiences": [], "skills": []}

    for p in data.get("updated_projects") or []:
        pid, desc = p.get("id"), p.get("description")
        if pid and desc:
            if queries.update("projects", pid, {"description": desc}):
                updated_count += 1
                updates_applied["projects"].append(pid)

    for e in data.get("updated_experiences") or []:
        eid, desc = e.get("id"), e.get("description")
        if eid and desc:
            if queries.update("experiences", eid, {"description": desc}):
                updated_count += 1
                updates_applied["experiences"].append(eid)

    for s in data.get("updated_skills") or []:
        sid, note = s.get("id"), s.get("note")
        if sid and note:
            if queries.update("skills", sid, {"note": note}):
                updated_count += 1
                updates_applied["skills"].append(sid)

    return {"ok": True, "updated_count": updated_count, "updates": updates_applied}


def _apply_fallback_updates(answers: list[dict[str, Any]]) -> dict[str, Any]:
    """Fallback if LLM fails: directly append key Q&A information to items."""
    updated_count = 0
    updates_applied: dict[str, list[int]] = {"projects": [], "experiences": [], "skills": []}

    for a in answers:
        ttype = a.get("target_type")
        tid = a.get("target_id")
        ans = a.get("answer")
        if not ttype or not tid or ans is None:
            continue

        ans_str = ", ".join(ans) if isinstance(ans, list) else str(ans)
        entry_note = f"\n• Interview insight: {a.get('question')} -> {ans_str}"

        if ttype == "project":
            row = queries.get_by_id("projects", tid)
            if row:
                old_desc = row.get("description") or ""
                new_desc = (old_desc + entry_note).strip()
                if queries.update("projects", tid, {"description": new_desc}):
                    updated_count += 1
                    updates_applied["projects"].append(tid)

        elif ttype == "experience":
            row = queries.get_by_id("experiences", tid)
            if row:
                old_desc = row.get("description") or ""
                new_desc = (old_desc + entry_note).strip()
                if queries.update("experiences", tid, {"description": new_desc}):
                    updated_count += 1
                    updates_applied["experiences"].append(tid)

        elif ttype == "skill":
            row = queries.get_by_id("skills", tid)
            if row:
                old_note = row.get("note") or ""
                new_note = (old_note + entry_note).strip()
                if queries.update("skills", tid, {"note": new_note}):
                    updated_count += 1
                    updates_applied["skills"].append(tid)

    return {"ok": True, "updated_count": updated_count, "updates": updates_applied}
