"""Import a LinkedIn profile — three ways, all converging on `CVExtraction`.

LinkedIn has no open API for full profile data (positions/education/skills need
partner approval that indie apps don't get), and scraping a public profile URL
violates LinkedIn's terms. So we support the reliable, privacy-respecting paths:

  1. Data export (recommended)  — the ZIP LinkedIn gives every user under
     "Settings > Data privacy > Get a copy of your data". A bundle of CSVs
     (Profile, Positions, Education, Skills, Certifications, Languages, Projects,
     …). Parsed here *deterministically* into our `CVExtraction` shape — no LLM,
     no network call, so it works fully offline and never hallucinates.
  2. Pasted text                — the user copies their profile text; the caller
     runs it through the same LLM structuring the CV import uses. (Not in this
     module — the router reuses `core.cv_structuring`.)
  3. OAuth "Sign in with LinkedIn" (OpenID Connect) — verifies identity and
     returns name / email / picture / headline only. LinkedIn does NOT expose
     work history or skills over OAuth to standard apps; the export ZIP is what
     fills the deep data. The helpers below drive the auth-code flow.

Only OAuth touches the network, and only when the user opts in by connecting an
account — consistent with the project's local-first, no-data-leaves-the-device rule.
"""

from __future__ import annotations

import csv
import io
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from typing import Any

from models import (
    Certificate,
    CVExtraction,
    Education,
    Experience,
    Language,
    LanguageLevel,
    Link,
    Profile,
    Project,
    Skill,
)

# ─────────────────────────────────────────────────────────────────────
#  Data-export ZIP → CVExtraction (deterministic, offline)
# ─────────────────────────────────────────────────────────────────────

MAX_ROWS = 500  # per section — guards against a pathologically large export

_MONTHS = {
    "jan": "01", "feb": "02", "mar": "03", "apr": "04", "may": "05", "jun": "06",
    "jul": "07", "aug": "08", "sep": "09", "oct": "10", "nov": "11", "dec": "12",
}

# LinkedIn's proficiency phrases → our LanguageLevel enum.
_PROFICIENCY = {
    "native or bilingual": LanguageLevel.native,
    "full professional": LanguageLevel.fluent,
    "professional working": LanguageLevel.professional,
    "limited working": LanguageLevel.intermediate,
    "elementary": LanguageLevel.basic,
}


def _norm_date(value: str | None) -> str | None:
    """Normalize a LinkedIn date to ISO-ish text ("YYYY", "YYYY-MM", "YYYY-MM-DD").

    LinkedIn exports use forms like "Aug 2021", "2021", or "2021-08-15". Anything
    unrecognized is returned trimmed (never invented), and empty becomes None.
    """
    text = (value or "").strip()
    if not text:
        return None
    # Already ISO (YYYY, YYYY-MM, YYYY-MM-DD).
    if re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", text):
        return text
    # "Mon YYYY" → "YYYY-MM".
    match = re.fullmatch(r"([A-Za-z]{3,})\.?\s+(\d{4})", text)
    if match:
        month = _MONTHS.get(match.group(1)[:3].lower())
        if month:
            return f"{match.group(2)}-{month}"
    return text


def _clean(value: str | None) -> str | None:
    """Trim a cell; return None when empty so optional fields stay unset."""
    text = (value or "").strip()
    return text or None


def _proficiency(value: str | None) -> LanguageLevel | None:
    text = (value or "").strip().lower()
    if not text:
        return None
    for phrase, level in _PROFICIENCY.items():
        if phrase in text:
            return level
    return None


def _read_csv(archive: zipfile.ZipFile, wanted: str) -> list[dict[str, str]]:
    """Return the rows of the CSV whose file name matches `wanted` (case- and
    folder-insensitive), or [] if the export doesn't include it.

    LinkedIn ships slightly different file names across export versions, so we
    match on the base name containing the wanted stem (e.g. "Positions").
    """
    stem = wanted.lower()
    for name in archive.namelist():
        base = name.rsplit("/", 1)[-1].lower()
        if base.endswith(".csv") and stem in base:
            with archive.open(name) as handle:
                text = io.TextIOWrapper(handle, encoding="utf-8-sig", errors="replace")
                reader = csv.DictReader(text)
                rows: list[dict[str, str]] = []
                for row in reader:
                    # Normalize keys so lookups are resilient to stray whitespace.
                    rows.append({(k or "").strip(): (v or "").strip() for k, v in row.items()})
                    if len(rows) >= MAX_ROWS:
                        break
                return rows
    return []


def _get(row: dict[str, str], *keys: str) -> str | None:
    """First non-empty value among `keys` (LinkedIn column names vary a little)."""
    for key in keys:
        value = row.get(key)
        if value and value.strip():
            return value.strip()
    return None


def _websites_to_links(value: str | None) -> list[Link]:
    """Parse the Profile.csv "Websites" cell into Link entries.

    The cell looks like "[PORTFOLIO:https://a.com],[COMPANY:https://b.com]" or a
    bare list of URLs; we extract each URL and use any leading tag as the label.
    """
    text = (value or "").strip()
    if not text:
        return []
    links: list[Link] = []
    seen: set[str] = set()
    for chunk in re.split(r"[,\[\]]", text):
        chunk = chunk.strip()
        if not chunk:
            continue
        label = "Website"
        url = chunk
        tag = re.match(r"([A-Za-z ]+)\s*:\s*(https?://.+)", chunk)
        if tag:
            label = tag.group(1).strip().title()
            url = tag.group(2).strip()
        url_match = re.search(r"https?://[^\s,]+", url)
        if not url_match:
            continue
        url = url_match.group(0)
        if url in seen:
            continue
        seen.add(url)
        links.append(Link(label=label, url=url))
    return links


def parse_export(zip_bytes: bytes) -> CVExtraction:
    """Turn a LinkedIn data-export ZIP into a validated `CVExtraction`.

    Deterministic: each CSV maps straight onto our models, so the result is
    exactly what LinkedIn holds — no LLM, no network, no guessing. Sections the
    export omits simply come back empty. Raises ValueError if the upload isn't a
    readable ZIP or contains no recognizable LinkedIn CSVs.
    """
    try:
        archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as exc:
        raise ValueError(
            "That file isn't a readable ZIP. Upload the archive LinkedIn emails you "
            "from Settings > Data privacy > Get a copy of your data."
        ) from exc

    csv_names = [n for n in archive.namelist() if n.lower().endswith(".csv")]
    if not csv_names:
        raise ValueError("No CSV files found in the archive — is this the LinkedIn data export ZIP?")

    # ── Profile (identity + summary) ──
    profile = Profile()
    profile_rows = _read_csv(archive, "Profile")
    if profile_rows:
        row = profile_rows[0]
        profile.name = _get(row, "First Name")
        profile.surname = _get(row, "Last Name")
        # Prefer the About/Summary; fall back to the headline so `summary` is useful.
        profile.summary = _get(row, "Summary", "Headline")
    # Contact details live in their own files.
    email_rows = _read_csv(archive, "Email Addresses")
    if email_rows:
        primary = next((r for r in email_rows if (r.get("Primary") or "").lower() in ("yes", "true")), email_rows[0])
        profile.email = _get(primary, "Email Address")
    phone_rows = _read_csv(archive, "Phone Numbers")
    if phone_rows:
        profile.phone = _get(phone_rows[0], "Number")

    # ── Skills ──
    skills = [
        Skill(name=name)
        for row in _read_csv(archive, "Skills")
        if (name := _get(row, "Name"))
    ]

    # ── Experience (Positions) ──
    experiences = []
    for row in _read_csv(archive, "Positions"):
        company = _get(row, "Company Name")
        title = _get(row, "Title")
        if not company or not title:
            continue  # both are required by the Experience model
        end = _norm_date(_get(row, "Finished On"))
        experiences.append(
            {
                "company": company,
                "title": title,
                "location": _get(row, "Location"),
                "start_date": _norm_date(_get(row, "Started On")),
                "end_date": end,
                "is_current": end is None,
                "description": _get(row, "Description"),
            }
        )

    # ── Education ──
    education = []
    for row in _read_csv(archive, "Education"):
        institution = _get(row, "School Name")
        if not institution:
            continue
        end = _norm_date(_get(row, "End Date"))
        education.append(
            {
                "institution": institution,
                "degree": _get(row, "Degree Name"),
                "start_date": _norm_date(_get(row, "Start Date")),
                "end_date": end,
                "is_current": end is None,
            }
        )

    # ── Certifications ──
    certificates = [
        Certificate(
            name=name,
            issuer=_get(row, "Authority"),
            url=_get(row, "Url"),
            issue_date=_norm_date(_get(row, "Started On")),
            expiry_date=_norm_date(_get(row, "Finished On")),
            credential_id=_get(row, "License Number"),
        )
        for row in _read_csv(archive, "Certifications")
        if (name := _get(row, "Name"))
    ]

    # ── Languages ──
    languages = [
        Language(name=name, proficiency=_proficiency(_get(row, "Proficiency")))
        for row in _read_csv(archive, "Languages")
        if (name := _get(row, "Name"))
    ]

    # ── Projects ──
    projects = [
        Project(
            name=name,
            description=_get(row, "Description"),
            url=_get(row, "Url"),
            start_date=_norm_date(_get(row, "Started On")),
            end_date=_norm_date(_get(row, "Finished On")),
        )
        for row in _read_csv(archive, "Projects")
        if (name := _get(row, "Title"))
    ]

    # ── Links (from the profile's Websites cell) ──
    links = _websites_to_links(profile_rows[0].get("Websites")) if profile_rows else []

    return CVExtraction(
        profile=profile,
        skills=skills,
        experiences=[Experience(**e) for e in experiences],
        education=[Education(**e) for e in education],
        projects=projects,
        certificates=certificates,
        languages=languages,
        links=links,
    )


# ─────────────────────────────────────────────────────────────────────
#  OAuth 2.0 / OpenID Connect ("Sign in with LinkedIn")
# ─────────────────────────────────────────────────────────────────────

AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
# OpenID Connect scopes — the only ones standard apps are granted.
SCOPES = "openid profile email"


def authorize_url(client_id: str, redirect_uri: str, state: str) -> str:
    """Build the LinkedIn authorization URL to send the user's browser to."""
    query = urllib.parse.urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": SCOPES,
        }
    )
    return f"{AUTHORIZE_URL}?{query}"


def exchange_code(code: str, redirect_uri: str, client_id: str, client_secret: str) -> dict[str, Any]:
    """Exchange an authorization code for an access token. Raises ValueError on failure."""
    body = urllib.parse.urlencode(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "client_secret": client_secret,
        }
    ).encode()
    request = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        raise ValueError(
            "LinkedIn rejected the sign-in (check the app's Client ID/Secret and that "
            "the redirect URL is registered exactly as shown)."
        ) from exc


def fetch_userinfo(access_token: str) -> dict[str, Any]:
    """Fetch the OpenID Connect userinfo (name, email, picture). Raises ValueError on failure."""
    request = urllib.request.Request(
        USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        raise ValueError("Couldn't read your LinkedIn profile after sign-in.") from exc
