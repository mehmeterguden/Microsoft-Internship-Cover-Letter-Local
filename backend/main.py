"""FastAPI application entry point for Cover Letter Local.

Boots the local, single-user backend: configures CORS and, on startup, creates
the SQLite tables and ChromaDB collections (both idempotent). No business logic
yet — feature routers are added in later phases.

Run from the backend/ directory:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env before importing modules that read storage paths at import time.
load_dotenv()

from api import api_router  # noqa: E402
from core.vector_store import init_collections  # noqa: E402
from db.schema import init_db  # noqa: E402

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: ensure local storage exists. Shutdown: nothing to clean up."""
    init_db()             # create SQLite tables if missing
    init_collections()    # create ChromaDB collections if missing
    yield


app = FastAPI(title="Cover Letter Local", version="0.1.0", lifespan=lifespan)

# Frontend runs on a different port — CORS is mandatory.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check."""
    return {"status": "ok"}


# Onboarding data endpoints (profile, skills, projects, experience, …).
app.include_router(api_router)
