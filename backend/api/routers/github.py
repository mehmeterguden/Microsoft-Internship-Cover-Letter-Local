"""GitHub endpoints — import repositories two ways, and save the chosen ones.

    GET  /github/status   is an account connected (token present)?
    POST /github/fetch    fetch profile + repos by username, or from the connected account
    POST /github/save     persist selected repos into the github_repos table
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from core import github, github_analysis
from db import queries
from models import GithubRepo, Skill

router = APIRouter(prefix="/github", tags=["github"])

TABLE = "github_repos"


class FetchRequest(BaseModel):
    username: str | None = None      # mode 1: username or profile link
    use_account: bool = False        # mode 2: use the connected account (token)


class AnalyzeRequest(BaseModel):
    login: str                       # whose repos these are (to fetch READMEs)
    repos: list[GithubRepo]


class ScoredSkill(BaseModel):
    name: str
    score: int | None = None         # 1-5 self-rating inferred from the analysis


class SaveReposRequest(BaseModel):
    repos: list[GithubRepo]
    skills: list[ScoredSkill] = []   # technical skills (with scores) from the analysis


@router.get("/status")
def github_status() -> dict:
    """Report whether a GitHub account (token) is connected."""
    return {"account_connected": bool(queries.get_settings().get("github_token"))}


@router.post("/fetch")
def fetch_repos(req: FetchRequest) -> dict:
    """Fetch a GitHub profile and its repositories (by username or connected account)."""
    token = queries.get_settings().get("github_token") or None
    try:
        return github.fetch(username=req.username, token=token, use_account=req.use_account)
    except ValueError as exc:  # bad input / not found / rate limit
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — network/other
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail=f"GitHub fetch failed ({type(exc).__name__}): {exc}"
        ) from exc


@router.post("/analyze")
def analyze_repos(req: AnalyzeRequest) -> dict:
    """Fetch each repo's README and analyze them with the LLM into reusable context."""
    token = queries.get_settings().get("github_token") or None
    inputs = []
    for repo in req.repos:
        data = repo.model_dump(mode="json", exclude={"id"})
        data["readme"] = github.fetch_readme(req.login, repo.repo_name, token)
        data["languages"] = github.fetch_languages(req.login, repo.repo_name, token)
        inputs.append(data)
    try:
        return github_analysis.analyze(inputs)
    except Exception as exc:  # noqa: BLE001 — LLM/connection failure
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail=f"Analysis failed ({type(exc).__name__}): {exc}"
        ) from exc


@router.post("/save")
def save_repos(req: SaveReposRequest, replace: bool = False) -> dict:
    """Upsert repos into github_repos by name (add new, update existing) and merge
    new skills. `replace=true` wipes the table first (full re-import)."""
    if replace:
        queries.clear(TABLE)

    existing_repos = {r["repo_name"].strip().lower(): r for r in queries.list_all(TABLE)}
    added = updated = 0
    for repo in req.repos:
        payload = repo.model_dump(mode="json", exclude={"id"})
        prior = existing_repos.get((repo.repo_name or "").strip().lower())
        if prior and not replace:
            queries.update(TABLE, prior["id"], payload)
            updated += 1
        else:
            queries.insert(TABLE, payload)
            added += 1

    # Merge skills: add only names not already present (case-insensitive), keeping
    # the inferred score as the self-rating and noting the source.
    existing = {s["name"].strip().lower() for s in queries.list_all("skills")}
    added_skills = 0
    for skill in req.skills:
        name = skill.name.strip()
        key = name.lower()
        if name and key not in existing:
            existing.add(key)
            rating = max(1, min(5, skill.score)) if skill.score else None
            queries.insert(
                "skills",
                Skill(name=name, self_rating=rating, category="From GitHub").model_dump(mode="json", exclude={"id"}),
            )
            added_skills += 1

    return {"ok": True, "saved_repos": added, "updated_repos": updated, "added_skills": added_skills}
