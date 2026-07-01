"""Tests for the orchestrator — parallel run, event stream, report assembly.

Uses fake agents (no LLM/network) that emit like the real ones and return fixed
sections, so we can assert the stream shape and the assembled report.
"""

from __future__ import annotations

import asyncio

import pytest

from core.research import orchestrator
from core.research.agent_base import Agent, AgentResult
from core.research.orchestrator import stream_research
from core.research.schema import Fit, Firmographics, NewsSignal, Source


@pytest.fixture(autouse=True)
def _hermetic(monkeypatch):
    # Fit reads the local profile and the cache hits the DB; stub both so
    # orchestrator tests stay hermetic (no DB, no network).
    monkeypatch.setattr(
        orchestrator.fit_engine,
        "compute_fit",
        lambda role, tech, profile=None: (Fit(score=90, verdict="STRONG MATCH"), tech),
    )
    monkeypatch.setattr(orchestrator.queries, "get_research", lambda key: None)
    monkeypatch.setattr(orchestrator.queries, "save_research", lambda *a, **k: None)


class _FakeAgent(Agent):
    """An agent that skips gather/LLM and returns a canned section."""

    def __init__(self, name, section, data, ok=True):
        self._name, self.section, self._data, self._ok = name, section, data, ok

    @property
    def name(self):  # base declares a class attr; a property is fine here
        return self._name

    def gather(self, ctx):
        return []

    def build_messages(self, ctx, gathered):
        return []

    async def run(self, ctx, emit):
        await emit({"type": "agent_started", "agent": self.name, "section": self.section})
        await emit({"type": "source", "agent": self.name, "source": "https://x", "ok": True})
        event = "agent_done" if self._ok else "agent_error"
        await emit({"type": event, "agent": self.name, "section": self.section})
        return AgentResult(
            self.name, self.section, self._data if self._ok else None,
            [Source(label="fake", url="https://x")], ok=self._ok,
        )


def _collect(**kwargs):
    async def run():
        return [ev async for ev in stream_research(**kwargs)]

    return asyncio.run(run())


def test_stream_emits_phase_then_agent_events_then_done():
    agents = [
        _FakeAgent("firmographics", "firmographics", Firmographics(hq="Redmond")),
        _FakeAgent("signals", "signals", [NewsSignal(headline="Launch")]),
    ]
    events = _collect(company_name="Acme", agents=agents)

    assert events[0]["type"] == "phase" and events[0]["total"] == 4  # 2 agents + fit + ammo
    assert events[-1]["type"] == "done"
    assert {e["type"] for e in events} >= {"agent_started", "source", "agent_done"}
    # The local fit and ammo steps ran.
    dones = {e.get("agent") for e in events if e["type"] == "agent_done"}
    assert {"fit", "ammo"} <= dones
    assert events[-1]["report"]["fit"]["verdict"] == "STRONG MATCH"


def test_done_report_folds_in_agent_sections():
    agents = [
        _FakeAgent("firmographics", "firmographics", Firmographics(hq="Redmond", founded="1975")),
        _FakeAgent("signals", "signals", [NewsSignal(headline="Ships TS 6.0")]),
    ]
    report = _collect(company_name="Acme", role_title="SWE", agents=agents)[-1]["report"]

    assert report["company_name"] == "Acme"
    assert report["firmographics"]["hq"] == "Redmond"
    assert report["signals"][0]["headline"] == "Ships TS 6.0"
    assert set(report["meta"]["agents"]) == {"firmographics", "signals"}
    # reconcile scored coverage: 2 of 8 sections filled.
    assert report["meta"]["completeness"] == round(2 / 8, 2)
    assert report["ammo"] is not None  # ammo section built


def test_failed_agent_leaves_section_empty_but_report_valid():
    agents = [
        _FakeAgent("firmographics", "firmographics", None, ok=False),
        _FakeAgent("signals", "signals", [NewsSignal(headline="Only signal")]),
    ]
    report = _collect(company_name="Acme", agents=agents)[-1]["report"]

    assert report["firmographics"]["hq"] is None        # empty default
    assert report["signals"][0]["headline"] == "Only signal"
    assert "firm facts" in report["meta"]["missing"]    # failed section flagged by the critic
