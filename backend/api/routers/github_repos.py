"""GitHub repository endpoints — CRUD over the `github_repos` table.

This phase stores repos that are added/edited by hand. Auto-fetching from GitHub
and AI analysis of each repo come in a later phase.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from db import queries
from models import GithubRepo

router = APIRouter(prefix="/github-repos", tags=["github-repos"])

TABLE = "github_repos"


@router.get("", response_model=list[GithubRepo])
def list_github_repos() -> list[GithubRepo]:
    """List all GitHub repos."""
    return [GithubRepo(**row) for row in queries.list_all(TABLE)]


@router.post("", response_model=GithubRepo, status_code=status.HTTP_201_CREATED)
def create_github_repo(repo: GithubRepo) -> GithubRepo:
    """Add a new GitHub repo."""
    new_id = queries.insert(TABLE, repo.model_dump(mode="json", exclude={"id"}))
    return GithubRepo(**queries.get_by_id(TABLE, new_id))


@router.get("/{repo_id}", response_model=GithubRepo)
def get_github_repo(repo_id: int) -> GithubRepo:
    """Fetch one GitHub repo by id."""
    row = queries.get_by_id(TABLE, repo_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"github repo {repo_id} not found")
    return GithubRepo(**row)


@router.put("/{repo_id}", response_model=GithubRepo)
def update_github_repo(repo_id: int, repo: GithubRepo) -> GithubRepo:
    """Replace an existing GitHub repo."""
    if queries.get_by_id(TABLE, repo_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"github repo {repo_id} not found")
    queries.update(TABLE, repo_id, repo.model_dump(mode="json", exclude={"id"}))
    return GithubRepo(**queries.get_by_id(TABLE, repo_id))


@router.delete("/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_github_repo(repo_id: int) -> None:
    """Delete a GitHub repo and any profile project mirrored from it."""
    row = queries.get_by_id(TABLE, repo_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"github repo {repo_id} not found")

    repo_name = (row.get("repo_name") or "").strip().lower()

    # Delete any project in the projects table that was created from this GitHub repo
    for proj in queries.list_all("projects"):
        p_name = (proj.get("name") or "").strip().lower()
        p_detail = (proj.get("source_detail") or "").strip().lower()
        p_gid = proj.get("github_repo_id")

        if p_gid == repo_id or (proj.get("source") == "github" and (p_detail == repo_name or p_name == repo_name)):
            queries.delete("projects", proj["id"])

    queries.delete(TABLE, repo_id)
    return None
