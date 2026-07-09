"""SQLite data-access layer (CRUD).

Thin functions over the standard-library `sqlite3` connection from `schema.py` —
no ORM. Routers convert between Pydantic models and the plain dicts handled here.

Two storage quirks are hidden from callers:
  • JSON columns (e.g. `technologies`, `style_profile`) are stored as TEXT. They are
    serialized on write and parsed back to Python lists/dicts on read.
  • Boolean columns are stored as 0/1 integers and exposed as real `bool`.

Table names passed in come only from our own router code (never from a request),
and every one is checked against `_TABLES`, so the f-string SQL below cannot be
injected from outside.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from db.schema import get_connection

# Tables that the generic helpers below are allowed to touch.
_TABLES = frozenset({
    "profile", "links", "languages", "skills", "github_repos", "projects",
    "experiences", "education", "trainings", "certificates", "skill_links",
    "past_cover_letters", "documents", "jobs",
})

# Columns stored as JSON text — (de)serialized transparently.
_JSON_COLUMNS: dict[str, set[str]] = {
    "profile": {"style_profile", "field_sources"},
    "github_repos": {"technologies", "highlights"},
    "projects": {"technologies"},
    "jobs": {"match_breakdown", "company_research", "letter"},
}

# Columns stored as 0/1 integers — exposed to callers as bool.
_BOOL_COLUMNS: dict[str, set[str]] = {
    "skills": {"cv_mentioned"},
    "experiences": {"is_current"},
    "education": {"is_current"},
}


def _check(table: str) -> None:
    if table not in _TABLES:
        raise ValueError(f"Unknown table: {table!r}")


def _encode(table: str, data: dict[str, Any]) -> dict[str, Any]:
    """Python dict (JSON-mode model_dump) → row ready for sqlite binding."""
    out = dict(data)
    for col in _JSON_COLUMNS.get(table, ()):
        if out.get(col) is not None:
            out[col] = json.dumps(out[col])
    for col in _BOOL_COLUMNS.get(table, ()):
        if out.get(col) is not None:
            out[col] = int(bool(out[col]))
    return out


def _decode(table: str, row: sqlite3.Row | None) -> dict[str, Any] | None:
    """sqlite row → plain dict with JSON columns parsed and bools restored."""
    if row is None:
        return None
    out = dict(row)
    for col in _JSON_COLUMNS.get(table, ()):
        if out.get(col) is not None:
            out[col] = json.loads(out[col])
    for col in _BOOL_COLUMNS.get(table, ()):
        if out.get(col) is not None:
            out[col] = bool(out[col])
    return out


# ── Generic CRUD for id-keyed list tables ────────────────────────

def list_all(table: str, order_by: str = "id") -> list[dict[str, Any]]:
    """Return every row, oldest first."""
    _check(table)
    conn = get_connection()
    try:
        rows = conn.execute(f"SELECT * FROM {table} ORDER BY {order_by}").fetchall()
        return [_decode(table, r) for r in rows]  # type: ignore[misc]
    finally:
        conn.close()


def get_by_id(table: str, row_id: int) -> dict[str, Any] | None:
    """Return one row by id, or None if it does not exist."""
    _check(table)
    conn = get_connection()
    try:
        row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (row_id,)).fetchone()
        return _decode(table, row)
    finally:
        conn.close()


def insert(table: str, data: dict[str, Any]) -> int:
    """Insert a row and return its new id."""
    _check(table)
    data = _encode(table, data)
    cols = list(data.keys())
    columns = ", ".join(cols)
    placeholders = ", ".join("?" for _ in cols)
    conn = get_connection()
    try:
        cur = conn.execute(
            f"INSERT INTO {table} ({columns}) VALUES ({placeholders})",
            tuple(data[c] for c in cols),
        )
        conn.commit()
        return cur.lastrowid  # type: ignore[return-value]
    finally:
        conn.close()


def update(table: str, row_id: int, data: dict[str, Any]) -> bool:
    """Full-replace a row's columns. Returns False if the id does not exist."""
    _check(table)
    data = _encode(table, data)
    cols = list(data.keys())
    assignments = ", ".join(f"{c} = ?" for c in cols)
    conn = get_connection()
    try:
        cur = conn.execute(
            f"UPDATE {table} SET {assignments} WHERE id = ?",
            (*(data[c] for c in cols), row_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete(table: str, row_id: int) -> bool:
    """Delete a row by id. Returns False if it did not exist."""
    _check(table)
    conn = get_connection()
    try:
        cur = conn.execute(f"DELETE FROM {table} WHERE id = ?", (row_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def clear(table: str) -> int:
    """Delete every row in a table. Returns how many were removed."""
    _check(table)
    conn = get_connection()
    try:
        cur = conn.execute(f"DELETE FROM {table}")
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def clear_except_github(table: str) -> int:
    """Delete every row NOT imported from GitHub. Used by the CV full-refresh so
    re-importing a CV never wipes the user's imported GitHub work. Rows with a
    NULL/legacy source count as non-GitHub. Returns how many were removed."""
    _check(table)
    conn = get_connection()
    try:
        cur = conn.execute(f"DELETE FROM {table} WHERE source IS NULL OR source != 'github'")
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


# Every user-data table, ordered so child rows go before their parents (FKs).
_RESET_TABLES = (
    "skill_links", "cover_letters", "jobs", "past_cover_letters", "documents",
    "projects", "experiences", "education", "trainings", "certificates",
    "languages", "links", "github_repos", "skills", "company_research_cache",
    "profile",
)


def reset_all() -> dict[str, int]:
    """Wipe ALL user data (everything except the settings row). Irreversible.
    Returns how many rows were removed per table."""
    conn = get_connection()
    removed: dict[str, int] = {}
    try:
        for table in _RESET_TABLES:
            cur = conn.execute(f"DELETE FROM {table}")
            removed[table] = cur.rowcount
        conn.commit()
    finally:
        conn.close()
    return removed


# ── Settings (singleton — id always 1, seeded at init) ───────────

# Settings columns stored as JSON text that we (de)serialize transparently.
# (`mcp_servers` is intentionally NOT here — its one reader parses the raw string
# itself, so decoding it early would break that call.)
_SETTINGS_JSON_COLUMNS = ("gemini_api_keys",)


def get_settings() -> dict[str, Any]:
    """Return the settings row (without its id). Always exists after init_db.

    JSON columns (e.g. the Gemini key pool) are parsed back to Python lists."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
        data = dict(row)
        data.pop("id", None)
        for col in _SETTINGS_JSON_COLUMNS:
            if isinstance(data.get(col), str):
                data[col] = json.loads(data[col] or "[]")
        return data
    finally:
        conn.close()


def save_settings(data: dict[str, Any]) -> None:
    """Update the single settings row in place. Only the given columns change.

    List/JSON columns are serialized to TEXT before writing."""
    data = dict(data)
    for col in _SETTINGS_JSON_COLUMNS:
        if col in data and not isinstance(data[col], str):
            data[col] = json.dumps(data[col])
    cols = list(data.keys())
    assignments = ", ".join(f"{c} = ?" for c in cols)
    conn = get_connection()
    try:
        conn.execute(
            f"UPDATE settings SET {assignments} WHERE id = 1",
            tuple(data[c] for c in cols),
        )
        conn.commit()
    finally:
        conn.close()


# ── Gemini key pool (add / remove / select / mode) ───────────────
# The frontend edits these one action at a time so each change persists to the DB
# immediately (survives a page reload) — independent of the main "Save settings".

def gemini_key_config() -> dict[str, Any]:
    """Return the current pool: {"keys": [...], "active_id": str, "mode": str}."""
    s = get_settings()
    return {
        "keys": s.get("gemini_api_keys") or [],
        "active_id": s.get("gemini_active_key_id") or "",
        "mode": s.get("key_switch_mode") or "auto",
    }


def add_gemini_key(key: str, label: str = "") -> dict[str, Any]:
    """Add a key to the pool and persist. The first key added becomes active.
    Ignores exact-duplicate keys (returns the pool unchanged)."""
    s = get_settings()
    keys = list(s.get("gemini_api_keys") or [])
    key = key.strip()
    if key and not any(k["key"] == key for k in keys):
        new_id = uuid.uuid4().hex[:12]
        keys.append({"id": new_id, "key": key, "label": label.strip() or f"Key {len(keys) + 1}"})
        patch: dict[str, Any] = {"gemini_api_keys": keys}
        if not (s.get("gemini_active_key_id") or ""):
            patch["gemini_active_key_id"] = new_id
        save_settings(patch)
    return gemini_key_config()


def remove_gemini_key(key_id: str) -> dict[str, Any]:
    """Remove a key from the pool and persist. If it was the active key, the
    active pointer moves to the first remaining key."""
    s = get_settings()
    keys = [k for k in (s.get("gemini_api_keys") or []) if k["id"] != key_id]
    patch: dict[str, Any] = {"gemini_api_keys": keys}
    if (s.get("gemini_active_key_id") or "") == key_id:
        patch["gemini_active_key_id"] = keys[0]["id"] if keys else ""
    save_settings(patch)
    return gemini_key_config()


def set_gemini_active_key(key_id: str) -> dict[str, Any]:
    """Point the active/selected key at `key_id` (used by manual selection and by
    auto-rotation to remember the working key). No-op if the id isn't in the pool."""
    s = get_settings()
    if any(k["id"] == key_id for k in (s.get("gemini_api_keys") or [])):
        save_settings({"gemini_active_key_id": key_id})
    return gemini_key_config()


def set_key_switch_mode(mode: str) -> dict[str, Any]:
    """Set how the app reacts when a key hits its limit: 'auto' or 'manual'."""
    save_settings({"key_switch_mode": "manual" if mode == "manual" else "auto"})
    return gemini_key_config()


# ── Profile (singleton — exactly one row, no id) ─────────────────

def get_profile() -> dict[str, Any] | None:
    """Return the single profile row, or None if it has never been saved."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM profile LIMIT 1").fetchone()
        return _decode("profile", row)
    finally:
        conn.close()


def save_profile(data: dict[str, Any]) -> None:
    """Replace the single profile row (clear-then-insert, in one transaction)."""
    data = _encode("profile", data)
    cols = list(data.keys())
    columns = ", ".join(cols)
    placeholders = ", ".join("?" for _ in cols)
    conn = get_connection()
    try:
        conn.execute("DELETE FROM profile")
        conn.execute(
            f"INSERT INTO profile ({columns}) VALUES ({placeholders})",
            tuple(data[c] for c in cols),
        )
        conn.commit()
    finally:
        conn.close()


# ── Skill ↔ evidence links ───────────────────────────────────────

def list_skill_links(skill_id: int | None = None) -> list[dict[str, Any]]:
    """Return all skill links, optionally filtered to one skill."""
    conn = get_connection()
    try:
        if skill_id is None:
            rows = conn.execute("SELECT * FROM skill_links ORDER BY id").fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM skill_links WHERE skill_id = ? ORDER BY id", (skill_id,)
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ── Company research cache ───────────────────────────────────────

def get_research(cache_key: str) -> dict[str, Any] | None:
    """Return a cached research row if present and not expired, else None."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM company_research_cache WHERE cache_key = ?", (cache_key,)
        ).fetchone()
        if row is None:
            return None
        data = dict(row)
        if data["expires_at"] <= datetime.now(timezone.utc).isoformat():
            return None  # stale — treat as a miss (a refresh overwrites it)
        data["report"] = json.loads(data["report"])
        return data
    finally:
        conn.close()


def save_research(
    cache_key: str, company_name: str, role_title: str | None, report: dict[str, Any], ttl_days: int = 7
) -> None:
    """Store (or replace) a research report under its key with a TTL."""
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=ttl_days)
    conn = get_connection()
    try:
        conn.execute(
            """INSERT OR REPLACE INTO company_research_cache
                   (cache_key, company_name, role_title, report, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (cache_key, company_name, role_title, json.dumps(report), now.isoformat(), expires.isoformat()),
        )
        conn.commit()
    finally:
        conn.close()
