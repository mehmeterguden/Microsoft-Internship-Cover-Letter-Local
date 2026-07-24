"""API layer — mounts every onboarding router under a single `/api` prefix.

`api_router` is the one object `main.py` includes. Each resource lives in its own
module under `api/routers/`; we include them here in onboarding order.
"""

from __future__ import annotations

from fastapi import APIRouter

from api.routers import (
    certificates,
    companies,
    cover_letter,
    cv,
    data,
    education,
    experiences,
    github,
    github_repos,
    interview,
    jobs,
    languages,
    linkedin,
    links,
    llm,
    past_cover_letters,
    profile,
    profile_completion,
    projects,
    reconcile,
    research,
    settings,
    skill_links,
    skills,
    style,
    trainings,
)

api_router = APIRouter(prefix="/api")

# Config, model health, CV parsing, and GitHub import.
api_router.include_router(settings.router)
api_router.include_router(llm.router)
api_router.include_router(companies.router)  # company-name autocomplete
api_router.include_router(cv.router)
api_router.include_router(github.router)
api_router.include_router(linkedin.router)  # LinkedIn import (export ZIP / paste / OAuth)
api_router.include_router(reconcile.router)  # non-destructive merge plan for imports
api_router.include_router(research.router)  # dev demo for Phase 1 tools
api_router.include_router(cover_letter.router)  # streaming cover-letter generation
api_router.include_router(style.router)  # writing-style learning

# Identity first, then skills and portfolio, then writing samples.
api_router.include_router(profile.router)
api_router.include_router(profile_completion.router)  # AI-guided gap filling
api_router.include_router(interview.router)  # AI profile interview & context synthesis
api_router.include_router(skills.router)
api_router.include_router(skill_links.router)
api_router.include_router(github_repos.router)
api_router.include_router(projects.router)
api_router.include_router(experiences.router)
api_router.include_router(education.router)
api_router.include_router(trainings.router)
api_router.include_router(certificates.router)
api_router.include_router(languages.router)
api_router.include_router(links.router)
api_router.include_router(past_cover_letters.router)
api_router.include_router(jobs.router)  # saved applications + letter snapshots
api_router.include_router(data.router)  # destructive: reset all profile data
