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


def test_smart_experience_scoring_scales_with_role_seniority():
    senior_role = RoleAnalysis(title="Senior Backend Engineer", keywords=["Python", "FastAPI"])
    junior_role = RoleAnalysis(title="Junior Developer", keywords=["Python"])

    short_profile = _profile(
        experience_count=1,
        total_years=0.5,
        experiences=[{"title": "Software Intern", "company": "Acme", "start_date": "2023-01", "end_date": "2023-06"}]
    )

    fit_senior, _ = compute_fit(senior_role, [], short_profile)
    fit_junior, _ = compute_fit(junior_role, [], short_profile)

    exp_dim_senior = next(d for d in fit_senior.dimensions if d.name == "Experience")
    exp_dim_junior = next(d for d in fit_junior.dimensions if d.name == "Experience")

    # Short 6-month experience should NOT get 100 for a Senior role!
    assert exp_dim_senior.you < 50
    assert exp_dim_senior.role_need == 85
    # Junior role requirement threshold should be lower and match better
    assert exp_dim_junior.role_need == 50
    assert exp_dim_junior.you > exp_dim_senior.you


def test_zero_experience_yields_zero_experience_score():
    role = RoleAnalysis(title="Software Engineer", keywords=["Python"])
    no_exp_profile = _profile(experience_count=0, total_years=0.0, experiences=[])

    fit, _ = compute_fit(role, [], no_exp_profile)
    exp_dim = next(d for d in fit.dimensions if d.name == "Experience")
    assert exp_dim.you == 0

