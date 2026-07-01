"""Tests for the local fit analysis — pure, offline, no profile leaves the machine.

`compute_fit` is a pure function given a `LocalProfile`, so these run with an
in-memory profile and never touch the DB or the network.
"""

from __future__ import annotations

from core.research.fit import LocalProfile, compute_fit
from core.research.schema import RoleAnalysis, TechItem


def _profile(**kw) -> LocalProfile:
    base = dict(
        skills={"react", "typescript", "python"},
        skill_display={"react": "React", "typescript": "TypeScript", "python": "Python"},
        experience_count=2, has_current=True, senior=True, repo_count=3, has_summary=True,
    )
    base.update(kw)
    return LocalProfile(**base)


def test_matched_and_gaps_split_by_profile():
    role = RoleAnalysis(keywords=["React", "TypeScript", "Rust"], must_haves=["React"])
    tech = [TechItem(name="React"), TechItem(name="Go")]
    fit, annotated = compute_fit(role, tech, _profile())

    assert "React" in fit.matched_skills and "TypeScript" in fit.matched_skills
    assert "Rust" in fit.gaps and "Go" in fit.gaps
    assert annotated[0].you_know is True          # React — known
    assert annotated[1].you_know is False         # Go — not known
    assert annotated[1].worth_learning is True


def test_aliases_match_equivalent_skills():
    # "TS" in the role should match "typescript" in the profile.
    role = RoleAnalysis(keywords=["TS", "JS"])
    fit, _ = compute_fit(role, [], _profile(skills={"typescript", "javascript"},
                                            skill_display={"typescript": "TypeScript", "javascript": "JS"}))
    assert "TS" in fit.matched_skills and "JS" in fit.matched_skills
    assert not fit.gaps


def test_score_verdict_and_radar():
    role = RoleAnalysis(keywords=["React", "TypeScript"], must_haves=["React"])
    fit, _ = compute_fit(role, [], _profile())

    assert fit.score >= 80 and fit.verdict == "STRONG MATCH"
    assert len(fit.dimensions) == 4
    assert any(d.name == "Technical skills" and d.you == 100 for d in fit.dimensions)


def test_empty_profile_returns_no_profile_verdict():
    role = RoleAnalysis(keywords=["React", "Kubernetes"], must_haves=["React"])
    fit, annotated = compute_fit(role, [TechItem(name="React")], LocalProfile())

    assert fit.verdict == "NO PROFILE" and fit.score == 0
    assert "React" in fit.gaps and not fit.matched_skills


def test_stretch_verdict_when_coverage_low():
    role = RoleAnalysis(keywords=["Rust", "Go", "Elixir", "Haskell"], must_haves=["Rust"])
    fit, _ = compute_fit(role, [], _profile(experience_count=0, has_current=False,
                                            senior=False, repo_count=0))
    assert fit.verdict == "STRETCH" and fit.score < 60
    assert "Rust" in fit.gaps
