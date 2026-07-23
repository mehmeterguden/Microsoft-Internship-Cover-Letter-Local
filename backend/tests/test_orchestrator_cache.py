"""Tests for research caching and the orchestrator's small pure helpers.

A cached report (within TTL) must skip the whole agent fleet and return
instantly; `refresh=True` must bypass the cache and actually run. The DB is
monkeypatched, so there is no SQLite and no network.
"""

from __future__ import annotations

import asyncio

import pytest

from core.research import orchestrator
from core.research.agent_base import Agent, AgentResult
from core.research.orchestrator import _cache_key, stream_research
from core.research.schema import Fit, Source


# ── _cache_key normalization ──

def test_cache_key_lowercases_and_trims():
    assert _cache_key("  Acme Corp ", " SWE ") == "acme corp|swe"


def test_cache_key_without_a_role():
    assert _cache_key("Acme", None) == "acme|"


def test_cache_key_changes_with_the_role():
    assert _cache_key("Acme", "SWE") != _cache_key("Acme", "PM")


# ── _dedupe / _confidence: pure assembly helpers ──

def test_dedupe_removes_duplicate_label_url_pairs():
    sources = [
        Source(label="A", url="https://x"),
        Source(label="A", url="https://x"),   # exact duplicate
        Source(label="A", url=None),          # same label, different url — kept
    ]
    assert len(orchestrator._dedupe(sources)) == 2


def test_confidence_is_the_fraction_of_ok_agents():
    results = {
        "a": AgentResult("a", "s", {}, [], ok=True),
        "b": AgentResult("b", "s", None, [], ok=False),
    }
    assert orchestrator._confidence(results) == 0.5


def test_confidence_is_zero_with_no_agents():
    assert orchestrator._confidence({}) == 0.0


# ── cache short-circuit ──

class _TrackingAgent(Agent):
    """Records whether it was ever run — used to prove the cache short-circuits."""

    name = "track"
    section = "firmographics"

    def __init__(self, flag: dict):
        self._flag = flag

    def gather(self, ctx):
        return []

    def build_messages(self, ctx, gathered):
        return []

    async def run(self, ctx, emit, emit_sync=None):
        self._flag["ran"] = True
        return AgentResult(self.name, self.section, None, [], ok=False, error="unused")


def _collect(**kwargs):
    async def run():
        return [event async for event in stream_research(**kwargs)]

    return asyncio.run(run())


_CACHED = {
    "report": {"company_name": "Acme", "meta": {"partial": False}},
    "created_at": "2026-01-01T00:00:00+00:00",
}


def test_cache_hit_short_circuits_without_running_agents(monkeypatch):
    monkeypatch.setattr(orchestrator.queries, "get_research", lambda key: _CACHED)
    flag = {"ran": False}

    events = _collect(company_name="Acme", agents=[_TrackingAgent(flag)])

    assert flag["ran"] is False                       # the fleet never launched
    assert events[0]["type"] == "cached"
    assert events[0]["cached_at"] == _CACHED["created_at"]
    assert events[-1]["type"] == "done"
    assert events[-1]["duration_s"] == 0.0
    assert events[-1]["report"]["meta"]["from_cache"] is True


def test_refresh_bypasses_the_cache_and_runs(monkeypatch):
    monkeypatch.setattr(orchestrator.queries, "get_research", lambda key: _CACHED)
    monkeypatch.setattr(orchestrator.queries, "save_research", lambda *a, **k: None)
    monkeypatch.setattr(
        orchestrator.fit_engine,
        "compute_fit",
        lambda role, tech, profile=None: (Fit(score=1, verdict="OK"), tech),
    )
    flag = {"ran": False}

    events = _collect(company_name="Acme", agents=[_TrackingAgent(flag)], refresh=True)

    assert flag["ran"] is True                        # cache skipped → the agent ran
    assert not any(e["type"] == "cached" for e in events)
    assert events[-1]["type"] == "done"
    assert events[-1]["report"]["meta"].get("from_cache") is not True
