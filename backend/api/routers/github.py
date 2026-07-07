"""GitHub endpoints — import repositories two ways, and save the chosen ones.

    GET  /github/status   is an account connected (token present)?
    POST /github/fetch    fetch profile + repos by username, or from the connected account
    POST /github/save     persist selected repos into the github_repos table
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from core import github, github_analysis
from db import queries
from models import GithubRepo, Project, Skill, Source

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
    """Sync GitHub import into the profile: repos, projects, and skills.

    A GitHub import only ever touches the Projects and Skills sections — never
    the CV-owned identity/experience/education. For each selected repo we:
      • upsert the raw repo into `github_repos` (add new, update existing by name);
      • mirror it into `projects` so it shows up on the Profile page, but only if
        no project with that name already exists from a manual or CV source —
        those are the user's own entries and are left untouched. A project we
        previously imported from GitHub is refreshed in place.
    Skills inferred from the analysis are merged by name (case-insensitive),
    stamped as GitHub-sourced. `replace=true` wipes `github_repos` first.
    """
    today = date.today().isoformat()

    if replace:
        queries.clear(TABLE)

    existing_repos = {r["repo_name"].strip().lower(): r for r in queries.list_all(TABLE)}
    existing_projects = {(p["name"] or "").strip().lower(): p for p in queries.list_all("projects")}

    added = updated = 0
    proj_added = proj_updated = proj_skipped = 0
    for repo in req.repos:
        name = (repo.repo_name or "").strip()
        payload = repo.model_dump(mode="json", exclude={"id"})

        # 1) Upsert the raw repo, keeping its id so the project can link back.
        prior_repo = existing_repos.get(name.lower())
        if prior_repo and not replace:
            repo_id = prior_repo["id"]
            queries.update(TABLE, repo_id, payload)
            updated += 1
        else:
            repo_id = queries.insert(TABLE, payload)
            added += 1

        # 2) Mirror into `projects` — dedup against manual/CV entries.
        if not name:
            continue
        project = Project(
            name=name,
            description=repo.description or repo.purpose,
            role=repo.contribution,
            technologies=repo.technologies,
            url=repo.url,
            github_repo_id=repo_id,
            source=Source.github,
            source_detail=name,
            source_at=today,
        ).model_dump(mode="json", exclude={"id"})
        prior_proj = existing_projects.get(name.lower())
        if prior_proj is None:
            new_id = queries.insert("projects", project)
            existing_projects[name.lower()] = {**project, "id": new_id}
            proj_added += 1
        elif prior_proj.get("source") == Source.github.value:
            queries.update("projects", prior_proj["id"], project)
            proj_updated += 1
        else:
            proj_skipped += 1  # user's own / CV project — don't overwrite

    # Merge skills: add only names not already present (case-insensitive), keeping
    # the inferred score as the self-rating and stamping the GitHub source.
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
                Skill(
                    name=name,
                    self_rating=rating,
                    category="From GitHub",
                    source=Source.github,
                    source_detail="GitHub analysis",
                    source_at=today,
                ).model_dump(mode="json", exclude={"id"}),
            )
            added_skills += 1

    return {
        "ok": True,
        "saved_repos": added,
        "updated_repos": updated,
        "added_projects": proj_added,
        "updated_projects": proj_updated,
        "skipped_projects": proj_skipped,
        "added_skills": added_skills,
    }
