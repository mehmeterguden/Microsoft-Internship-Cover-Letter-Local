"""Tests for AI Profile Interview & Context Synthesis."""

from __future__ import annotations

import pytest
from core import interview
from db import queries
from db.schema import init_db


@pytest.fixture(autouse=True)
def _setup_db():
    init_db()


def test_get_next_question_fallback():
    """Test get_next_question returns valid question schema even when profile is sparse."""
    queries.insert("projects", {
        "name": "Test Project Alpha",
        "description": "Short desc",
        "technologies": ["Python", "FastAPI"],
    })

    q = interview.get_next_question(history=[])
    assert isinstance(q, dict)
    assert "question" in q
    assert "type" in q
    assert q["type"] in ("boolean", "single_choice", "multi_select", "rating", "text")
    assert "allow_custom" in q


def test_generate_batch_questions():
    """Test generating a batch of questions based on count and focus area."""
    queries.insert("projects", {
        "name": "Project Gamma",
        "description": "System architecture demo",
        "technologies": ["Go", "Docker"],
    })

    batch = interview.generate_batch_questions(count=3, focus="projects")
    assert isinstance(batch, list)
    assert len(batch) > 0
    assert "question" in batch[0]
    assert "type" in batch[0]


def test_preview_and_apply_synthesis():
    """Test previewing synthesis diffs and applying approved diffs to DB with session recording."""
    pid = queries.insert("projects", {
        "name": "Project Beta",
        "description": "Base description.",
        "technologies": ["React"],
    })

    answers = [
        {
            "question_id": "q1",
            "target_type": "project",
            "target_id": pid,
            "target_name": "Project Beta",
            "question": "What database was used?",
            "answer": "PostgreSQL with connection pooling",
        }
    ]

    # Preview diffs
    preview = interview.preview_synthesis(answers)
    assert "diffs" in preview
    assert len(preview["diffs"]) > 0

    diff = preview["diffs"][0]
    assert diff["target_type"] == "project"
    assert diff["target_id"] == pid
    assert "proposed_text" in diff

    # Apply approved diff
    apply_res = interview.apply_synthesis(
        approved_diffs=[diff],
        session_info={"count": 1, "focus": "projects", "questions": [], "answers": answers},
    )
    assert apply_res["ok"] is True
    assert apply_res["updated_count"] == 1
    assert apply_res["session_id"] is not None

    updated_proj = queries.get_by_id("projects", pid)
    assert "PostgreSQL" in updated_proj["description"]
