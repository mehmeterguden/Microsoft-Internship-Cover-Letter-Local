"""Orchestrator — run the agent fleet in parallel and stream the report as it fills.

`stream_research` is an async generator of events. It launches every agent
concurrently; each agent pushes progress events (started → sources → done/error)
onto a shared queue, which the generator forwards to the caller (the SSE endpoint)
in real time. When all agents finish, it assembles their sections into one
`CompanyIntelReport` and emits a final `done` event carrying the whole report.

Event shapes (all JSON-serialisable dicts with a `type`):
    {"type": "phase",        "phase": str, "agents": [str], "total": int}
    {"type": "agent_started","agent": str, "section": str}
    {"type": "source",       "agent": str, "source": str, "ok": bool}
    {"type": "agent_done",   "agent": str, "section": str, "data": ...}
    {"type": "agent_error",  "agent": str, "error": str}
    {"type": "done",         "report": {...}, "duration_s": float}
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

from core.research.agent_base import Agent, AgentContext, AgentResult
from core.research.agents import FLEET
from core.research.schema import (
    CompanyIntelReport,
    Firmographics,
    Overview,
    ReportMeta,
    RoleAnalysis,
    Source,
)

_DONE = object()  # queue sentinel: all agents have finished


async def stream_research(
    company_name: str,
    role_title: str | None = None,
    job_description: str | None = None,
    agents: list[Agent] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Yield live events while researching, ending with the assembled report."""
    ctx = AgentContext(company_name, role_title, job_description)
    fleet = agents if agents is not None else [cls() for cls in FLEET]
    started_at = time.perf_counter()

    yield {
        "type": "phase",
        "phase": "gather",
        "agents": [a.name for a in fleet],
        "total": len(fleet),
    }

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    results: dict[str, AgentResult] = {}

    async def worker(agent: Agent) -> None:
        results[agent.name] = await agent.run(ctx, queue.put)

    async def runner() -> None:
        await asyncio.gather(*(worker(a) for a in fleet))
        await queue.put(_DONE)  # type: ignore[arg-type]

    driver = asyncio.create_task(runner())
    try:
        while True:
            event = await queue.get()
            if event is _DONE:
                break
            yield event
    finally:
        await driver  # propagate any unexpected error from the runner

    report = _assemble(company_name, role_title, results, started_at)
    yield {
        "type": "done",
        "report": report.model_dump(mode="json"),
        "duration_s": report.meta.duration_s,
    }


def _assemble(
    company_name: str,
    role_title: str | None,
    results: dict[str, AgentResult],
    started_at: float,
) -> CompanyIntelReport:
    """Fold successful agent sections into one report; missing sections stay empty."""
    sources: list[Source] = []
    section_sources: dict[str, list[Source]] = {}
    for result in results.values():
        sources.extend(result.sources)
        if result.ok and result.sources:
            section_sources[result.section] = result.sources

    def section(name: str, default: Any) -> Any:
        result = results.get(name)
        return result.data if result and result.ok and result.data is not None else default

    return CompanyIntelReport(
        company_name=company_name,
        role_title=role_title,
        firmographics=section("firmographics", Firmographics()),
        overview=section("overview", Overview()),
        signals=section("signals", []),
        role=section("jd_analyst", RoleAnalysis()),
        meta=ReportMeta(
            sources=_dedupe(sources),
            section_sources=section_sources,
            confidence=_confidence(results),
            gathered_at=datetime.now(timezone.utc).isoformat(),
            duration_s=round(time.perf_counter() - started_at, 2),
            agents=[name for name, r in results.items() if r.ok],
        ),
    )


def _dedupe(sources: list[Source]) -> list[Source]:
    seen: set[tuple[str, str | None]] = set()
    out: list[Source] = []
    for source in sources:
        key = (source.label, source.url)
        if key not in seen:
            seen.add(key)
            out.append(source)
    return out


def _confidence(results: dict[str, AgentResult]) -> float:
    """Fraction of agents that produced a section — a simple coverage signal."""
    if not results:
        return 0.0
    ok = sum(1 for r in results.values() if r.ok)
    return round(ok / len(results), 2)
