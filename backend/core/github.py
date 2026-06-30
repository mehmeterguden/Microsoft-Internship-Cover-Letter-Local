"""Fetch a GitHub profile and repositories — the two import modes.

Two ways to import, both supported:
  1. By username / profile link (public): read anyone's public profile + repos.
  2. Connected account (token): read the authenticated user's repos, including
     private ones, at a higher rate limit.

Uses the GitHub REST API over the standard library (no extra dependency). Maps
each repo to the shape of our `GithubRepo` model; the AI analysis of each repo
(deep description, contribution, involvement rating) is a later step.
"""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request
from typing import Any

API = "https://api.github.com"


def fetch_readme(login: str, repo_name: str, token: str | None = None) -> str:
    """Return a repo's README text, or "" if it has none / can't be read."""
    try:
        data = _get(f"/repos/{login}/{repo_name}/readme", token)
    except ValueError:
        return ""
    content = data.get("content", "")
    if data.get("encoding") == "base64" and content:
        try:
            return base64.b64decode(content).decode("utf-8", "ignore")
        except Exception:  # noqa: BLE001
            return ""
    return ""


def _get(path: str, token: str | None = None) -> Any:
    """GET a GitHub API path, raising ValueError with a clear message on failure."""
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "cover-letter-local"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise ValueError("GitHub user not found.") from exc
        if exc.code in (401, 403):
            raise ValueError(
                "GitHub denied the request (rate limit or invalid token). "
                "Connect your account with a token, or try again later."
            ) from exc
        raise ValueError(f"GitHub API error {exc.code}.") from exc


def _normalize_username(value: str) -> str:
    """Accept a bare username or a profile URL and return the login."""
    value = value.strip().rstrip("/")
    if "github.com/" in value:
        value = value.split("github.com/", 1)[1]
    return value.split("/")[0]


def _map_repo(repo: dict) -> dict[str, Any]:
    """Map a GitHub repo to our GithubRepo shape (plus a `fork` flag for the UI)."""
    language = repo.get("language")
    topics = repo.get("topics") or []
    technologies = ([language] if language else []) + [t for t in topics if t != language]
    return {
        "repo_name": repo.get("name"),
        "url": repo.get("html_url"),
        "stars": repo.get("stargazers_count", 0),
        "last_updated": (repo.get("pushed_at") or "")[:10] or None,
        "technologies": technologies,
        "description": repo.get("description"),  # GitHub's blurb; AI deep-analysis comes later
        "contribution": None,
        "involvement_rating": None,
        "fork": bool(repo.get("fork")),
    }


def fetch(*, username: str | None = None, token: str | None = None, use_account: bool = False) -> dict[str, Any]:
    """Fetch a profile + repos. Mode 1: by username. Mode 2: the connected account."""
    if use_account:
        if not token:
            raise ValueError("No GitHub account connected. Add a token in settings first.")
        profile = _get("/user", token)
        raw = _get("/user/repos?per_page=100&sort=pushed&affiliation=owner", token)
    else:
        if not username or not username.strip():
            raise ValueError("Enter a GitHub username or profile link.")
        login = _normalize_username(username)
        profile = _get(f"/users/{login}", token)
        raw = _get(f"/users/{login}/repos?per_page=100&sort=pushed", token)

    # Own work only (drop forks), best first: stars then most-recently pushed.
    repos = [_map_repo(r) for r in raw if not r.get("fork")]
    repos.sort(key=lambda r: (r["stars"], r["last_updated"] or ""), reverse=True)

    return {
        "profile": {
            "login": profile.get("login"),
            "name": profile.get("name"),
            "bio": profile.get("bio"),
            "avatar_url": profile.get("avatar_url"),
            "html_url": profile.get("html_url"),
            "public_repos": profile.get("public_repos"),
            "followers": profile.get("followers"),
        },
        "repos": repos,
        "count": len(repos),
    }
