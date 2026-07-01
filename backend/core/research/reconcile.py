"""Reconcile a freshly assembled report — dedupe, score, and critique.

Runs locally after the agent fleet, before fit. It removes duplicate signals /
technologies / values that different agents surfaced, then a completeness critic
records which sections came back empty and turns section coverage into honest
`confidence` and `completeness` numbers. No network, no LLM.
"""

from __future__ import annotations

import re

from core.research.schema import CompanyIntelReport

# Sections we expect a full report to fill, with a predicate for "did we get it?".
_EXPECTED: dict[str, str] = {
    "firmographics": "firm facts",
    "overview": "overview",
    "values": "values",
    "culture": "culture",
    "tech_stack": "tech stack",
    "signals": "recent signals",
    "interview": "interview focus",
    "role": "role analysis",
}


def reconcile(report: CompanyIntelReport) -> None:
    """Dedupe list sections and populate meta.confidence / completeness / missing (in place)."""
    report.signals = _dedupe(report.signals, key=lambda s: (s.headline.lower().strip(), s.url))
    report.tech_stack = _dedupe(report.tech_stack, key=lambda t: _norm(t.name))
    report.values = _dedupe(report.values, key=lambda v: _norm(v.name))
    report.culture.ways_of_working = _dedupe(report.culture.ways_of_working, key=lambda w: _norm(w))

    filled = {name for name in _EXPECTED if _is_filled(report, name)}
    missing = [_EXPECTED[name] for name in _EXPECTED if name not in filled]

    report.meta.missing = missing
    report.meta.completeness = round(len(filled) / len(_EXPECTED), 2)
    # Confidence blends how many sections filled with how many carried a source.
    report.meta.confidence = round(
        0.7 * report.meta.completeness + 0.3 * _sourced_ratio(report), 2
    )


def _is_filled(report: CompanyIntelReport, name: str) -> bool:
    if name == "firmographics":
        return any(report.firmographics.model_dump().values())
    if name == "overview":
        return bool(report.overview.summary)
    if name == "culture":
        return bool(report.culture.ways_of_working)
    if name == "role":
        r = report.role
        return bool(r.responsibilities or r.must_haves or r.keywords)
    return bool(getattr(report, name))  # values / tech_stack / signals / interview lists


def _sourced_ratio(report: CompanyIntelReport) -> float:
    sourced = sum(1 for name in _EXPECTED if report.meta.section_sources.get(name))
    return sourced / len(_EXPECTED)


def _dedupe(items: list, key) -> list:
    seen, out = set(), []
    for item in items:
        k = key(item)
        if k not in seen:
            seen.add(k)
            out.append(item)
    return out


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())
