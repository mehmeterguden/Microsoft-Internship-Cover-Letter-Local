"""FastAPI application entry point for Cover Letter Local.

Boots the local, single-user backend: configures CORS and, on startup, creates
the SQLite tables (seeding settings) and ChromaDB collections (both idempotent).
Runtime config lives in the DB `settings` table, not the environment.

Run from the backend/ directory:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

import config
from api import api_router
from core.vector_store import init_collections
from db.schema import init_db

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: ensure local storage exists. Shutdown: nothing to clean up."""
    init_db()             # create SQLite tables + seed settings if missing
    init_collections()    # create ChromaDB collections if missing
    yield


app = FastAPI(title="Cover Letter Local", version="0.1.0", lifespan=lifespan)

# Frontend runs on a different port — CORS is mandatory.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    """Serve the CV import demo (same origin as the API)."""
    return FileResponse(STATIC_DIR / "cv_demo.html")


@app.get("/settings", include_in_schema=False)
def settings_page() -> FileResponse:
    """Serve the settings page (pick provider/model/keys)."""
    return FileResponse(STATIC_DIR / "settings.html")


@app.get("/github", include_in_schema=False)
def github_page() -> FileResponse:
    """Serve the GitHub import demo."""
    return FileResponse(STATIC_DIR / "github_demo.html")


@app.get("/dev", include_in_schema=False)
def dev_page() -> FileResponse:
    """Serve the raw text-extraction dev page."""
    return FileResponse(STATIC_DIR / "cv_upload.html")


@app.get("/design", include_in_schema=False)
def design_page() -> FileResponse:
    """Serve the design-system style tile (light + dark preview)."""
    return FileResponse(STATIC_DIR / "design.html")


@app.get("/research", include_in_schema=False)
def research_page() -> FileResponse:
    """Serve the live company-intelligence report (streaming)."""
    return FileResponse(STATIC_DIR / "research.html")


@app.get("/research-tools", include_in_schema=False)
def research_tools_page() -> FileResponse:
    """Serve the raw Phase 1 tools dev demo."""
    return FileResponse(STATIC_DIR / "research_demo.html")


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check."""
    return {"status": "ok"}


# Onboarding data endpoints (profile, skills, projects, experience, …).
app.include_router(api_router)
