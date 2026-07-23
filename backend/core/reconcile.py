"""Reconcile imported profile data against what's already saved — a merge plan.

An import (LinkedIn PDF/ZIP, or a CV) never blindly overwrites a filled profile.
Instead we compare the incoming `CVExtraction` against the current database and
produce a *plan* that classifies every piece of data:

  • fill      — an identity field the profile leaves blank → applied silently
  • same      — already present and identical (or trivially different) → skipped
  • new       — nothing like it exists yet → offered to add (pre-checked)
  • conflict  — a matching entry exists but differs → the user decides
                (keep existing vs use imported), one by one or in bulk

Matching is deterministic first (normalized natural keys + field comparison), so
the plan always works with no model. When a model is available we enrich it: fuzzy
matches the keys miss (e.g. a renamed role at the same company), demoting trivial
differences to "same", and a short note + recommendation on each real conflict.
"""

from __future__ import annotations

import json
from typing import Any

from core import llm
from core.cv_structuring import _extract_json
from models import CVExtraction

# ── Section config: how to match rows, and which fields make two rows "differ" ──
_MATCH_KEYS: dict[str, tuple[str, ...]] = {
    "experiences": ("company", "title"),
    "education": ("institution", "degree"),
    "links": ("url",),
}
_CONTENT_FIELDS: dict[str, tuple[str, ...]] = {
    "experiences": ("description", "start_date", "end_date", "location", "employment_type", "is_current"),
    "education": ("field", "start_date", "end_date", "location", "gpa", "is_current"),
    "projects": ("description", "role", "url", "start_date", "end_date", "technologies"),
    "certificates": ("issuer", "cert_type", "issue_date", "expiry_date", "credential_id", "url"),
    "languages": ("proficiency",),
    "trainings": ("provider", "description", "completion_date", "url"),
    "links": ("label", "description"),
    "skills": (),  # a skill is its name — a key match means "same"
}
_IDENTITY_FIELDS = ("name", "surname", "email", "phone", "github", "summary")


def _norm(value: Any) -> str:
    """Normalize a scalar/list for equality comparison (case/space/order-insensitive)."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else ""
    if isinstance(value, list):
        return "|".join(sorted(_norm(v) for v in value))
    return str(value).strip().lower()


def _match_key(section: str, row: dict) -> str:
    keys = _MATCH_KEYS.get(section, ("name",))
    return "|".join(_norm(row.get(k)) for k in keys)


def _differing_fields(section: str, existing: dict, incoming: dict) -> list[dict]:
    """Content fields where the two rows differ (for the conflict diff view)."""
    out = []
    for field in _CONTENT_FIELDS.get(section, ()):
        ev, iv = existing.get(field), incoming.get(field)
        if _norm(ev) != _norm(iv) and _norm(iv):  # only flag when the import actually says something
            out.append({"field": field, "existing": ev, "incoming": iv})
    return out


def _label(section: str, item: dict) -> str:
    if section == "experiences":
        return " — ".join(p for p in (item.get("company"), item.get("title")) if p)
    if section == "education":
        return " — ".join(p for p in (item.get("institution"), item.get("degree")) if p)
    if section == "links":
        return item.get("label") or item.get("url") or "Link"
    return item.get("name") or "Item"


# ── Deterministic plan ──────────────────────────────────────────────

def _identity_entries(incoming_profile: dict, existing_profile: dict, profile_url: str | None) -> list[dict]:
    entries: list[dict] = []
    fields = list(_IDENTITY_FIELDS)
    incoming = dict(incoming_profile)
    if profile_url and profile_url.strip():
        incoming["linkedin"] = profile_url.strip()
        fields.append("linkedin")
    for field in fields:
        iv = incoming.get(field)
        if iv in (None, "", []):
            continue
        ev = existing_profile.get(field)
        if not ev:
            kind = "fill"
        elif _norm(ev) == _norm(iv):
            kind = "same"
        else:
            kind = "conflict"
        entries.append({
            "id": f"profile:{field}",
            "section": "profile",
            "field": field,
            "label": field.replace("_", " ").title(),
            "kind": kind,
            "incoming": iv,
            "existing": ev,
            "existing_id": None,
            "note": None,
            "recommend": None,
            "diff": None,
        })
    return entries


def _section_entries(section: str, incoming_items: list[dict], existing_rows: list[dict]) -> list[dict]:
    existing_by_key: dict[str, dict] = {}
    for row in existing_rows:
        existing_by_key.setdefault(_match_key(section, row), row)
    entries: list[dict] = []
    for index, item in enumerate(incoming_items):
        key = _match_key(section, item)
        if not key.strip("|"):
            continue
        match = existing_by_key.get(key)
        if match is None:
            kind, existing_id, diff = "new", None, None
        else:
            diff = _differing_fields(section, match, item)
            kind = "conflict" if diff else "same"
            existing_id = match.get("id")
        entries.append({
            "id": f"{section}:{index}",
            "section": section,
            "field": None,
            "label": _label(section, item),
            "kind": kind,
            "incoming": item,
            "existing": match,
            "existing_id": existing_id,
            "note": None,
            "recommend": None,
            "diff": diff,
        })
    return entries


# ── AI enrichment (optional; never raises) ──────────────────────────

def _enrich(entries: list[dict], existing_by_section: dict[str, list[dict]]) -> bool:
    """Ask the model to refine the plan. Returns True if enrichment was applied.

    The model may: mark a conflict's difference as trivial (→ demote to "same"),
    add a note + recommendation to real conflicts, and fuzzy-match a "new" item to
    an existing row the natural key missed (→ promote it to a conflict).
    """
    conflicts = [e for e in entries if e["kind"] == "conflict"]
    news = [e for e in entries if e["kind"] == "new"]
    if not conflicts and not news:
        return False

    payload = {
        "conflicts": [
            {"id": e["id"], "label": e["label"], "existing": e["existing"], "incoming": e["incoming"]}
            for e in conflicts
        ],
        "new_items": [{"id": e["id"], "section": e["section"], "incoming": e["incoming"]} for e in news],
        "existing_by_section": {
            section: [{"id": r.get("id"), **{k: r.get(k) for k in ("name", "company", "title", "institution", "degree")}}
                      for r in rows]
            for section, rows in existing_by_section.items() if rows
        },
    }
    system = (
        "You reconcile a person's existing profile with newly imported data. "
        "For each CONFLICT decide if the difference is trivial (formatting, casing, "
        "abbreviation, same meaning) or significant. For NEW_ITEMS, find if any is "
        "really the same entity as an existing row (a renamed role at the same "
        "company, an abbreviation like 'AI' vs 'Artificial Intelligence'). "
        "Reply with ONLY JSON: {\"conflicts\":[{\"id\":str,\"trivial\":bool,"
        "\"recommend\":\"imported\"|\"existing\",\"note\":str}],"
        "\"matches\":[{\"new_id\":str,\"existing_id\":int,\"note\":str}]}. "
        "Keep notes under 12 words."
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]
    try:
        raw = llm.complete(messages, temperature=0.0, max_tokens=1500)
        data = json.loads(_extract_json(raw))
    except Exception:  # noqa: BLE001 — model busy / bad JSON: keep the deterministic plan
        return False

    by_id = {e["id"]: e for e in entries}
    for verdict in data.get("conflicts", []) if isinstance(data, dict) else []:
        entry = by_id.get(verdict.get("id"))
        if not entry or entry["kind"] != "conflict":
            continue
        if verdict.get("trivial") is True:
            entry["kind"] = "same"
        else:
            entry["note"] = (verdict.get("note") or "").strip() or None
            entry["recommend"] = verdict.get("recommend") if verdict.get("recommend") in ("imported", "existing") else None

    # Fuzzy matches: promote a "new" entry to a conflict against an existing row.
    existing_index = {r.get("id"): (section, r) for section, rows in existing_by_section.items() for r in rows}
    for match in data.get("matches", []) if isinstance(data, dict) else []:
        entry = by_id.get(match.get("new_id"))
        found = existing_index.get(match.get("existing_id"))
        if not entry or entry["kind"] != "new" or not found:
            continue
        section, row = found
        if section != entry["section"]:
            continue
        entry["kind"] = "conflict"
        entry["existing"] = row
        entry["existing_id"] = row.get("id")
        entry["diff"] = _differing_fields(section, row, entry["incoming"]) or [
            {"field": "entry", "existing": _label(section, row), "incoming": _label(section, entry["incoming"])}
        ]
        entry["note"] = (match.get("note") or "").strip() or None
        entry["recommend"] = "imported"
    return True


# ── Public API ──────────────────────────────────────────────────────

def build_plan(
    incoming: CVExtraction,
    existing_profile: dict,
    existing_by_section: dict[str, list[dict]],
    *,
    profile_url: str | None = None,
    use_ai: bool = True,
) -> dict:
    """Compare `incoming` against the current profile/DB rows → a reconcile plan."""
    sections = ("skills", "experiences", "education", "projects", "certificates", "trainings", "languages", "links")
    incoming_map = {s: [it.model_dump(mode="json", exclude={"id"}) for it in getattr(incoming, s)] for s in sections}

    entries = _identity_entries(incoming.profile.model_dump(mode="json"), existing_profile, profile_url)
    section_entries: dict[str, list[dict]] = {}
    for section in sections:
        section_entries[section] = _section_entries(section, incoming_map[section], existing_by_section.get(section, []))

    all_entries = entries + [e for lst in section_entries.values() for e in lst]
    ai_used = _enrich(all_entries, existing_by_section) if use_ai else False

    counts = {"fill": 0, "same": 0, "new": 0, "conflict": 0}
    for e in all_entries:
        counts[e["kind"]] = counts.get(e["kind"], 0) + 1

    return {
        "ai": ai_used,
        "profile": [e for e in entries],
        "sections": {s: section_entries[s] for s in sections if section_entries[s]},
        "counts": counts,
    }