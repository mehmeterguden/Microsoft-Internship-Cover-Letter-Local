"""Bootstrap configuration — fixed local infrastructure only.

This holds the few values needed *before* the database exists: where local data
lives and which frontend origin may call the API. They can be overridden by an
environment variable (handy for tests), but the app ships no `.env` and requires
none — the defaults below are correct for local single-user use.

Everything a user might want to change — the LLM endpoint, the model, API tokens —
is NOT here. It lives in the DB `settings` table so it can be edited from the
frontend at runtime. The constants prefixed `DEFAULT_` below are only the seed
values written into that table the first time the database is created.
"""

from __future__ import annotations

import os
from pathlib import Path

# ── Local storage (cannot live in the DB — they say where the DB is) ──
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
DATABASE_PATH = os.getenv("DATABASE_PATH", str(DATA_DIR / "cover_letter_local.db"))
CHROMA_PATH = os.getenv("CHROMA_PATH", str(DATA_DIR / "chroma"))

# ── CORS — the frontend dev server origin allowed to call the API ──
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

# ── Seed defaults for the `settings` table (the choices WE make by default) ──
# Microsoft Foundry Local, OpenAI-compatible endpoint.
DEFAULT_LLM_BASE_URL = "http://localhost:5273/v1"
DEFAULT_LLM_MODEL = "phi-4-mini"
DEFAULT_LLM_API_KEY = ""  # Foundry Local needs none; kept for OpenAI-compatible servers that do
DEFAULT_EMBEDDING_MODEL = "all-MiniLM-L6-v2"
DEFAULT_TAVILY_API_KEY = ""
