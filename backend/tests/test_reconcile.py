"""Tests for reconcile — dedup + completeness critic + confidence. Pure, offline."""

from __future__ import annotations

from core.research.reconcile import reconcile
from core.research.schema import (
    CompanyIntelReport,
    Culture,
    Firmographics,
    NewsSignal,
    Overview,
    Source,
    TechItem,
    ValueSignal,
)


def _report(**kw) -> CompanyIntelReport:
    return CompanyIntelReport(company_name="Acme", **kw)


def test_dedupes_signals_tech_and_values():
    report = _report(
        signals=[NewsSignal(headline="Ships v2"), NewsSignal(headline="ships v2"),
                 NewsSignal(headline="Raises round")],
        tech_stack=[TechItem(name="React"), TechItem(name="react"), TechItem(name="Go")],
        values=[ValueSignal(name="Craft", weight=90), ValueSignal(name="craft", weight=80)],
    )
    reconcile(report)
    assert len(report.signals) == 2       # "Ships v2"/"ships v2" collapse
    assert len(report.tech_stack) == 2    # React/react collapse
    assert len(report.values) == 1        # Craft/craft collapse


def test_completeness_and_missing_reflect_filled_sections():
    report = _report(
        firmographics=Firmographics(hq="Redmond"),
        overview=Overview(summary="Builds things."),
        values=[ValueSignal(name="Craft", weight=80)],
    )
    reconcile(report)
    # 3 of 8 expected sections filled.
    assert report.meta.completeness == round(3 / 8, 2)
    assert "recent signals" in report.meta.missing
    assert "culture" in report.meta.missing
    assert 0.0 <= report.meta.confidence <= 1.0


def test_confidence_rises_with_sources():
    report = _report(
        firmographics=Firmographics(hq="Redmond"),
        overview=Overview(summary="x"),
    )
    report.meta.section_sources = {
        "firmographics": [Source(label="Wikidata", url="https://w")],
        "overview": [Source(label="site", url="https://s")],
    }
    reconcile(report)
    # Same fill as no-source case would give, but the source bonus lifts confidence.
    assert report.meta.confidence > report.meta.completeness * 0.7


def test_full_report_is_complete():
    report = _report(
        firmographics=Firmographics(hq="Redmond"),
        overview=Overview(summary="x"),
        values=[ValueSignal(name="v", weight=1)],
        culture=Culture(ways_of_working=["async"]),
        tech_stack=[TechItem(name="Go")],
        signals=[NewsSignal(headline="h")],
        interview=[],  # leave one empty
    )
    report.role.keywords = ["Go"]
    reconcile(report)
    assert "interview focus" in report.meta.missing
    assert report.meta.completeness == round(7 / 8, 2)
