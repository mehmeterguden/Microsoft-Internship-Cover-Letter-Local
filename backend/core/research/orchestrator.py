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

from core.research import ammo as ammo_engine
from core.research import fit as fit_engine
from core.research import reconcile as reconcile_engine
from core.research.agent_base import Agent, AgentContext, AgentResult
from core.research.agents import FLEET
from db import queries
from core.research.schema import (
    CompanyIntelReport,
    Culture,
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
    refresh: bool = False,
) -> AsyncIterator[dict[str, Any]]:
    """Yield live events while researching, ending with the assembled report.

    A cached report (within its TTL) short-circuits the whole run unless
    `refresh` is set, so a repeat lookup returns instantly.
    """
    ctx = AgentContext(company_name, role_title, job_description)
    key = _cache_key(company_name, role_title)

    if not refresh:
        cached = queries.get_research(key)
        if cached is not None:
            report = cached["report"]
            report["meta"]["from_cache"] = True
            yield {"type": "cached", "cached_at": cached["created_at"]}
            yield {"type": "done", "report": report, "duration_s": 0.0}
            return

    fleet = agents if agents is not None else [cls() for cls in FLEET]
    started_at = time.perf_counter()

    yield {
        "type": "phase",
        "phase": "gather",
        # fit and ammo are local steps, shown as chips after the fleet.
        "agents": [a.name for a in fleet] + ["fit", "ammo"],
        "total": len(fleet) + 2,
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

    # Reconcile: dedupe, score confidence/completeness, note missing sections.
    reconcile_engine.reconcile(report)

    # Local analysis phase — private, on-device, no LLM, no network.
    yield {"type": "phase", "phase": "analyze", "agents": ["fit", "ammo"], "total": 2}
    yield {"type": "agent_started", "agent": "fit", "section": "fit"}
    fit, tech_annotated = await asyncio.to_thread(
        fit_engine.compute_fit, report.role, report.tech_stack
    )
    report.fit = fit
    report.tech_stack = tech_annotated
    yield {
        "type": "agent_done",
        "agent": "fit",
        "section": "fit",
        "data": fit.model_dump(mode="json"),
        "sources": [{"label": "on-device · your profile (never sent)", "url": None}],
    }

    # Letter ammunition — composed locally from the report + fit.
    yield {"type": "agent_started", "agent": "ammo", "section": "ammo"}
    report.ammo = ammo_engine.build_hooks(report)
    yield {
        "type": "agent_done",
        "agent": "ammo",
        "section": "ammo",
        "data": [h.model_dump(mode="json") for h in report.ammo],
        "sources": [{"label": "on-device · derived from this report", "url": None}],
    }

    report.meta.duration_s = round(time.perf_counter() - started_at, 2)
    payload = report.model_dump(mode="json")
    queries.save_research(key, company_name, role_title, payload)
    yield {"type": "done", "report": payload, "duration_s": report.meta.duration_s}


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
        values=section("values", []),
        culture=section("culture", Culture()),
        tech_stack=section("tech_stack", []),
        signals=section("signals", []),
        interview=section("interview", []),
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


def _cache_key(company_name: str, role_title: str | None) -> str:
    """Normalized cache key: company + role, lowercased and trimmed."""
    return f"{company_name.strip().lower()}|{(role_title or '').strip().lower()}"


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
