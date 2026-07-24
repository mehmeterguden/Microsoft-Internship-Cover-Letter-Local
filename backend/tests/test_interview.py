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


def test_synthesize_answers_fallback():
    """Test synthesis fallback correctly updates project descriptions in DB."""
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
            "question": "What database was used?",
            "answer": "PostgreSQL with connection pooling",
        }
    ]

    res = interview.synthesize_answers(answers)
    assert res["ok"] is True
    assert res["updated_count"] > 0

    updated_proj = queries.get_by_id("projects", pid)
    assert "PostgreSQL with connection pooling" in updated_proj["description"]
