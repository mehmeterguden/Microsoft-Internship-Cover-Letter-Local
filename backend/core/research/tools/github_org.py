"""The company's public open-source footprint on GitHub.

Finds the company's GitHub organization (by name search), then summarizes its
public repos: top repos by stars, the language mix, and totals. This feeds both
the "open-source posture" culture signal and the tech-stack picture.

Free: GitHub's public API. If the user connected a token in settings we send it
(higher rate limit); otherwise anonymous requests still work. Guarded like every
other outbound call — the token is a GitHub credential, not the user's private
profile data, so it does not trip the firewall.
"""

from __future__ import annotations

from collections import Counter

from core.research import outbound_guard
from core.research.tools.registry import ToolResult
from db import queries

TOOL = "github_org"
_API = "https://api.github.com"


def profile(company_name: str, *, max_repos: int = 100) -> ToolResult:
    """Return `{login, public_repos, top_repos, languages}` for the company's org."""
    headers = _auth_headers()
    login = _find_org(company_name, headers)
    if not login:
        return ToolResult.fail(TOOL, "GitHub", f"No GitHub organization found for {company_name!r}.")

    try:
        repos = outbound_guard.get_json(
            f"{_API}/orgs/{login}/repos",
            params={"per_page": max_repos, "sort": "stars", "type": "public"},
            headers=headers,
        )
    except ValueError as exc:
        return ToolResult.fail(TOOL, f"github.com/{login}", str(exc))

    languages = Counter(r["language"] for r in repos if r.get("language"))
    top = sorted(repos, key=lambda r: r.get("stargazers_count", 0), reverse=True)[:8]
    top_repos = [
        {
            "name": r.get("name"),
            "stars": r.get("stargazers_count", 0),
            "language": r.get("language"),
            "description": r.get("description"),
            "url": r.get("html_url"),
        }
        for r in top
    ]
    return ToolResult(
        tool=TOOL,
        source=f"https://github.com/{login}",
        data={
            "login": login,
            "public_repos": len(repos),
            "languages": [{"name": n, "repos": c} for n, c in languages.most_common(10)],
            "top_repos": top_repos,
        },
    )


def _auth_headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json"}
    token = (queries.get_settings().get("github_token") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _find_org(name: str, headers: dict[str, str]) -> str | None:
    """Search GitHub for the org whose name best matches the company."""
    data = outbound_guard.get_json(
        f"{_API}/search/users",
        params={"q": f"{name} type:org", "per_page": 1},
        headers=headers,
    )
    items = data.get("items", [])
    return items[0]["login"] if items else None
