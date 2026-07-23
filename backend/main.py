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

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

import config
from api import api_router
from core import errors
from core.vector_store import init_collections
from db.schema import init_db

STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: ensure local storage exists. Shutdown: nothing to clean up."""
    init_db()             # create SQLite tables + seed settings if missing
    init_collections()    # create ChromaDB collections if missing
    _load_mcp_tools()     # register any configured MCP servers' tools (no-op if none)
    yield


def _load_mcp_tools() -> None:
    """Register tools from configured MCP servers; never let a bad server block boot."""
    try:
        from core.research.tools import registry
        from core.research.tools.mcp import register_mcp_tools

        register_mcp_tools(registry)
    except Exception:  # noqa: BLE001 — MCP is optional; boot must not depend on it
        pass


app = FastAPI(title="Cover Letter Local", version="0.1.0", lifespan=lifespan)


class ClassifyErrorsMiddleware:
    """Catch any exception that escapes a route and return the unified error envelope.

    A pure-ASGI middleware (not `BaseHTTPMiddleware`, which buffers and would break
    our SSE streams). It sits *inside* CORS so even a truly-unexpected 500 comes back
    with the right CORS headers — otherwise the browser blocks the body cross-origin
    and the user sees nothing useful. If the response has already started (e.g. a
    failure mid-stream) it can't be replaced, so we let it propagate.
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def send_wrapper(message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:  # noqa: BLE001 — last resort: classify, never leak a raw 500
            if started:
                raise
            err = errors.classify(exc)
            await JSONResponse(status_code=err.status, content=errors.to_payload(err))(scope, receive, send)


# Order matters: add the classifier FIRST so CORS is added LAST and ends up the
# OUTERMOST layer — the classifier's error responses then flow out through CORS
# and pick up the required headers.
app.add_middleware(ClassifyErrorsMiddleware)

# Frontend runs on a different port — CORS is mandatory.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Unified error handling ────────────────────────────────────────────
# Every failure leaves the API as one shape: {"detail": <friendly>, "error": {...}}.
# The friendly message is safe to show as-is; the raw technical string only ever
# lives in `error.detail`, behind the frontend's "Show details" toggle.
@app.exception_handler(errors.AppError)
async def _handle_app_error(request: Request, exc: errors.AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content=errors.to_payload(exc))


@app.exception_handler(StarletteHTTPException)
async def _handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    err = errors.http_error(exc.status_code, exc.detail)
    return JSONResponse(status_code=err.status, content=errors.to_payload(err), headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def _handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    err = errors.from_validation_errors(exc.errors())
    return JSONResponse(status_code=err.status, content=errors.to_payload(err))


@app.exception_handler(Exception)
async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    # Last line of defense: classify anything that escaped a router so no raw
    # traceback or SDK string ever reaches the client as a bare 500.
    err = errors.classify(exc)
    return JSONResponse(status_code=err.status, content=errors.to_payload(err))


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


@app.get("/write", include_in_schema=False)
def write_page() -> FileResponse:
    """Serve the streaming cover-letter generation page."""
    return FileResponse(STATIC_DIR / "cover_letter.html")


@app.get("/voice", include_in_schema=False)
def voice_page() -> FileResponse:
    """Serve the writing-style page: add past letters, see what was learned."""
    return FileResponse(STATIC_DIR / "style.html")


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check."""
    return {"status": "ok"}


# Onboarding data endpoints (profile, skills, projects, experience, …).
app.include_router(api_router)
