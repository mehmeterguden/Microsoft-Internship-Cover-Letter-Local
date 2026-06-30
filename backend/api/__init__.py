"""API layer — mounts every onboarding router under a single `/api` prefix.

`api_router` is the one object `main.py` includes. Each resource lives in its own
module under `api/routers/`; we include them here in onboarding order.
"""

from __future__ import annotations

from fastapi import APIRouter

from api.routers import (
    certificates,
    cv,
    education,
    experiences,
    github_repos,
    languages,
    links,
    llm,
    past_cover_letters,
    profile,
    projects,
    settings,
    skill_links,
    skills,
    trainings,
)

api_router = APIRouter(prefix="/api")

# Config, model health, and CV parsing.
api_router.include_router(settings.router)
api_router.include_router(llm.router)
api_router.include_router(cv.router)

# Identity first, then skills and portfolio, then writing samples.
api_router.include_router(profile.router)
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
