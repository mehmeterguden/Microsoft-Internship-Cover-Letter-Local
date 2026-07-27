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
    "past_cover_letters", "documents", "jobs", "interview_sessions",
})

# Columns stored as JSON text — (de)serialized transparently.
_JSON_COLUMNS: dict[str, set[str]] = {
    "profile": {"style_profile", "field_sources"},
    "github_repos": {"technologies", "highlights"},
    "projects": {"technologies"},
    "education": {"courses"},
    "jobs": {"match_breakdown", "company_research", "letter"},
    "interview_sessions": {"questions", "answers", "applied_updates"},
}

# Tables whose rows carry server-managed created_at / updated_at timestamps.
_TIMESTAMPED: frozenset[str] = frozenset({"jobs"})


def _now_iso() -> str:
    """Current UTC time as a second-precision ISO8601 string."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

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
    if table in _TIMESTAMPED:
        now = _now_iso()
        data = {**data, "created_at": now, "updated_at": now}
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
    if table in _TIMESTAMPED:
        prior = get_by_id(table, row_id)
        created = (prior or {}).get("created_at") or _now_iso()
        data = {**data, "created_at": created, "updated_at": _now_iso()}
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
_SETTINGS_JSON_COLUMNS = ("gemini_api_keys", "azure_accounts")


def get_settings() -> dict[str, Any]:
    """Return the settings row (without its id). Always exists after init_db.

    JSON columns (e.g. the Gemini key pool, Azure accounts) are parsed back to Python lists."""
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
    conn = get_connection()
    try:
        cursor = conn.execute("PRAGMA table_info(settings)")
        valid_cols = {row["name"] for row in cursor.fetchall()}
        cols = [c for c in data.keys() if c in valid_cols]
        if not cols:
            return
        assignments = ", ".join(f"{c} = ?" for c in cols)
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


# ── Azure AI Foundry / Azure OpenAI Accounts Pool ─────────────────────

def azure_account_config() -> dict[str, Any]:
    """Return the current pool: {"accounts": [...], "active_id": str}."""
    s = get_settings()
    return {
        "accounts": s.get("azure_accounts") or [],
        "active_id": s.get("azure_active_account_id") or "",
    }


def add_azure_account(
    endpoint: str,
    api_key: str,
    model: str,
    label: str = "",
    api_version: str = "2024-10-21",
) -> dict[str, Any]:
    """Add an Azure AI Foundry / Azure OpenAI account to the pool and persist."""
    s = get_settings()
    accounts = list(s.get("azure_accounts") or [])
    endpoint = endpoint.strip()
    api_key = api_key.strip()
    model = model.strip()

    if endpoint and api_key and model:
        new_id = uuid.uuid4().hex[:12]
        new_acc = {
            "id": new_id,
            "label": label.strip() or f"Account {len(accounts) + 1}",
            "endpoint": endpoint,
            "api_key": api_key,
            "model": model,
            "api_version": api_version.strip() or "2024-10-21",
        }
        accounts.append(new_acc)
        patch: dict[str, Any] = {
            "azure_accounts": accounts,
            "azure_openai_endpoint": endpoint,
            "azure_openai_api_key": api_key,
            "llm_model": model,
            "azure_openai_api_version": new_acc["api_version"],
        }
        if not (s.get("azure_active_account_id") or ""):
            patch["azure_active_account_id"] = new_id
        save_settings(patch)
    return azure_account_config()


def remove_azure_account(account_id: str) -> dict[str, Any]:
    """Remove an Azure account from the pool and persist."""
    s = get_settings()
    accounts = [a for a in (s.get("azure_accounts") or []) if a["id"] != account_id]
    patch: dict[str, Any] = {"azure_accounts": accounts}
    if (s.get("azure_active_account_id") or "") == account_id:
        new_active = accounts[0] if accounts else None
        patch["azure_active_account_id"] = new_active["id"] if new_active else ""
        if new_active:
            patch["azure_openai_endpoint"] = new_active["endpoint"]
            patch["azure_openai_api_key"] = new_active["api_key"]
            patch["llm_model"] = new_active["model"]
            patch["azure_openai_api_version"] = new_active.get("api_version", "2024-10-21")
    save_settings(patch)
    return azure_account_config()


def set_azure_active_account(account_id: str) -> dict[str, Any]:
    """Set the active Azure account in the pool."""
    s = get_settings()
    accounts = s.get("azure_accounts") or []
    target = next((a for a in accounts if a["id"] == account_id), None)
    if target:
        save_settings({
            "azure_active_account_id": account_id,
            "azure_openai_endpoint": target["endpoint"],
            "azure_openai_api_key": target["api_key"],
            "llm_model": target["model"],
            "azure_openai_api_version": target.get("api_version", "2024-10-21"),
        })
    return azure_account_config()


def update_azure_account(
    account_id: str,
    endpoint: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
    label: str | None = None,
    api_version: str | None = None,
) -> dict[str, Any]:
    """Update an existing Azure account's fields in place."""
    s = get_settings()
    accounts = list(s.get("azure_accounts") or [])
    updated = False
    for acc in accounts:
        if acc["id"] == account_id:
            if label is not None:
                acc["label"] = label.strip()
            if endpoint is not None:
                acc["endpoint"] = endpoint.strip()
            if api_key is not None:
                acc["api_key"] = api_key.strip()
            if model is not None:
                acc["model"] = model.strip()
            if api_version is not None:
                acc["api_version"] = api_version.strip() or "2024-10-21"
            updated = True
            break
    if updated:
        patch: dict[str, Any] = {"azure_accounts": accounts}
        if s.get("azure_active_account_id") == account_id:
            active_acc = next((a for a in accounts if a["id"] == account_id), None)
            if active_acc:
                patch["azure_openai_endpoint"] = active_acc["endpoint"]
                patch["azure_openai_api_key"] = active_acc["api_key"]
                patch["llm_model"] = active_acc["model"]
                patch["azure_openai_api_version"] = active_acc.get("api_version", "2024-10-21")
        save_settings(patch)
    return azure_account_config()


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


_RETENTION_DAYS = {"7_days": 7, "30_days": 30}


def save_research(
    cache_key: str, company_name: str, role_title: str | None, report: dict[str, Any]
) -> None:
    """Store (or replace) a research report, honoring the user's retention setting:
    off (don't cache), 7_days / 30_days (TTL), forever, or last_10 (keep newest 10)."""
    retention = get_settings().get("research_cache_retention", "7_days")
    if retention == "off":
        return
    now = datetime.now(timezone.utc)
    days = _RETENTION_DAYS.get(retention, 3650)  # forever / last_10 → far-future expiry
    expires = now + timedelta(days=days)
    conn = get_connection()
    try:
        conn.execute(
            """INSERT OR REPLACE INTO company_research_cache
                   (cache_key, company_name, role_title, report, created_at, expires_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (cache_key, company_name, role_title, json.dumps(report), now.isoformat(), expires.isoformat()),
        )
        if retention == "last_10":
            conn.execute(
                """DELETE FROM company_research_cache WHERE cache_key NOT IN (
                       SELECT cache_key FROM company_research_cache
                       ORDER BY created_at DESC LIMIT 10)"""
            )
        conn.commit()
    finally:
        conn.close()


# ── LLM usage log (metering) ─────────────────────────────────────
# One row per metered complete/stream call. Written by core/llm_metrics.record;
# read by GET /api/llm/usage. Self-contained (not via the generic CRUD allowlist).

_LLM_RUN_COLUMNS = (
    "created_at", "provider", "model", "prompt_tokens", "completion_tokens",
    "total_tokens", "latency_ms", "cost_usd", "kind",
)


def record_llm_run(row: dict[str, Any]) -> None:
    """Insert one usage row. Best-effort — callers must not let metering break a call."""
    conn = get_connection()
    try:
        placeholders = ", ".join("?" for _ in _LLM_RUN_COLUMNS)
        conn.execute(
            f"INSERT INTO llm_runs ({', '.join(_LLM_RUN_COLUMNS)}) VALUES ({placeholders})",
            tuple(row.get(c) for c in _LLM_RUN_COLUMNS),
        )
        conn.commit()
    finally:
        conn.close()


def recent_llm_runs(limit: int = 20) -> list[dict[str, Any]]:
    """The most recent usage rows, newest first."""
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM llm_runs ORDER BY id DESC LIMIT ?", (max(1, int(limit)),)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def llm_usage_today() -> dict[str, Any]:
    """Aggregate calls / tokens / estimated cost since the start of today (UTC)."""
    start = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00")
    conn = get_connection()
    try:
        r = conn.execute(
            "SELECT COUNT(*) AS calls, COALESCE(SUM(total_tokens), 0) AS tokens, "
            "COALESCE(SUM(cost_usd), 0) AS cost_usd FROM llm_runs WHERE created_at >= ?",
            (start,),
        ).fetchone()
        return {"calls": r["calls"], "tokens": r["tokens"], "cost_usd": round(r["cost_usd"], 6)}
    finally:
        conn.close()
