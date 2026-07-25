"""Local fit analysis — the private verdict, computed entirely on-device.

This is the one part of the engine that touches the user's profile, so it runs
with zero network and no LLM: it never leaves the machine, and it cannot send the
CV to a cloud provider even by accident. It compares the profile (skills,
experience, open-source) against the role (the JD analyst's keywords/must-haves
and the company's tech stack) using normalized lexical matching with a small
alias table, and produces a score, a radar, matched skills, and gaps.

Matching is deliberately transparent rather than a black-box embedding: every
number here can be explained. (Semantic embeddings are a later, optional upgrade
once local sentence-transformers are wired in.)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from core.research.schema import Fit, FitDimension, RoleAnalysis, TechItem
from db import queries

# Common skill aliases collapsed to one canonical token so "TS" matches
# "TypeScript", "react.js" matches "React", etc.
_ALIASES = {
    "js": "javascript", "ts": "typescript", "py": "python", "k8s": "kubernetes",
    "node": "nodejs", "node.js": "nodejs", "reactjs": "react", "react.js": "react",
    "nextjs": "next.js", "postgres": "postgresql", "gcp": "google cloud",
    "ml": "machine learning", "ai": "artificial intelligence", "cs": "c#",
    "golang": "go", "tf": "tensorflow", "k8": "kubernetes",
}


@dataclass(frozen=True, slots=True)
class LocalProfile:
    """The private profile facts fit needs — assembled locally, never sent out."""

    skills: set[str] = field(default_factory=set)      # normalized skill tokens
    skill_display: dict[str, str] = field(default_factory=dict)  # normalized → original
    experience_count: int = 0
    has_current: bool = False
    senior: bool = False                               # any senior/lead title held
    repo_count: int = 0
    has_summary: bool = False
    total_years: float = 0.0
    experiences: list[dict] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not self.skills and self.experience_count == 0


def _parse_year(date_str: str | None) -> float | None:
    if not date_str:
        return None
    m = re.search(r"\b(19\d\d|20\d\d)\b", date_str)
    if m:
        year = float(m.group(1))
        m_month = re.search(r"\b(0?[1-9]|1[0-2])\b", date_str)
        if m_month and len(date_str) > 4:
            month = float(m_month.group(1))
            return year + (month - 1.0) / 12.0
        return year
    return None


def _calc_total_experience_years(experiences: list[dict]) -> float:
    import datetime
    now_year = datetime.datetime.now().year + (datetime.datetime.now().month - 1.0) / 12.0
    total = 0.0
    for e in experiences:
        start_y = _parse_year(e.get("start_date"))
        end_y = _parse_year(e.get("end_date"))
        if e.get("is_current") or not end_y:
            end_y = now_year
        if start_y and end_y and end_y >= start_y:
            total += max(0.25, end_y - start_y)
        else:
            total += 0.5  # fallback 6 months if dates unparseable
    return max(0.0, total)


def _calc_role_experience_need(role: RoleAnalysis) -> tuple[float, int]:
    """Return target years needed and role_need score threshold based on target role."""
    title = (role.title or "").lower()
    req_text = " ".join(role.must_haves + role.keywords + role.responsibilities).lower()

    if re.search(r"\b(executive|director|vp|c-level|head of)\b", title):
        return 7.0, 90
    if re.search(r"\b(senior|lead|principal|staff|architect|manager)\b", title) or "5+ years" in req_text or "senior" in req_text:
        return 5.0, 85
    if re.search(r"\b(junior|intern|internship|associate|entry)\b", title) or "0-1 year" in req_text or "intern" in req_text:
        return 1.0, 50
    return 3.0, 70


def _calc_experience_relevance(experiences: list[dict], required_norms: set[str]) -> float:
    """Calculate ratio of required skills/keywords present in candidate's experience text."""
    if not required_norms or not experiences:
        return 0.5
    exp_tokens = set()
    for e in experiences:
        text = f"{e.get('title', '')} {e.get('company', '')} {e.get('description', '')}".lower()
        words = set(re.findall(r"\b[a-z0-9+#.]+\b", text))
        exp_tokens.update(words)

    hits = sum(1 for norm in required_norms if norm in exp_tokens or any(norm in t or t in norm for t in exp_tokens if len(t) >= 3))
    return hits / len(required_norms)


def load_local_profile() -> LocalProfile:
    """Read the profile, skills, experience, and repos from the local DB."""
    skills_rows = queries.list_all("skills")
    skills, display = set(), {}
    for row in skills_rows:
        name = (row.get("name") or "").strip()
        if name:
            norm = _normalize(name)
            skills.add(norm)
            display.setdefault(norm, name)

    experiences = queries.list_all("experiences")
    total_years = _calc_total_experience_years(experiences)
    senior = any(
        re.search(r"\b(senior|lead|principal|staff|head|manager)\b", (e.get("title") or ""), re.I)
        for e in experiences
    )
    profile = queries.get_profile() or {}

    return LocalProfile(
        skills=skills,
        skill_display=display,
        experience_count=len(experiences),
        has_current=any(e.get("is_current") for e in experiences),
        senior=senior,
        repo_count=len(queries.list_all("github_repos")),
        has_summary=bool(profile.get("summary")),
        total_years=total_years,
        experiences=experiences,
    )


def compute_fit(
    role: RoleAnalysis, tech_stack: list[TechItem], profile: LocalProfile | None = None
) -> tuple[Fit, list[TechItem]]:
    """Return the fit verdict and the tech stack annotated with what you know."""
    profile = profile if profile is not None else load_local_profile()

    # Requirements = role keywords + must-haves + the company's tech stack.
    tech_names = [t.name for t in tech_stack]
    required_display = _dedupe_display(role.keywords + role.must_haves + tech_names)
    required = {_normalize(r): r for r in required_display}

    matched = [orig for norm, orig in required.items() if _has_skill(profile, norm)]
    must_norm = {_normalize(m) for m in role.must_haves}
    gaps = [
        required[norm]
        for norm in required
        if not _has_skill(profile, norm) and (norm in must_norm or norm in required)
    ][:8]

    annotated = [
        TechItem(
            name=t.name,
            you_know=_has_skill(profile, _normalize(t.name)),
            worth_learning=not _has_skill(profile, _normalize(t.name)),
            source=t.source,
        )
        for t in tech_stack
    ]

    if profile.is_empty:
        return _no_profile_fit(required_display), annotated

    coverage = len(matched) / len(required) if required else 0.0
    technical = round(coverage * 100)

    # Smart Experience Scoring
    target_years, role_exp_need = _calc_role_experience_need(role)
    years = profile.total_years if profile.total_years > 0 else (profile.experience_count * 1.5)
    duration_ratio = min(1.2, years / target_years) if target_years > 0 else 1.0

    exp_relevance = (
        _calc_experience_relevance(profile.experiences, set(required.keys()))
        if profile.experiences
        else (0.7 if profile.skills else 0.4)
    )

    if profile.experience_count == 0:
        experience = 0
    else:
        # 60% duration vs target, 30% relevance to role, 10% current employment
        raw_exp = (duration_ratio * 60) + (exp_relevance * 30) + (10 if profile.has_current else 0)
        experience = max(10, min(100, round(raw_exp)))

    open_source = min(100, profile.repo_count * 14)
    domain = round(_domain_coverage(profile, role) * 100)

    dimensions = [
        FitDimension(name="Technical skills", you=technical, role_need=90),
        FitDimension(name="Experience", you=experience, role_need=role_exp_need),
        FitDimension(name="Domain knowledge", you=domain, role_need=75),
        FitDimension(name="Open-source", you=open_source, role_need=55),
    ]

    score = round(technical * 0.5 + experience * 0.22 + domain * 0.16 + open_source * 0.12)
    verdict, recommendation = _verdict(score, matched, gaps)

    return (
        Fit(
            score=score,
            verdict=verdict,
            recommendation=recommendation,
            dimensions=dimensions,
            matched_skills=matched[:12],
            gaps=gaps,
            experience_fit_pct=experience,
        ),
        annotated,
    )


# ── helpers ──

def _normalize(text: str) -> str:
    token = re.sub(r"[^a-z0-9+#. ]", "", text.strip().lower())
    return _ALIASES.get(token, token)


def _has_skill(profile: LocalProfile, requirement: str) -> bool:
    """True if the profile covers a requirement (exact or containment either way)."""
    if not requirement:
        return False
    if requirement in profile.skills:
        return True
    return any(requirement in s or s in requirement for s in profile.skills if len(s) >= 3)


def _dedupe_display(items: list[str]) -> list[str]:
    seen, out = set(), []
    for item in items:
        key = _normalize(item)
        if key and key not in seen:
            seen.add(key)
            out.append(item.strip())
    return out


def _domain_coverage(profile: LocalProfile, role: RoleAnalysis) -> float:
    keywords = [_normalize(k) for k in role.keywords if k]
    if not keywords:
        return 0.6  # nothing to compare against — neutral
    hit = sum(1 for k in keywords if _has_skill(profile, k))
    return hit / len(keywords)


def _verdict(score: int, matched: list[str], gaps: list[str]) -> tuple[str, str]:
    lead = ", ".join(matched[:3]) or "your relevant experience"
    gap = gaps[0] if gaps else None
    if score >= 80:
        verdict = "STRONG MATCH"
        rec = f"Exceptional fit. Lead with {lead}."
    elif score >= 60:
        verdict = "GOOD MATCH"
        rec = f"Solid fit. Emphasize {lead}."
    else:
        verdict = "STRETCH"
        rec = f"A stretch, but worth a strong letter. Highlight {lead}."
    if gap:
        rec += f" Address the gap in {gap}."
    return verdict, rec


def _no_profile_fit(required: list[str]) -> Fit:
    return Fit(
        score=0,
        verdict="NO PROFILE",
        recommendation="Import your CV to see how your profile fits this role.",
        dimensions=[],
        matched_skills=[],
        gaps=required[:8],
        experience_fit_pct=0,
    )
