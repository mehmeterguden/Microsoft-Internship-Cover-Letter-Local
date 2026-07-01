"""Structured company facts from Wikidata — free, keyless, no scraping.

Resolves the company to a Wikidata entity, then reads a few well-known properties:
inception (P571), headquarters (P159), employee count (P1128), industry (P452),
and official website (P856). Item-valued properties (HQ, industry) are second
Wikidata IDs, so we resolve their English labels in one extra batch call.

Returns the fields of `schema.Firmographics` as a dict. Any property we can't find
is simply omitted — partial data is fine.
"""

from __future__ import annotations

from typing import Any

from core.research import outbound_guard
from core.research.tools.registry import ToolResult

TOOL = "firmographics"
_API = "https://www.wikidata.org/w/api.php"

# Wikidata property IDs we care about.
_P_INCEPTION = "P571"
_P_HQ = "P159"
_P_EMPLOYEES = "P1128"
_P_INDUSTRY = "P452"
_P_WEBSITE = "P856"


def lookup(company_name: str) -> ToolResult:
    """Return `{industry, size, employees, hq, founded, website}` for a company."""
    entity_id = _search_entity(company_name)
    if not entity_id:
        return ToolResult.fail(TOOL, "Wikidata", f"No Wikidata entity for {company_name!r}.")

    entity = _get_entities([entity_id])[entity_id]
    claims = entity.get("claims", {})

    founded = _time_year(_first_value(claims, _P_INCEPTION))
    website = _first_value(claims, _P_WEBSITE)
    employees = _quantity(_first_value(claims, _P_EMPLOYEES))
    hq_id = _first_item_id(claims, _P_HQ)
    industry_id = _first_item_id(claims, _P_INDUSTRY)

    # Resolve the two item-valued properties' labels in one call.
    labels = _get_labels([i for i in (hq_id, industry_id) if i])

    data: dict[str, Any] = {
        "founded": founded,
        "website": website,
        "employees": employees,
        "size": f"{employees:,} employees" if employees else None,
        "hq": labels.get(hq_id) if hq_id else None,
        "industry": labels.get(industry_id) if industry_id else None,
        "wikidata_id": entity_id,
    }
    return ToolResult(
        tool=TOOL,
        source=f"https://www.wikidata.org/wiki/{entity_id}",
        data={k: v for k, v in data.items() if v is not None},
    )


# ── Wikidata API calls (all keyless GETs, guarded) ──

def _search_entity(name: str) -> str | None:
    data = outbound_guard.get_json(
        _API,
        params={
            "action": "wbsearchentities", "search": name, "language": "en",
            "type": "item", "limit": 1, "format": "json",
        },
    )
    hits = data.get("search", [])
    return hits[0]["id"] if hits else None


def _get_entities(ids: list[str]) -> dict[str, Any]:
    data = outbound_guard.get_json(
        _API,
        params={
            "action": "wbgetentities", "ids": "|".join(ids),
            "props": "claims", "format": "json",
        },
    )
    return data.get("entities", {})


def _get_labels(ids: list[str]) -> dict[str, str]:
    if not ids:
        return {}
    data = outbound_guard.get_json(
        _API,
        params={
            "action": "wbgetentities", "ids": "|".join(ids),
            "props": "labels", "languages": "en", "format": "json",
        },
    )
    out: dict[str, str] = {}
    for entity_id, entity in data.get("entities", {}).items():
        label = entity.get("labels", {}).get("en", {}).get("value")
        if label:
            out[entity_id] = label
    return out


# ── Claim value extractors (Wikidata's nested snak format) ──

def _first_value(claims: dict, prop: str) -> Any:
    """Return the raw datavalue of a property's first claim, or None."""
    for claim in claims.get(prop, []):
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
        if value is not None:
            return value
    return None


def _first_item_id(claims: dict, prop: str) -> str | None:
    value = _first_value(claims, prop)
    if isinstance(value, dict) and "id" in value:
        return value["id"]
    return None


def _time_year(value: Any) -> str | None:
    """Wikidata times look like '+1975-04-04T00:00:00Z' — pull the year."""
    if isinstance(value, dict) and isinstance(value.get("time"), str):
        return value["time"].lstrip("+")[:4]
    return None


def _quantity(value: Any) -> int | None:
    if isinstance(value, dict) and value.get("amount"):
        try:
            return int(float(value["amount"].lstrip("+")))
        except ValueError:
            return None
    return None
