"""AI Profile Interview & Context Generator Core Engine.

Supports:
1. Batch question generation conditioned by question count and focus area (all, projects, experiences, skills, challenges).
2. Before-and-After Diff Preview synthesis generation for candidate review.
3. Database persistence of approved updates and interview session tracking in `interview_sessions`.
"""

from __future__ import annotations

import datetime
import json
import uuid
from typing import Any

from core import llm
from core.prompts.interview import (
    build_batch_question_messages,
    build_synthesis_diff_messages,
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
        skill_names = [f"ID {s.get('id')}: {s.get('name')} (Rating: {s.get('self_rating', '?')}/5) - {s.get('note') or ''}" for s in ctx["skills"]]
        lines.append("\n".join(skill_names))

    return "\n".join(lines)


def generate_batch_questions(count: int = 5, focus: str = "all") -> list[dict[str, Any]]:
    """Generate a batch of N targeted interview questions based on candidate context and focus area."""
    ctx = gather_context()
    context_str = _format_context(ctx)

    messages = build_batch_question_messages(context_str, count, focus)

    try:
        raw = llm.complete(messages, temperature=0.5, max_tokens=2000)
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            data = json.loads(raw[start : end + 1])
            questions = data.get("questions") or []
            if isinstance(questions, list) and len(questions) > 0:
                validated = []
                for idx, q in enumerate(questions[:count]):
                    q["id"] = q.get("id") or f"q_{idx+1}_{uuid.uuid4().hex[:6]}"
                    if q.get("type") in ("single_choice", "multi_select") and not q.get("options"):
                        q["options"] = ["Option A", "Option B", "Option C"]
                    q["allow_custom"] = bool(q.get("allow_custom", True))
                    validated.append(q)
                if validated:
                    return validated
    except Exception:
        pass

    return _generate_fallback_batch(ctx, count, focus)


def _generate_fallback_batch(ctx: dict[str, Any], count: int, focus: str) -> list[dict[str, Any]]:
    """Deterministic fallback generator for question batches."""
    projects = ctx.get("projects") or []
    experiences = ctx.get("experiences") or []
    skills = ctx.get("skills") or []

    pool: list[dict[str, Any]] = []

    # Project questions
    for proj in projects:
        pool.append({
            "id": f"q_proj_arch_{proj.get('id')}",
            "target_type": "project",
            "target_id": proj.get("id"),
            "target_name": proj.get("name"),
            "question": f"What was your primary technical role & architecture contribution in {proj.get('name')}?",
            "type": "text",
            "options": None,
            "allow_custom": True,
            "hint": "Describe system design, database choices, or component structure.",
        })
        pool.append({
            "id": f"q_proj_bool_{proj.get('id')}",
            "target_type": "project",
            "target_id": proj.get("id"),
            "target_name": proj.get("name"),
            "question": f"Did {proj.get('name')} implement automated testing or CI/CD pipelines?",
            "type": "boolean",
            "options": None,
            "allow_custom": False,
            "hint": "Select Yes or No.",
        })

    # Experience questions
    for exp in experiences:
        pool.append({
            "id": f"q_exp_tech_{exp.get('id')}",
            "target_type": "experience",
            "target_id": exp.get("id"),
            "target_name": f"{exp.get('title')} at {exp.get('company')}",
            "question": f"Which core technologies did you work with most during your role at {exp.get('company')}?",
            "type": "multi_select",
            "options": ["Python", "TypeScript / React", "Docker", "PostgreSQL", "REST APIs", "Git"],
            "allow_custom": True,
            "hint": "Select all that apply or add custom tech.",
        })

    # Skill questions
    for sk in skills[:3]:
        pool.append({
            "id": f"q_sk_rate_{sk.get('id')}",
            "target_type": "skill",
            "target_id": sk.get("id"),
            "target_name": sk.get("name"),
            "question": f"How would you rate your hands-on production proficiency with {sk.get('name')}?",
            "type": "rating",
            "options": None,
            "allow_custom": False,
            "hint": "Scale 1 (Basic) to 5 (Expert / Production Mastery).",
        })

    # General / Challenge question
    pool.append({
        "id": "q_gen_challenge",
        "target_type": "general",
        "target_id": None,
        "target_name": "Technical Problem Solving",
        "question": "What is a memorable technical bug or obstacle you encountered and successfully resolved?",
        "type": "text",
        "options": None,
        "allow_custom": True,
        "hint": "Explain the symptom, root cause, and how you fixed it.",
    })

    # Filter pool based on focus if applicable
    if focus == "projects":
        filtered = [q for q in pool if q["target_type"] == "project"]
    elif focus == "experiences":
        filtered = [q for q in pool if q["target_type"] == "experience"]
    elif focus == "skills":
        filtered = [q for q in pool if q["target_type"] == "skill"]
    elif focus == "challenges":
        filtered = [q for q in pool if q["type"] == "text" or "challenge" in q["id"]]
    else:
        filtered = pool

    res = filtered if len(filtered) >= count else pool
    return res[:count]


def preview_synthesis(answers: list[dict[str, Any]]) -> dict[str, Any]:
    """Generate Before-and-After synthesis diff proposals for user review."""
    if not answers:
        return {"diffs": []}

    ctx = gather_context()
    context_str = _format_context(ctx)

    qa_lines = []
    for a in answers:
        q_text = a.get("question", "")
        t_name = a.get("target_name") or a.get("target_type") or "General"
        ans_val = a.get("answer")
        if isinstance(ans_val, list):
            ans_str = ", ".join(map(str, ans_val))
        else:
            ans_str = str(ans_val)
        qa_lines.append(f"• Target [{t_name}]: Q: {q_text} -> Answer: {ans_str}")

    qa_pairs_str = "\n".join(qa_lines)
    messages = build_synthesis_diff_messages(context_str, qa_pairs_str)

    try:
        raw = llm.complete(messages, temperature=0.4, max_tokens=2000)
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            data = json.loads(raw[start : end + 1])
            diffs = data.get("diffs") or []
            if isinstance(diffs, list) and len(diffs) > 0:
                validated_diffs = []
                for item in diffs:
                    item["id"] = item.get("id") or f"diff_{uuid.uuid4().hex[:6]}"
                    item["approved"] = True
                    validated_diffs.append(item)
                return {"diffs": validated_diffs}
    except Exception:
        pass

    return _generate_fallback_diffs(ctx, answers)


def _generate_fallback_diffs(ctx: dict[str, Any], answers: list[dict[str, Any]]) -> dict[str, Any]:
    """Fallback generator for synthesis diff proposals."""
    grouped: dict[str, list[str]] = {}
    targets_info: dict[str, dict[str, Any]] = {}

    for a in answers:
        t_type = a.get("target_type") or "general"
        t_id = a.get("target_id")
        key = f"{t_type}_{t_id}"
        targets_info[key] = {
            "type": t_type,
            "id": t_id,
            "name": a.get("target_name") or t_type.capitalize(),
        }

        ans_val = a.get("answer")
        if ans_val and ans_val != "(Skipped)":
            if isinstance(ans_val, list):
                ans_str = ", ".join(map(str, ans_val))
            else:
                ans_str = str(ans_val)
            grouped.setdefault(key, []).append(f"{a.get('question')}: {ans_str}")

    diffs: list[dict[str, Any]] = []
    projects_map = {p["id"]: p for p in ctx.get("projects") or []}
    experiences_map = {e["id"]: e for e in ctx.get("experiences") or []}
    skills_map = {s["id"]: s for s in ctx.get("skills") or []}

    for key, notes in grouped.items():
        info = targets_info[key]
        t_type, t_id, t_name = info["type"], info["id"], info["name"]
        combined_notes = "; ".join(notes)

        current_text = ""
        proposed_text = ""

        if t_type == "project" and t_id in projects_map:
            orig = projects_map[t_id].get("description") or ""
            current_text = orig or "(No description recorded)"
            proposed_text = f"{orig} | Key details & technical context: {combined_notes}".strip(" | ")
        elif t_type == "experience" and t_id in experiences_map:
            orig = experiences_map[t_id].get("description") or ""
            current_text = orig or "(No description recorded)"
            proposed_text = f"{orig} | Key responsibilities & outcomes: {combined_notes}".strip(" | ")
        elif t_type == "skill" and t_id in skills_map:
            orig = skills_map[t_id].get("note") or ""
            current_text = orig or "(No note recorded)"
            proposed_text = f"{orig} | Context: {combined_notes}".strip(" | ")
        else:
            current_text = "(General Career Profile)"
            proposed_text = f"Additional Career Context: {combined_notes}"

        diffs.append({
            "id": f"diff_{key}_{uuid.uuid4().hex[:4]}",
            "target_type": t_type,
            "target_id": t_id,
            "target_name": t_name,
            "current_text": current_text,
            "proposed_text": proposed_text,
            "approved": True,
        })

    return {"diffs": diffs}


def apply_synthesis(approved_diffs: list[dict[str, Any]], session_info: dict[str, Any] | None = None) -> dict[str, Any]:
    """Persist approved diff updates into database and log interview session."""
    updated_count = 0

    for item in approved_diffs:
        if not item.get("approved", True):
            continue

        t_type = item.get("target_type")
        t_id = item.get("target_id")
        new_text = item.get("proposed_text")

        if not t_id or not new_text:
            continue

        if t_type == "project":
            queries.update("projects", t_id, {"description": new_text})
            updated_count += 1
        elif t_type == "experience":
            queries.update("experiences", t_id, {"description": new_text})
            updated_count += 1
        elif t_type == "skill":
            queries.update("skills", t_id, {"note": new_text})
            updated_count += 1

    # Log session in DB
    session_id = None
    if session_info:
        try:
            sess_row = {
                "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "focus_area": session_info.get("focus", "all"),
                "question_count": session_info.get("count", 5),
                "questions": json.dumps(session_info.get("questions", [])),
                "answers": json.dumps(session_info.get("answers", [])),
                "applied_updates": json.dumps(approved_diffs),
            }
            session_id = queries.insert("interview_sessions", sess_row)
        except Exception:
            pass

    return {
        "ok": True,
        "updated_count": updated_count,
        "session_id": session_id,
    }


def get_next_question(history: list[dict[str, Any]]) -> dict[str, Any]:
    """Legacy alias for generating next question."""
    batch = generate_batch_questions(count=1, focus="all")
    return batch[0] if batch else {}


def synthesize_answers(answers: list[dict[str, Any]]) -> dict[str, Any]:
    """Legacy alias for direct synthesis and DB update."""
    preview = preview_synthesis(answers)
    return apply_synthesis(preview.get("diffs", []))

