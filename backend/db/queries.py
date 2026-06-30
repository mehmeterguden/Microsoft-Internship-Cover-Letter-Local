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
from typing import Any

from db.schema import get_connection

# Tables that the generic helpers below are allowed to touch.
_TABLES = frozenset({
    "profile", "links", "languages", "skills", "github_repos", "projects",
    "experiences", "education", "trainings", "certificates", "skill_links",
    "past_cover_letters", "documents",
})

# Columns stored as JSON text — (de)serialized transparently.
_JSON_COLUMNS: dict[str, set[str]] = {
    "profile": {"style_profile"},
    "github_repos": {"technologies"},
    "projects": {"technologies"},
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


# ── Settings (singleton — id always 1, seeded at init) ───────────

def get_settings() -> dict[str, Any]:
    """Return the settings row (without its id). Always exists after init_db."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
        data = dict(row)
        data.pop("id", None)
        return data
    finally:
        conn.close()


def save_settings(data: dict[str, Any]) -> None:
    """Update the single settings row in place."""
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
