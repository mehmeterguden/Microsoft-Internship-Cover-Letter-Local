"""Tests for ammo — letter hooks composed locally from the report. Pure, offline."""

from __future__ import annotations

from core.research.ammo import build_hooks
from core.research.schema import CompanyIntelReport, Fit, NewsSignal, Overview, ValueSignal


def test_hooks_cover_skills_values_signals_mission_and_gaps():
    report = CompanyIntelReport(
        company_name="Acme",
        overview=Overview(mission="Empower builders."),
        values=[ValueSignal(name="Customer obsession", weight=95)],
        signals=[NewsSignal(headline="Launches AI SDK", why_it_matters="New bet on AI tooling.")],
        fit=Fit(score=82, matched_skills=["React", "TypeScript"], gaps=["Rust"]),
    )
    hooks = build_hooks(report)
    text = " ".join(h.hook for h in hooks)

    assert "React" in text                       # lead with a matched skill
    assert "Customer obsession" in text          # echo a value
    assert "Launches AI SDK" in text             # reference a signal
    assert any("mission" in h.hook.lower() for h in hooks)
    assert any("Rust" in h.hook for h in hooks)  # get ahead of the gap


def test_respects_limit_and_empty_report():
    assert build_hooks(CompanyIntelReport(company_name="Acme")) == []
    big = CompanyIntelReport(
        company_name="Acme",
        fit=Fit(matched_skills=[f"S{i}" for i in range(10)]),
    )
    assert len(build_hooks(big, limit=3)) == 3
