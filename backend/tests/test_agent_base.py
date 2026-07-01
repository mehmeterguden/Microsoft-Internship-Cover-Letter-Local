"""Tests for the mini agent framework — JSON repair, validation, and the run flow.

No network, no real LLM: `llm.complete` is monkeypatched to return canned replies.
"""

from __future__ import annotations

import asyncio

import pytest

from core.research import agent_base
from core.research.agent_base import Agent, AgentContext, _extract_json
from core.research.schema import Overview
from core.research.tools.registry import ToolResult


class _OverviewLike(Agent):
    name = "overview"
    section = "overview"
    output_model = Overview

    def gather(self, ctx):
        return [ToolResult(tool="web_search", source="https://example.com", data={"x": 1})]

    def build_messages(self, ctx, gathered):
        return [{"role": "user", "content": "summarize"}]


def _run(agent, ctx):
    events: list[dict] = []

    async def emit(event):
        events.append(event)

    result = asyncio.run(agent.run(ctx, emit))
    return result, events


# ── JSON extraction ──

def test_extract_json_tolerates_fences_and_prose():
    raw = 'Sure!\n```json\n{"summary": "hi"}\n```\nDone.'
    assert _extract_json(raw) == '{"summary": "hi"}'


def test_extract_json_raises_without_object():
    with pytest.raises(ValueError):
        _extract_json("no json here")


# ── run flow ──

def test_run_success_emits_and_validates(monkeypatch):
    monkeypatch.setattr(agent_base.llm, "complete", lambda *a, **k: '{"summary": "A dev tool company."}')
    result, events = _run(_OverviewLike(), AgentContext("Acme"))

    assert result.ok and isinstance(result.data, Overview)
    assert result.data.summary == "A dev tool company."
    types = [e["type"] for e in events]
    assert types[0] == "agent_started"
    assert "source" in types
    assert types[-1] == "agent_done"


def test_run_repairs_invalid_then_valid_json(monkeypatch):
    replies = iter(["not json at all", '{"summary": "fixed"}'])
    monkeypatch.setattr(agent_base.llm, "complete", lambda *a, **k: next(replies))
    result, _ = _run(_OverviewLike(), AgentContext("Acme"))

    assert result.ok and result.data.summary == "fixed"


def test_run_reports_error_when_both_attempts_fail(monkeypatch):
    monkeypatch.setattr(agent_base.llm, "complete", lambda *a, **k: "still not json")
    result, events = _run(_OverviewLike(), AgentContext("Acme"))

    assert not result.ok and result.data is None and result.error
    assert events[-1]["type"] == "agent_error"


def test_gather_failure_does_not_crash(monkeypatch):
    class _Boom(_OverviewLike):
        def gather(self, ctx):
            raise RuntimeError("source down")

    monkeypatch.setattr(agent_base.llm, "complete", lambda *a, **k: '{"summary": "ok"}')
    result, _ = _run(_Boom(), AgentContext("Acme"))
    assert result.ok  # gather swallowed, reasoning still ran
