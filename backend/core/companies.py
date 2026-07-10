"""Company-name autocomplete — suggest companies as the user types.

Two pluggable providers, chosen in settings:

  • wikidata   — free, keyless (default). Searches Wikidata, keeps only company-like
                 entities (those with an official website / logo / company class), and
                 pulls the real brand logo from Wikimedia Commons.
  • brandfetch — needs a free *public* client id. Cleaner brand results with logos in
                 one call; falls back to keyless access when no id is set.

Logos are returned as upstream URLs; the frontend loads them through our own
`/api/companies/logo` proxy (see the router) so the browser never talks to a third
party directly and images are cached. A tiny in-memory TTL cache keeps typeahead snappy.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from db import queries
from models import CompanySuggestion

_UA = "CoverLetterLocal/0.1 (company autocomplete; local single-user app)"
_TIMEOUT = 8.0

# ── in-memory TTL cache (typeahead fires often; keep it cheap) ──
_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_CACHE_TTL = 600.0   # seconds
_CACHE_MAX = 512

# Wikidata "instance of" (P31) classes that mark an entity as a company/org. Not
# exhaustive on purpose — the website/logo signals below catch the rest.
_ORG_CLASSES = {
    "Q4830453",   # business
    "Q6881511",   # enterprise
    "Q783794",    # company
    "Q891723",    # public company
    "Q167037",    # corporation
    "Q1589009",   # privately held company
    "Q43229",     # organization
    "Q431289",    # brand
    "Q18388277",  # technology company
    "Q45103187",  # startup
    "Q4830453",
}

# Wikidata English descriptions are consistent enough to spot non-companies that
# merely happen to have a website (a city named "Toyota", a stadium, a person).
# Class QIDs vary too much (subclasses), so the description is the reliable signal.
# Start-anchored nouns ("city in…") plus whole-word markers ("… stadium …").
_NON_COMPANY_START = re.compile(
    r"^(city|cities|town|village|municipality|commune|district|county|province|region|"
    r"human settlement|capital|neighbou?rhood|river|lake|mountain|island|"
    r"given name|male given name|female given name|surname|family name|genus|species|family of)\b",
    re.IGNORECASE,
)
_NON_COMPANY_WORD = re.compile(
    r"\b(stadium|arena|sports venue|journal|footballer|football club|"
    r"(?:volleyball|basketball|baseball|hockey|handball|rugby|cricket|sports|national) team|"
    r"musician|record producer|singer|songwriter|actor|actress|politician|"
    r"village|municipality|settlement)\b",
    re.IGNORECASE,
)


def _looks_non_company(desc: str | None) -> bool:
    if not desc:
        return False
    d = desc.strip()
    return bool(_NON_COMPANY_START.match(d) or _NON_COMPANY_WORD.search(d))

# Hosts the logo proxy is allowed to fetch from (prevents it being an open relay).
LOGO_HOSTS = {
    "commons.wikimedia.org", "upload.wikimedia.org",
    "icon.horse", "icons.duckduckgo.com",
    "cdn.brandfetch.io", "www.google.com",
}


# ── HTTP helpers ─────────────────────────────────────────────────

def _get(url: str) -> Any:
    """GET + parse JSON. Raises on network/parse errors (callers degrade to [])."""
    req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:  # noqa: S310 — fixed, trusted hosts
        return json.loads(resp.read().decode("utf-8"))


def _domain_from_url(url: str | None) -> str | None:
    if not url:
        return None
    host = urllib.parse.urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host or None


def _commons_logo(filename: str) -> str:
    """A resized raster of a Wikimedia Commons file (works for SVG logos too)."""
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{urllib.parse.quote(filename)}?width=128"


def _favicon(domain: str) -> str:
    return f"https://icon.horse/icon/{domain}"


# ── Wikidata provider ────────────────────────────────────────────

def _wd_first(claims: dict, pid: str) -> Any:
    for cl in claims.get(pid, []):
        dv = cl.get("mainsnak", {}).get("datavalue", {}).get("value")
        if dv is not None:
            return dv
    return None


def _wd_ids(claims: dict, pid: str) -> list[str]:
    out = []
    for cl in claims.get(pid, []):
        dv = cl.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(dv, dict) and "id" in dv:
            out.append(dv["id"])
    return out


def _wikidata_suggest(query: str, limit: int) -> list[CompanySuggestion]:
    api = "https://www.wikidata.org/w/api.php"
    search = _get(
        f"{api}?action=wbsearchentities&search={urllib.parse.quote(query)}"
        f"&language=en&uselang=en&format=json&type=item&limit={min(limit * 2, 20)}"
    )
    hits = search.get("search", [])
    ids = [h["id"] for h in hits]
    if not ids:
        return []
    ent = _get(
        f"{api}?action=wbgetentities&ids={'|'.join(ids)}"
        "&props=labels|descriptions|claims&languages=en&format=json"
    )
    entities = ent.get("entities", {})

    scored: list[tuple[int, CompanySuggestion]] = []
    for hit in hits:  # preserve Wikidata's relevance order within equal scores
        e = entities.get(hit["id"])
        if not e:
            continue
        claims = e.get("claims", {})
        website = _wd_first(claims, "P856")
        logo_file = _wd_first(claims, "P154")
        p31 = set(_wd_ids(claims, "P31"))
        is_org = bool(_ORG_CLASSES & p31)
        # Company-like signal: keeps ASELSAN/Google, drops "Asel (given name)" & species.
        if not (website or logo_file or is_org):
            continue
        domain = _domain_from_url(website) if isinstance(website, str) else None
        name = e.get("labels", {}).get("en", {}).get("value") or hit.get("label") or hit["id"]
        desc = e.get("descriptions", {}).get("en", {}).get("value")
        # Drop places/people/species that merely have a website (Wikidata descriptions
        # are consistent: "city in…", "municipality in…", "male given name", …). Class
        # QIDs vary too much (subclasses), so the description is the reliable signal.
        if _looks_non_company(desc) and not is_org:
            continue
        if logo_file:
            logo = _commons_logo(logo_file)
        elif domain:
            logo = _favicon(domain)
        else:
            logo = None
        score = (2 if website else 0) + (2 if logo_file else 0) + (3 if is_org else 0)
        scored.append((score, CompanySuggestion(name=name, domain=domain, description=desc, logo=logo)))

    scored.sort(key=lambda t: t[0], reverse=True)  # stable — keeps relevance within a score
    return [s for _, s in scored][:limit]


# ── Brandfetch provider ──────────────────────────────────────────

def _brandfetch_suggest(query: str, limit: int, client_id: str) -> list[CompanySuggestion]:
    url = f"https://api.brandfetch.io/v2/search/{urllib.parse.quote(query)}"
    if client_id:
        url += f"?c={urllib.parse.quote(client_id)}"
    data = _get(url)
    if not isinstance(data, list):
        return []
    out: list[CompanySuggestion] = []
    for item in data[:limit]:
        domain = item.get("domain")
        name = item.get("name") or domain
        if not name:
            continue
        logo = item.get("icon") or (_favicon(domain) if domain else None)
        out.append(CompanySuggestion(name=name, domain=domain, description=None, logo=logo))
    return out


# ── Public API ───────────────────────────────────────────────────

def suggest(query: str, limit: int = 8) -> list[CompanySuggestion]:
    """Return company suggestions for `query` using the provider set in settings.
    Never raises — returns [] on any provider/network error."""
    query = query.strip()
    if len(query) < 2:
        return []

    settings = queries.get_settings()
    provider = settings.get("company_search_provider") or "wikidata"
    cache_key = f"{provider}:{query.lower()}:{limit}"

    now = time.monotonic()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _CACHE_TTL:
        return [CompanySuggestion(**c) for c in cached[1]]

    try:
        if provider == "brandfetch":
            results = _brandfetch_suggest(query, limit, settings.get("brandfetch_client_id") or "")
        else:
            results = _wikidata_suggest(query, limit)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError):
        return []

    # store in cache (evict oldest if full)
    if len(_CACHE) >= _CACHE_MAX:
        oldest = min(_CACHE, key=lambda k: _CACHE[k][0])
        _CACHE.pop(oldest, None)
    _CACHE[cache_key] = (now, [r.model_dump() for r in results])
    return results


def fetch_logo(src: str) -> tuple[bytes, str]:
    """Fetch a logo image from an allowlisted host. Raises ValueError if the host
    isn't allowed, or a urllib error if the fetch fails."""
    host = urllib.parse.urlparse(src).netloc.lower()
    if host not in LOGO_HOSTS:
        raise ValueError(f"Logo host not allowed: {host!r}")
    req = urllib.request.Request(src, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:  # noqa: S310 — host allowlisted above
        content_type = resp.headers.get_content_type() or "image/png"
        return resp.read(), content_type
