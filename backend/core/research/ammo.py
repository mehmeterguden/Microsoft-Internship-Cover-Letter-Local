"""Letter ammunition — concrete angles the cover letter can use.

The bridge from research to generation: turns the assembled report into a short
list of specific, actionable hooks (echo this value, reference this launch, lead
with this matched skill, frame this gap). Built locally by composition — no LLM —
so the profile-derived parts (matched skills, gaps) never reach a cloud provider.
"""

from __future__ import annotations

from core.research.schema import CompanyIntelReport, LetterHook


def build_hooks(report: CompanyIntelReport, limit: int = 8) -> list[LetterHook]:
    """Compose prioritized letter hooks from values, signals, fit, and mission."""
    hooks: list[LetterHook] = []

    # Lead with the strongest matched skills — the applicant's real leverage.
    for skill in report.fit.matched_skills[:3]:
        hooks.append(LetterHook(
            hook=f"Lead with your {skill} experience",
            use_in_letter=f"Open a paragraph around concrete {skill} work that maps to this role.",
        ))

    # Echo the company's top values in the applicant's own voice.
    for value in report.values[:2]:
        hooks.append(LetterHook(
            hook=f"Echo their value: “{value.name}”",
            use_in_letter=f"Show a moment that demonstrates {value.name.lower()}, in your words — don't quote it back.",
        ))

    # Reference a recent signal to prove you did the homework.
    for signal in report.signals[:2]:
        hooks.append(LetterHook(
            hook=f"Reference: {signal.headline}",
            use_in_letter=signal.why_it_matters or "Tie this recent development to why you want in now.",
        ))

    # Tie into the mission, if the company states one.
    if report.overview.mission:
        hooks.append(LetterHook(
            hook="Connect to their mission",
            use_in_letter=f"Link your motivation to: “{report.overview.mission}”.",
        ))

    # Get ahead of a gap by framing it honestly.
    if report.fit.gaps:
        gap = report.fit.gaps[0]
        hooks.append(LetterHook(
            hook=f"Get ahead of the gap in {gap}",
            use_in_letter=f"Briefly frame {gap} as something you're actively closing, backed by a transferable strength.",
        ))

    return hooks[:limit]
