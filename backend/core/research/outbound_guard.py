"""Privacy firewall — the single choke point for every outbound request.

The product's core promise: the CV and profile never leave the machine. Company
research does make external calls, but only ever with public data (company name,
role title, the employer's job text). This module enforces that promise two ways:

  1. Allowlist (primary): research code is built around `ResearchInput`, whose
     fields are public by construction.
  2. Denylist backstop (here): before any request goes out, `assert_safe` scans
     the exact bytes we are about to send for the user's private identifiers
     (name, email, phone, handles, CV summary). If any appear — a bug leaked
     private data into a query — we raise `OutboundLeakError` and send nothing.

All research tools MUST use the `get_json` / `get_text` / `post_json` helpers
below instead of calling `urllib` directly, so every outbound byte is checked.
Uses the standard library only (like `core/github.py`) — no HTTP dependency.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from db import queries

_UA = "cover-letter-local"
# Identifiers shorter than this are too generic to match on safely.
_MIN_SNIPPET = 5


class OutboundLeakError(RuntimeError):
    """Raised when an outbound request would carry the user's private data."""


def private_fingerprint() -> set[str]:
    """Lowercased private identifiers that must never appear in an outbound request.

    Pulled fresh from the profile row: full name, email, phone, LinkedIn/GitHub
    handles, and the CV-derived summary. Deliberately strong identifiers only —
    generic skill words (e.g. "python") are NOT here, since they legitimately
    appear in public job descriptions. Empty when no profile exists yet.
    """
    try:
        profile = queries.get_profile()
    except Exception:  # noqa: BLE001 — a missing/empty profile just means no fingerprint
        return set()
    if not profile:
        return set()

    name = " ".join(p for p in (profile.get("name"), profile.get("surname")) if p).strip()
    candidates = [
        name,
        profile.get("email"),
        profile.get("phone"),
        profile.get("linkedin"),
        profile.get("github"),
        profile.get("summary"),
    ]
    return {
        c.strip().lower()
        for c in candidates
        if isinstance(c, str) and len(c.strip()) >= _MIN_SNIPPET
    }


def assert_safe(*texts: str | None) -> None:
    """Raise `OutboundLeakError` if any private identifier appears in `texts`.

    `texts` is everything about to be sent — the URL, encoded params, request body.
    """
    fingerprint = private_fingerprint()
    if not fingerprint:
        return
    haystack = " ".join(t for t in texts if t).lower()
    for snippet in fingerprint:
        if snippet in haystack:
            raise OutboundLeakError(
                "Blocked an outbound request that contained private profile data. "
                "Company research may only send public information."
            )


# ─────────────────────────────────────────────────────────────
#  Guarded HTTP — every research tool goes through these
# ─────────────────────────────────────────────────────────────

def _build_url(url: str, params: dict[str, Any] | None) -> str:
    if not params:
        return url
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    joiner = "&" if "?" in url else "?"
    return f"{url}{joiner}{query}"


def _open(req: urllib.request.Request, timeout: int) -> bytes:
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        raise ValueError(f"HTTP {exc.code} from {req.full_url}") from exc
    except urllib.error.URLError as exc:
        raise ValueError(f"Could not reach {req.full_url}: {exc.reason}") from exc


def get_text(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 20,
) -> str:
    """GET a URL and return the body as text — after the privacy check."""
    full = _build_url(url, params)
    assert_safe(full)
    req = urllib.request.Request(full, headers={"User-Agent": _UA, **(headers or {})})
    return _open(req, timeout).decode("utf-8", "ignore")


def get_json(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 20,
) -> Any:
    """GET a URL and parse JSON — after the privacy check."""
    full = _build_url(url, params)
    assert_safe(full)
    req = urllib.request.Request(
        full, headers={"User-Agent": _UA, "Accept": "application/json", **(headers or {})}
    )
    return json.loads(_open(req, timeout))


def post_json(
    url: str,
    payload: dict[str, Any],
    *,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
) -> Any:
    """POST a JSON body and parse the JSON reply — after the privacy check.

    Note: an API key inside `payload` (e.g. Tavily's) is the *service's* key, not
    the user's private data, so it does not trip the fingerprint.
    """
    body = json.dumps(payload)
    assert_safe(url, body)
    req = urllib.request.Request(
        url,
        data=body.encode("utf-8"),
        headers={"User-Agent": _UA, "Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    return json.loads(_open(req, timeout))


def post_form(
    url: str,
    fields: dict[str, Any],
    *,
    headers: dict[str, str] | None = None,
    timeout: int = 20,
) -> str:
    """POST a form-encoded body and return the response text — after the privacy check."""
    body = urllib.parse.urlencode(fields)
    assert_safe(url, body)
    req = urllib.request.Request(
        url,
        data=body.encode("utf-8"),
        headers={
            "User-Agent": _UA,
            "Content-Type": "application/x-www-form-urlencoded",
            **(headers or {}),
        },
        method="POST",
    )
    return _open(req, timeout).decode("utf-8", "ignore")
