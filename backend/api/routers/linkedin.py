"""LinkedIn import endpoints — three ways in, all landing in the profile.

    GET    /linkedin/status            OAuth config/connection state + redirect URI to register
    POST   /linkedin/config            save the LinkedIn app's Client ID/Secret
    DELETE /linkedin/connection        disconnect (forget the access token)
    GET    /linkedin/oauth/start       redirect the browser to LinkedIn's consent screen
    GET    /linkedin/oauth/callback    OAuth return: exchange code, prefill identity, bounce to the UI
    POST   /linkedin/import            multipart data-export ZIP → parsed CVExtraction (preview)
    POST   /linkedin/parse-text        pasted profile text → LLM-structured CVExtraction (preview)
    POST   /linkedin/save              persist a reviewed CVExtraction into the profile (source=linkedin)

Import never destroys other sources: a save refreshes only LinkedIn-sourced rows
and adds what's genuinely new, so CV / manual / GitHub data is always preserved.
"""

from __future__ import annotations

import sqlite3
import urllib.parse
from datetime import date
from secrets import token_urlsafe

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

import config
from core import cv_structuring, errors, linkedin
from db import queries
from models import CVExtraction, Source

router = APIRouter(prefix="/linkedin", tags=["linkedin"])

MAX_BYTES = 25 * 1024 * 1024  # a LinkedIn export is a few MB; this is generous headroom

# Sections a save writes, in the order they're reported back to the UI.
_SECTIONS = ("skills", "experiences", "education", "projects", "certificates", "trainings", "languages", "links")


# ─────────────────────────────────────────────────────────────────────
#  Preview: turn an upload / paste into a CVExtraction the user can review
# ─────────────────────────────────────────────────────────────────────

@router.post("/import")
async def import_export(file: UploadFile = File(...)) -> dict:
    """Parse an uploaded LinkedIn data-export ZIP into structured profile data.

    Deterministic and fully local — no LLM, no network. Returns the parsed
    `CVExtraction` for review; nothing is saved until `POST /linkedin/save`.
    """
    data = await file.read()
    if not data:
        raise errors.validation("The uploaded file is empty.")
    if len(data) > MAX_BYTES:
        raise errors.file_too_large(MAX_BYTES // (1024 * 1024))
    try:
        extraction = linkedin.parse_export(data)
    except ValueError as exc:
        raise errors.validation(str(exc)) from exc
    return {"filename": file.filename, "structured": extraction.model_dump(mode="json")}


class ParseTextRequest(BaseModel):
    text: str


@router.post("/parse-text")
def parse_text(req: ParseTextRequest) -> dict:
    """Structure pasted LinkedIn profile text with the LLM (reuses the CV pipeline).

    Returns the same shape as the CV structuring endpoint: `ok` plus `structured`
    on success, or `error` + `raw_output` when the model's JSON didn't validate.
    An LLM/connection failure propagates to the global handler (classified).
    """
    if not req.text.strip():
        raise errors.validation("Paste your LinkedIn profile text first.")
    return cv_structuring.structure(req.text)


# ─────────────────────────────────────────────────────────────────────
#  Save: merge a reviewed CVExtraction into the profile (never destructive)
# ─────────────────────────────────────────────────────────────────────

def _natural_key(table: str, row: dict) -> str:
    """A dedup key so a LinkedIn import never duplicates an existing entry."""
    def joined(*keys: str) -> str:
        return "|".join((str(row.get(k) or "")).strip().lower() for k in keys)

    if table == "experiences":
        return joined("company", "title")
    if table == "education":
        return joined("institution", "degree")
    if table == "links":
        return joined("url")
    return joined("name")  # skills, projects, certificates, trainings, languages


class SaveRequest(CVExtraction):
    """A reviewed extraction plus the profile URL the export/paste can't supply."""

    profile_url: str | None = None


@router.post("/save")
def save_import(req: SaveRequest, replace: bool = True) -> dict:
    """Persist reviewed LinkedIn data into the profile, stamped `source='linkedin'`.

    Non-destructive by design:
      • Identity fields fill only *blanks* — a name/email already set (e.g. from a
        CV) is never overwritten. The profile URL is always recorded (the one thing
        LinkedIn's export leaves out).
      • Each list section refreshes only its LinkedIn-sourced rows (`replace=True`),
        then adds entries that aren't already present by natural key — so CV,
        manual, and GitHub rows are preserved and never duplicated.
    """
    today = date.today().isoformat()
    stamp = {"source": Source.linkedin.value, "source_detail": "LinkedIn import", "source_at": today}
    field_source = {"source": Source.linkedin.value, "detail": "LinkedIn import", "at": today}

    # ── Profile identity — fill blanks only, always record the URL ──
    existing = queries.get_profile() or {}
    merged = dict(existing)
    field_sources = dict(existing.get("field_sources") or {})
    filled = 0
    for key, value in req.profile.model_dump(mode="json").items():
        if key in ("style_profile", "field_sources") or value in (None, "", []):
            continue
        if not merged.get(key):
            merged[key] = value
            field_sources[key] = field_source
            filled += 1
    if req.profile_url and req.profile_url.strip():
        merged["linkedin"] = req.profile_url.strip()
        field_sources["linkedin"] = field_source
    merged["field_sources"] = field_sources
    if merged:
        queries.save_profile(merged)

    # ── List sections — refresh LinkedIn rows, add what's new ──
    incoming: dict[str, list] = {
        "skills": req.skills,
        "experiences": req.experiences,
        "education": req.education,
        "projects": req.projects,
        "certificates": req.certificates,
        "trainings": req.trainings,
        "languages": req.languages,
        "links": req.links,
    }
    saved: dict[str, int] = {}
    for table in _SECTIONS:
        if replace:
            for row in queries.list_all(table):
                if (row.get("source") or "") == Source.linkedin.value:
                    queries.delete(table, row["id"])
        present = {_natural_key(table, r) for r in queries.list_all(table)}
        added = 0
        for item in incoming[table]:
            payload = {**item.model_dump(mode="json", exclude={"id"}), **stamp}
            key = _natural_key(table, payload)
            if not key.strip("|") or key in present:
                continue
            present.add(key)
            try:
                queries.insert(table, payload)
                added += 1
            except sqlite3.IntegrityError:
                pass  # skip rows that violate a constraint (e.g. a stale FK)
        saved[table] = added

    return {"ok": True, "profile_fields": filled, "saved": saved}


# ─────────────────────────────────────────────────────────────────────
#  OAuth 2.0 "Sign in with LinkedIn" (identity prefill only)
# ─────────────────────────────────────────────────────────────────────

def _redirect_uri(request: Request) -> str:
    """The callback URL — must match exactly what's registered in the LinkedIn app."""
    return str(request.url_for("linkedin_oauth_callback"))


@router.get("/status")
def linkedin_status(request: Request) -> dict:
    """Report OAuth config/connection state and the exact redirect URI to register."""
    settings = queries.get_settings()
    return {
        "configured": bool(settings.get("linkedin_client_id") and settings.get("linkedin_client_secret")),
        "connected": bool(settings.get("linkedin_access_token")),
        "name": settings.get("linkedin_connected_name") or "",
        "redirect_uri": _redirect_uri(request),
    }


class ConfigRequest(BaseModel):
    client_id: str = ""
    client_secret: str = ""


@router.post("/config")
def save_config(body: ConfigRequest) -> dict:
    """Save the LinkedIn developer app's Client ID/Secret (used to sign in)."""
    queries.save_settings(
        {
            "linkedin_client_id": body.client_id.strip(),
            "linkedin_client_secret": body.client_secret.strip(),
        }
    )
    return {"ok": True}


@router.delete("/connection")
def disconnect() -> dict:
    """Forget the stored access token (does not revoke the app in LinkedIn)."""
    queries.save_settings(
        {"linkedin_access_token": "", "linkedin_connected_name": "", "linkedin_token_expires_at": ""}
    )
    return {"ok": True}


@router.get("/oauth/start")
def oauth_start(request: Request) -> RedirectResponse:
    """Kick off the auth-code flow: store a CSRF state and redirect to LinkedIn."""
    settings = queries.get_settings()
    client_id = settings.get("linkedin_client_id") or ""
    if not client_id:
        raise errors.validation("Add your LinkedIn app's Client ID and Secret first.")
    state = token_urlsafe(24)
    queries.save_settings({"linkedin_oauth_state": state})
    return RedirectResponse(linkedin.authorize_url(client_id, _redirect_uri(request), state))


def _prefill_identity(info: dict) -> None:
    """Fill blank profile identity fields from the OAuth userinfo (never overwrite)."""
    today = date.today().isoformat()
    field_source = {"source": Source.linkedin.value, "detail": "LinkedIn sign-in", "at": today}
    existing = queries.get_profile() or {}
    merged = dict(existing)
    field_sources = dict(existing.get("field_sources") or {})
    changed = False
    candidates = {
        "name": info.get("given_name"),
        "surname": info.get("family_name"),
        "email": info.get("email"),
    }
    for key, value in candidates.items():
        if value and not merged.get(key):
            merged[key] = value
            field_sources[key] = field_source
            changed = True
    if changed:
        merged["field_sources"] = field_sources
        queries.save_profile(merged)


@router.get("/oauth/callback", name="linkedin_oauth_callback")
def oauth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """Handle LinkedIn's redirect: verify state, exchange the code, prefill identity.

    Always bounces back to the frontend LinkedIn page with a query flag the UI reads
    (`linkedin_connected=1&name=…` on success, or `linkedin_error=<reason>`).
    """
    frontend = config.FRONTEND_ORIGIN.rstrip("/")

    def back(**params: str) -> RedirectResponse:
        return RedirectResponse(f"{frontend}/linkedin?{urllib.parse.urlencode(params)}")

    if error or not code:
        return back(linkedin_error=error or "cancelled")
    settings = queries.get_settings()
    if not state or state != (settings.get("linkedin_oauth_state") or ""):
        return back(linkedin_error="state_mismatch")
    queries.save_settings({"linkedin_oauth_state": ""})

    try:
        token = linkedin.exchange_code(
            code,
            _redirect_uri(request),
            settings.get("linkedin_client_id") or "",
            settings.get("linkedin_client_secret") or "",
        )
        access_token = token.get("access_token") or ""
        info = linkedin.fetch_userinfo(access_token) if access_token else {}
    except ValueError:
        return back(linkedin_error="exchange_failed")

    name = info.get("name") or " ".join(
        part for part in (info.get("given_name"), info.get("family_name")) if part
    )
    queries.save_settings(
        {
            "linkedin_access_token": access_token,
            "linkedin_connected_name": name,
            "linkedin_token_expires_at": str(token.get("expires_in") or ""),
        }
    )
    _prefill_identity(info)
    return back(linkedin_connected="1", name=name)
