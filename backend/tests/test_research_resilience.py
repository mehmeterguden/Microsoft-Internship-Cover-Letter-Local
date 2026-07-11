"""Resilience tests for the research engine: per-agent timeouts, tool retries,
a per-run tool budget, and partial-result assembly.

Everything is hermetic — no network, no real LLM. Agent timeouts are exercised
with a real base-class `Agent` whose reasoning sleeps past a shrunk timeout.
"""

from __future__ import annotations

import asyncio
import time

import pytest

from core.research import agent_base, orchestrator
from core.research.agent_base import Agent, AgentContext, AgentResult
from core.research.orchestrator import stream_research
from core.research.schema import Fit, Firmographics, NewsSignal, Source
import sys

import core.research.tools.registry  # noqa: F401 — ensure the submodule is imported
from core.research.tools.registry import ToolBudget, ToolRegistry, ToolResult, tool_budget

# `core.research.tools.registry` (the instance) shadows the submodule in the package
# namespace, so reach the module — where the retry/backoff constants live — via sys.
registry_mod = sys.modules["core.research.tools.registry"]


# ── Tool budget + retries (registry.call) ────────────────────────

def _registry(run):
    reg = ToolRegistry()
    reg.register("t", "a test tool", run)
    return reg


def test_budget_caps_total_calls():
    ran = {"n": 0}

    def run(**_):
        ran["n"] += 1
        return ToolResult("t", "s", data={"ok": 1})

    reg = _registry(run)
    token = tool_budget.set(ToolBudget(2))
    try:
        assert reg.call("t").ok
        assert reg.call("t").ok
        third = reg.call("t")
        assert not third.ok and "budget" in (third.error or "").lower()
        assert ran["n"] == 2  # the third call never hit the tool
    finally:
        tool_budget.reset(token)


def test_no_budget_means_no_cap():
    reg = _registry(lambda **_: ToolResult("t", "s", data={}))
    for _ in range(5):
        assert reg.call("t").ok  # default contextvar is None → uncapped


def test_retries_transient_then_succeeds(monkeypatch):
    monkeypatch.setattr(registry_mod, "_TOOL_BACKOFF", 0.0)  # no real sleeping
    seq = [
        ToolResult.fail("t", "s", "Could not reach host: timed out"),
        ToolResult("t", "s", data={"ok": 1}),
    ]
    reg = _registry(lambda **_: seq.pop(0))
    res = reg.call("t")
    assert res.ok and not seq  # both consumed: one retry, then success


def test_does_not_retry_non_transient(monkeypatch):
    monkeypatch.setattr(registry_mod, "_TOOL_BACKOFF", 0.0)
    ran = {"n": 0}

    def run(**_):
        ran["n"] += 1
        return ToolResult.fail("t", "s", "HTTP 404 from host")  # a 404 is not transient

    res = _registry(run).call("t")
    assert not res.ok and ran["n"] == 1


def test_transient_failure_exhausts_attempts(monkeypatch):
    monkeypatch.setattr(registry_mod, "_TOOL_BACKOFF", 0.0)
    ran = {"n": 0}

    def run(**_):
        ran["n"] += 1
        return ToolResult.fail("t", "s", "connection reset")

    res = _registry(run).call("t")
    assert not res.ok and ran["n"] == registry_mod._TOOL_ATTEMPTS


def test_tool_exception_becomes_failed_result(monkeypatch):
    monkeypatch.setattr(registry_mod, "_TOOL_BACKOFF", 0.0)

    def run(**_):
        raise RuntimeError("boom")

    res = _registry(run).call("t")
    assert not res.ok and "boom" in (res.error or "")


# ── Per-agent timeout (real Agent.run) ───────────────────────────

class _SlowAgent(Agent):
    """A real agent whose reasoning sleeps — used to trip the reason timeout."""

    name = "slow"
    section = "firmographics"
    output_model = Firmographics

    def gather(self, ctx):
        return []

    def build_messages(self, ctx, gathered):
        return [{"role": "user", "content": "x"}]

    def _reason(self, ctx, gathered, on_token=None):
        time.sleep(0.5)  # longer than the shrunk REASON_TIMEOUT
        return Firmographics()


async def _run_one(agent):
    events: list[dict] = []

    async def emit(e):
        events.append(e)

    result = await agent.run(AgentContext("Acme"), emit, events.append)
    return result, events


def test_agent_reason_timeout_marks_failed(monkeypatch):
    monkeypatch.setattr(agent_base, "REASON_TIMEOUT", 0.1)
    result, events = asyncio.run(_run_one(_SlowAgent()))
    assert result.ok is False and "Timed out" in (result.error or "")
    err = next(e for e in events if e["type"] == "agent_error")
    assert err["reason"] == "timeout" and err["agent"] == "slow"


# ── Orchestrator partial assembly + slow-agent survival ──────────

@pytest.fixture(autouse=True)
def _hermetic(monkeypatch):
    monkeypatch.setattr(
        orchestrator.fit_engine, "compute_fit",
        lambda role, tech, profile=None: (Fit(score=90, verdict="OK"), tech),
    )
    monkeypatch.setattr(orchestrator.queries, "get_research", lambda key: None)
    monkeypatch.setattr(orchestrator.queries, "save_research", lambda *a, **k: None)


class _FakeAgent(Agent):
    """Skips gather/LLM entirely and emits a canned section (or a failure)."""

    def __init__(self, name, section, data, ok=True):
        self._name, self.section, self._data, self._ok = name, section, data, ok

    @property
    def name(self):
        return self._name

    def gather(self, ctx):
        return []

    def build_messages(self, ctx, gathered):
        return []

    async def run(self, ctx, emit, emit_sync=None):
        await emit({"type": "agent_started", "agent": self.name, "section": self.section})
        event = "agent_done" if self._ok else "agent_error"
        await emit({"type": event, "agent": self.name, "section": self.section})
        return AgentResult(
            self.name, self.section, self._data if self._ok else None,
            [Source(label="fake", url="https://x")], ok=self._ok, error=None if self._ok else "boom",
        )


def _collect(**kwargs):
    async def run():
        return [ev async for ev in stream_research(**kwargs)]

    return asyncio.run(run())


def test_failed_agent_marks_partial_and_completes():
    events = _collect(company_name="Acme", agents=[
        _FakeAgent("firmographics", "firmographics", None, ok=False),
        _FakeAgent("signals", "signals", [NewsSignal(headline="Only signal")]),
    ])
    report = events[-1]["report"]
    assert events[-1]["type"] == "done"                       # never fatal
    assert report["meta"]["partial"] is True
    assert "firmographics" in report["meta"]["failed"]
    assert report["meta"]["agents"] == ["signals"]
    assert report["signals"][0]["headline"] == "Only signal"  # the good section survived


def test_slow_agent_times_out_but_run_completes(monkeypatch):
    monkeypatch.setattr(agent_base, "REASON_TIMEOUT", 0.1)
    monkeypatch.setattr(agent_base, "GATHER_TIMEOUT", 0.1)
    events = _collect(company_name="Acme", agents=[
        _SlowAgent(),
        _FakeAgent("signals", "signals", [NewsSignal(headline="ok")]),
    ])
    report = events[-1]["report"]
    assert events[-1]["type"] == "done"                       # not a hard fatal
    timeout_errs = [e for e in events if e["type"] == "agent_error" and e.get("reason") == "timeout"]
    assert timeout_errs and timeout_errs[0]["agent"] == "slow"
    assert report["meta"]["partial"] is True and "slow" in report["meta"]["failed"]
    assert report["signals"][0]["headline"] == "ok"           # the healthy section still came through


def test_all_agents_fail_still_returns_a_report():
    events = _collect(company_name="Acme", agents=[
        _FakeAgent("firmographics", "firmographics", None, ok=False),
        _FakeAgent("signals", "signals", None, ok=False),
    ])
    report = events[-1]["report"]
    assert events[-1]["type"] == "done"                       # complete-but-empty, not fatal
    assert report["meta"]["partial"] is True
    assert set(report["meta"]["failed"]) == {"firmographics", "signals"}
    assert report["meta"]["agents"] == []
