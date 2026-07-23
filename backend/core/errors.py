"""The single source of truth for turning *any* failure into a safe, friendly error.

Everything that can go wrong — a provider SDK exception, a dropped connection, an
unparseable model reply, an unknown bug — is funneled through `classify()`, which
returns an `AppError`: a friendly `title` + `message` the UI can show as-is, plus the
raw technical `detail` kept separate so the frontend can reveal it behind a
"Show details" toggle. Nothing raw ever reaches the user by accident.

The wire shape (`to_payload`) is backward-compatible: `detail` holds the friendly
message (so the existing `errorMessage()` keeps working) and `error` carries the full
structured object the upgraded UI uses.

    { "detail": "<message>", "error": { code, title, message, detail, retryable, action } }

This module is deliberately dependency-light and defensive: `classify()` never raises,
and it recognizes each provider's exceptions by duck-typing (`.status_code`, `.code`)
and guarded imports, so a missing optional SDK can't break error handling itself.
"""

from __future__ import annotations

import importlib
import json
import urllib.error
from typing import Any

# ── friendly provider names / locality ───────────────────────────────
_PROVIDER_NAMES: dict[str, str] = {
    "foundry_local": "Foundry Local",
    "ollama": "Ollama",
    "openai": "OpenAI",
    "anthropic": "Claude",
    "gemini": "Gemini",
}
_LOCAL_PROVIDERS = {"foundry_local", "ollama"}


def _provider_name(provider_id: str | None) -> str:
    return _PROVIDER_NAMES.get(provider_id or "", "the model provider")


def _is_local(provider_id: str | None) -> bool:
    return (provider_id or "") in _LOCAL_PROVIDERS


# ── the error object ──────────────────────────────────────────────────
class AppError(Exception):
    """A classified, user-safe error. Raise this anywhere; the global handler and the
    SSE endpoints turn it into the wire shape above."""

    def __init__(
        self,
        *,
        code: str,
        title: str,
        message: str,
        status: int = 500,
        detail: str | None = None,
        retryable: bool = False,
        action: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.title = title
        self.message = message
        self.status = status
        self.detail = detail
        self.retryable = retryable
        self.action = action

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "title": self.title,
            "message": self.message,
            "detail": self.detail,
            "retryable": self.retryable,
            "action": self.action,
        }


# ── known-error factories (canonical status/title/message/action) ─────
def no_key(provider_id: str | None) -> AppError:
    name = _provider_name(provider_id)
    return AppError(
        code="llm.no_key",
        title="No API key set",
        message=f"Add your {name} API key in Settings to use this model.",
        status=400,
        retryable=False,
        action="open_settings",
    )


def auth(provider_id: str | None, detail: str | None) -> AppError:
    name = _provider_name(provider_id)
    return AppError(
        code="llm.auth",
        title="API key rejected",
        message=f"Your {name} API key was rejected. Check it in Settings, or add a working key.",
        status=400,
        detail=detail,
        retryable=False,
        action="open_settings",
    )


def rate_limited(provider_id: str | None, detail: str | None) -> AppError:
    name = _provider_name(provider_id)
    return AppError(
        code="llm.rate_limited",
        title="Rate limit reached",
        message=f"{name} is rate-limiting requests right now. Wait a moment, or switch key/model in Settings.",
        status=429,
        detail=detail,
        retryable=True,
        action="switch_model",
    )


def unavailable(provider_id: str | None, detail: str | None) -> AppError:
    name = _provider_name(provider_id)
    return AppError(
        code="llm.unavailable",
        title="The model is busy",
        message=f"{name} is under high demand right now. Please try again in a moment.",
        status=503,
        detail=detail,
        retryable=True,
        action="retry",
    )


def model_not_found(provider_id: str | None, model: str | None, detail: str | None) -> AppError:
    which = f'"{model}"' if model else "That model"
    return AppError(
        code="llm.model_not_found",
        title="Model unavailable",
        message=f"{which} isn't available on {_provider_name(provider_id)}. Pick another model in Settings.",
        status=400,
        detail=detail,
        retryable=False,
        action="switch_model",
    )


def connection(provider_id: str | None, detail: str | None) -> AppError:
    name = _provider_name(provider_id)
    if _is_local(provider_id):
        message = f"Couldn't reach {name}. Make sure it's running, then try again."
    else:
        message = f"Couldn't reach {name}. Check your internet connection and try again."
    return AppError(
        code="llm.connection",
        title="Can't reach the model",
        message=message,
        status=503,
        detail=detail,
        retryable=True,
        action="retry",
    )


def timeout(provider_id: str | None, detail: str | None) -> AppError:
    return AppError(
        code="llm.timeout",
        title="The request timed out",
        message=f"{_provider_name(provider_id)} took too long to respond. Try again, or pick a lighter model.",
        status=504,
        detail=detail,
        retryable=True,
        action="retry",
    )


def bad_output(detail: str | None) -> AppError:
    return AppError(
        code="parse.invalid_output",
        title="Unexpected model output",
        message="The model's reply couldn't be read as valid data. Try again — this is usually temporary.",
        status=502,
        detail=detail,
        retryable=True,
        action="retry",
    )


def job_posting(detail: str | None) -> AppError:
    return AppError(
        code="research.job_url",
        title="Couldn't read that job posting",
        message="We couldn't extract the posting from that link. Check the URL, or paste the details in manually.",
        status=422,
        detail=detail,
        retryable=False,
    )


def leak_blocked() -> AppError:
    # Never echo the offending bytes — they may contain the user's private data.
    return AppError(
        code="research.leak_blocked",
        title="Request blocked for your privacy",
        message="A safety check stopped this request because it looked like it might include your private "
        "data. Nothing was sent. Please report this if it keeps happening.",
        status=500,
        retryable=False,
    )


def tool_failed(detail: str | None) -> AppError:
    return AppError(
        code="tool.failed",
        title="A tool didn't respond",
        message="An external tool returned an error or unusable response. It's safe to try again.",
        status=502,
        detail=detail,
        retryable=True,
        action="retry",
    )


def file_unsupported() -> AppError:
    return AppError(
        code="file.unsupported",
        title="Unsupported file type",
        message="Upload a PDF, image, or Word (.docx) file.",
        status=400,
        retryable=False,
    )


def file_corrupt(detail: str | None) -> AppError:
    return AppError(
        code="file.corrupt",
        title="We couldn't read that file",
        message="The file looks damaged or isn't a valid PDF, image, or Word document. Try another file.",
        status=422,
        detail=detail,
        retryable=False,
    )


def file_too_large(limit_mb: int) -> AppError:
    return AppError(
        code="file.too_large",
        title="File is too large",
        message=f"That file is larger than {limit_mb} MB. Upload a smaller file.",
        status=413,
        retryable=False,
    )


def validation(message: str, detail: str | None = None) -> AppError:
    return AppError(
        code="validation",
        title="Check your input",
        message=message or "Some of the information provided isn't valid.",
        status=400,
        detail=detail,
        retryable=False,
    )


def conflict(detail: str | None, message: str | None = None) -> AppError:
    return AppError(
        code="conflict",
        title="Couldn't save that",
        message=message
        or "This couldn't be saved — it conflicts with existing data, or a linked item is missing.",
        status=409,
        detail=detail,
        retryable=False,
    )


def not_found(message: str) -> AppError:
    return AppError(
        code="not_found",
        title="Not found",
        message=message or "We couldn't find what you were looking for.",
        status=404,
        retryable=False,
    )


def unexpected(detail: str | None) -> AppError:
    return AppError(
        code="internal.unexpected",
        title="Something went wrong",
        message="An unexpected error occurred. Your data stays on your machine — you can view the "
        "technical details below and try again.",
        status=500,
        detail=detail,
        retryable=True,
        action="retry",
    )


# ── reshaping FastAPI's own errors into the unified envelope ──────────
_HTTP_TITLES: dict[int, str] = {
    400: "Check your input",
    401: "Not authorized",
    403: "Not allowed",
    404: "Not found",
    409: "That didn't work",
    413: "File is too large",
    422: "Couldn't process that",
    429: "Too many requests",
    500: "Something went wrong",
    502: "Upstream error",
    503: "Service unavailable",
    504: "The request timed out",
}
_HTTP_CODES: dict[int, str] = {400: "validation", 404: "not_found", 409: "conflict", 413: "file.too_large"}


def http_error(status: int, detail: object, headers: dict[str, str] | None = None) -> AppError:
    """Wrap a raised `HTTPException` (already carrying a friendly `detail` string) in
    the unified envelope so the frontend sees one consistent shape."""
    title = _HTTP_TITLES.get(status, "Request failed")
    message = detail if isinstance(detail, str) and detail.strip() else title
    return AppError(
        code=_HTTP_CODES.get(status, f"http.{status}"),
        title=title,
        message=message,
        status=status,
        retryable=status in (429, 502, 503, 504),
    )


def from_validation_errors(raw_errors: list[dict[str, Any]]) -> AppError:
    """Summarize a FastAPI `RequestValidationError` into one friendly sentence, keeping
    the full per-field breakdown as the technical detail."""
    first = raw_errors[0] if raw_errors else None
    if first is not None:
        location = ".".join(str(p) for p in first.get("loc", ()) if p not in ("body", "query", "path"))
        reason = first.get("msg", "Invalid value")
        message = f"“{location}”: {reason}" if location else reason
    else:
        message = "Some of the information provided isn't valid."
    detail = json.dumps(raw_errors)[:2000] if raw_errors else None
    return AppError(
        code="validation",
        title="Check your input",
        message=message,
        status=422,
        detail=detail,
        retryable=False,
    )


# ── guarded references to optional SDK / app exception types ──────────
def _optional(module: str, *names: str) -> tuple[type, ...]:
    """Import exception classes if their package is installed; else an empty tuple
    (so `isinstance(x, ())` is always False and never errors)."""
    try:
        mod = importlib.import_module(module)
    except Exception:  # noqa: BLE001 — an absent optional SDK must not break classification
        return ()
    return tuple(getattr(mod, n) for n in names if isinstance(getattr(mod, n, None), type))


# App-internal custom exceptions (guarded to avoid import cycles / heavy boot cost).
_GeminiUnavailable = _optional("core.llm.gemini", "GeminiUnavailable")
_VoiceAnalysisError = _optional("core.style", "VoiceAnalysisError")
_JobPostingError = _optional("core.job_posting", "JobPostingError")
_OutboundLeakError = _optional("core.research.outbound_guard", "OutboundLeakError")
_MCPError = _optional("core.research.tools.mcp", "MCPError")
_StructuredError = _optional("core.structured_output", "StructuredError")

# Provider SDK exception groups (openai and anthropic share the same class shapes).
_STATUS_ERRORS = _optional("openai", "APIStatusError") + _optional("anthropic", "APIStatusError")
_TIMEOUT_ERRORS = _optional("openai", "APITimeoutError") + _optional("anthropic", "APITimeoutError")
_CONNECTION_ERRORS = _optional("openai", "APIConnectionError") + _optional("anthropic", "APIConnectionError")
_GENAI_ERRORS = _optional("google.genai.errors", "APIError")


def _raw(exc: Exception) -> str:
    """A compact raw technical string for the details expander. Never raises, even if
    the exception's own `__str__` is broken."""
    try:
        text = str(exc).strip()
    except Exception:  # noqa: BLE001 — a hostile/broken __str__ must not break classification
        text = ""
    return f"{type(exc).__name__}: {text}" if text else type(exc).__name__


def _reasons(exc: Exception) -> set[str]:
    reasons = getattr(exc, "reasons", None)
    return reasons if isinstance(reasons, set) else set()


def _from_reasons(provider_id: str | None, model: str | None, exc: Exception) -> AppError:
    """Map a GeminiUnavailable / VoiceAnalysisError (which carry `reasons`) to an AppError."""
    reasons = _reasons(exc)
    detail = _raw(exc)
    if "invalid" in reasons:
        return auth(provider_id, detail)
    if reasons == {"limit"}:
        return rate_limited(provider_id, detail)
    if "unavailable" in reasons:
        # Model missing/busy — offer switching the model.
        err = unavailable(provider_id, detail)
        err.action = "switch_model"
        return err
    # Mixed / unknown reasons: the original message is already user-friendly.
    return AppError(
        code="llm.unavailable",
        title="The model is unavailable",
        message=str(exc) or unavailable(provider_id, detail).message,
        status=503,
        detail=detail,
        retryable=True,
        action="switch_model",
    )


def _from_status_code(provider_id: str | None, model: str | None, code: int | None, exc: Exception) -> AppError:
    """Map an HTTP-ish status code (OpenAI/Anthropic `.status_code`, urllib `.code`,
    genai `.code`) to an AppError."""
    detail = _raw(exc)
    text = str(exc).lower()
    if code in (401, 403):
        return auth(provider_id, detail)
    if code == 429:
        return rate_limited(provider_id, detail)
    if code == 404:
        return model_not_found(provider_id, model, detail)
    if code == 400 and "api" in text and "key" in text:
        return auth(provider_id, detail)
    if code == 400:
        return bad_output(detail) if "json" in text else validation("The model rejected the request.", detail)
    if code is not None and code >= 500:
        return unavailable(provider_id, detail)
    return unavailable(provider_id, detail)


def classify(exc: Exception, *, provider: str | None = None, model: str | None = None) -> AppError:
    """Turn any exception into an `AppError`. Never raises.

    `provider`/`model` default to the active LLM settings, so provider-side failures
    get provider-aware messages ("Couldn't reach Foundry Local" vs "…OpenAI").
    """
    try:
        return _classify(exc, provider=provider, model=model)
    except Exception:  # noqa: BLE001 — classification itself must never fail
        return unexpected(_raw(exc))


def _classify(exc: Exception, *, provider: str | None, model: str | None) -> AppError:
    if isinstance(exc, AppError):
        return exc

    if provider is None or model is None:
        active_provider, active_model = _active_llm()
        provider = provider or active_provider
        model = model or active_model

    # ── app-internal custom exceptions (carry the richest signal) ──
    if _OutboundLeakError and isinstance(exc, _OutboundLeakError):
        return leak_blocked()
    if _GeminiUnavailable and isinstance(exc, _GeminiUnavailable):
        return _from_reasons(provider, model, exc)
    if _VoiceAnalysisError and isinstance(exc, _VoiceAnalysisError):
        return _from_reasons(provider, model, exc)
    if _JobPostingError and isinstance(exc, _JobPostingError):
        return job_posting(_raw(exc))
    if _MCPError and isinstance(exc, _MCPError):
        return tool_failed(_raw(exc))
    if _StructuredError and isinstance(exc, _StructuredError):
        return bad_output(_raw(exc))

    # ── provider SDK exceptions (openai / anthropic) ──
    if _TIMEOUT_ERRORS and isinstance(exc, _TIMEOUT_ERRORS):
        return timeout(provider, _raw(exc))
    if _CONNECTION_ERRORS and isinstance(exc, _CONNECTION_ERRORS):
        return connection(provider, _raw(exc))
    if _STATUS_ERRORS and isinstance(exc, _STATUS_ERRORS):
        return _from_status_code(provider, model, getattr(exc, "status_code", None), exc)

    # ── google-genai (native Gemini SDK, when it escapes gemini.py) ──
    if _GENAI_ERRORS and isinstance(exc, _GENAI_ERRORS):
        return _from_status_code(provider, model, getattr(exc, "code", None), exc)

    # ── stdlib / urllib (Ollama and any raw HTTP) ──
    if isinstance(exc, urllib.error.HTTPError):
        return _from_status_code(provider, model, getattr(exc, "code", None), exc)
    if isinstance(exc, urllib.error.URLError):
        return connection(provider, _raw(exc))
    if isinstance(exc, TimeoutError):
        return timeout(provider, _raw(exc))
    if isinstance(exc, ConnectionError):
        return connection(provider, _raw(exc))
    if isinstance(exc, json.JSONDecodeError):
        return bad_output(_raw(exc))

    # ── pydantic validation of internal/model data ──
    if type(exc).__name__ == "ValidationError" and "pydantic" in type(exc).__module__:
        return bad_output(_raw(exc))

    # ── a curated ValueError usually already carries a user-friendly message ──
    if isinstance(exc, ValueError):
        text = str(exc).strip()
        if 0 < len(text) <= 200:
            return validation(text, _raw(exc))

    # ── anything else ──
    return unexpected(_raw(exc))


def _active_llm() -> tuple[str, str]:
    """The provider/model the current request is using, read from settings."""
    try:
        from db import queries

        settings = queries.get_settings()
        return settings.get("llm_provider", ""), settings.get("llm_model", "")
    except Exception:  # noqa: BLE001 — settings may be unavailable very early / in tests
        return "", ""


# ── wire helpers ──────────────────────────────────────────────────────
def error_dict(source: AppError | Exception) -> dict[str, Any]:
    """The structured `error` object (used directly by SSE events)."""
    err = source if isinstance(source, AppError) else classify(source)
    return err.to_dict()


def to_payload(source: AppError | Exception) -> dict[str, Any]:
    """The full HTTP body: friendly `detail` (backward-compatible) + `error` object."""
    err = source if isinstance(source, AppError) else classify(source)
    return {"detail": err.message, "error": err.to_dict()}
