"""The central error classifier: every failure becomes a safe, friendly AppError.

The guarantees under test:
  • each known failure maps to the right code/status/action/retryable;
  • the raw technical string only ever lands in `error.detail`, never in the
    user-facing `message` (no leaks);
  • unknown exceptions degrade to a generic, reassuring error (never a bare 500);
  • the wire helpers produce the backward-compatible `{detail, error}` envelope.
"""

from __future__ import annotations

import json
import urllib.error

import anthropic
import openai
import pytest
from pydantic import BaseModel, ValidationError

from core import errors
from core.llm.gemini import GeminiUnavailable


class _FakeResponse:
    """Minimal stand-in for the httpx.Response the SDK errors want."""

    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
        self.request = None
        self.headers = {}


def _openai(exc_cls: type, status_code: int, message: str = "boom") -> Exception:
    return exc_cls(message, response=_FakeResponse(status_code), body=None)


# ── provider SDK exceptions (openai + anthropic share the shape) ──────
@pytest.mark.parametrize(
    ("exc", "code", "status", "action", "retryable"),
    [
        (_openai(openai.RateLimitError, 429), "llm.rate_limited", 429, "switch_model", True),
        (_openai(openai.AuthenticationError, 401), "llm.auth", 400, "open_settings", False),
        (_openai(openai.PermissionDeniedError, 403), "llm.auth", 400, "open_settings", False),
        (_openai(openai.NotFoundError, 404), "llm.model_not_found", 400, "switch_model", False),
        (_openai(openai.InternalServerError, 503), "llm.unavailable", 503, "retry", True),
    ],
)
def test_openai_status_errors(exc, code, status, action, retryable):
    err = errors.classify(exc, provider="openai", model="gpt-4o")
    assert (err.code, err.status, err.action, err.retryable) == (code, status, action, retryable)
    assert err.detail and "boom" in err.detail  # raw string kept in detail only
    assert "boom" not in err.message           # never leaked into the friendly message


def test_openai_connection_error_is_provider_aware():
    err = errors.classify(openai.APIConnectionError(request=None), provider="foundry_local", model="phi")
    assert err.code == "llm.connection"
    assert "Foundry Local" in err.message      # local provider named + "make sure it's running"
    assert err.retryable is True


def test_anthropic_auth_error():
    err = errors.classify(_openai(anthropic.AuthenticationError, 401), provider="anthropic", model="claude")
    assert err.code == "llm.auth"
    assert "Claude" in err.message


# ── native Gemini SDK + our GeminiUnavailable wrapper ─────────────────
def test_gemini_unavailable_reasons_drive_action():
    busy = errors.classify(GeminiUnavailable("busy", reasons={"unavailable"}), provider="gemini", model="g")
    assert busy.code == "llm.unavailable" and busy.action == "switch_model"

    rejected = errors.classify(GeminiUnavailable("bad key", reasons={"invalid"}), provider="gemini", model="g")
    assert rejected.code == "llm.auth" and rejected.action == "open_settings"

    limited = errors.classify(GeminiUnavailable("quota", reasons={"limit"}), provider="gemini", model="g")
    assert limited.code == "llm.rate_limited"


# ── stdlib / urllib (Ollama and raw HTTP) ─────────────────────────────
def test_urllib_connection_refused_maps_to_connection():
    err = errors.classify(urllib.error.URLError("Connection refused"), provider="ollama", model="qwen")
    assert err.code == "llm.connection" and "Ollama" in err.message


def test_urllib_http_error_uses_its_code():
    err = errors.classify(urllib.error.HTTPError("u", 404, "nf", {}, None), provider="ollama", model="qwen")
    assert err.code == "llm.model_not_found"


def test_json_decode_error_is_bad_output():
    err = errors.classify(json.JSONDecodeError("bad", "{", 0))
    assert err.code == "parse.invalid_output" and err.retryable is True


def test_pydantic_validation_error_is_bad_output():
    class M(BaseModel):
        x: int

    try:
        M(x="not-an-int")
    except ValidationError as exc:
        err = errors.classify(exc)
    assert err.code == "parse.invalid_output"


# ── curated ValueError keeps its friendly message ────────────────────
def test_value_error_message_is_surfaced():
    err = errors.classify(ValueError("Enter a full URL starting with http:// or https://"))
    assert err.code == "validation"
    assert err.message == "Enter a full URL starting with http:// or https://"


# ── unknown exceptions degrade safely, no leak ────────────────────────
def test_unknown_exception_is_generic_but_keeps_detail():
    err = errors.classify(RuntimeError("raw internals {secret token}"))
    assert err.code == "internal.unexpected" and err.status == 500
    assert "secret" not in err.message                 # not leaked to the user
    assert err.detail and "secret" in err.detail       # available behind the details toggle


def test_app_error_passes_through_unchanged():
    original = errors.rate_limited("openai", "429 detail")
    assert errors.classify(original) is original


def test_classify_never_raises_on_weird_input():
    # A broken object whose str() raises must still yield an AppError.
    class Nasty(Exception):
        def __str__(self) -> str:
            raise RuntimeError("cannot stringify")

    err = errors.classify(Nasty())
    assert isinstance(err, errors.AppError)


# ── privacy: an outbound leak must never echo the offending bytes ─────
def test_outbound_leak_is_privacy_safe():
    from core.research.outbound_guard import OutboundLeakError

    err = errors.classify(OutboundLeakError("query contained john.doe@example.com"))
    assert err.code == "research.leak_blocked"
    assert err.detail is None                # raw bytes (which may hold private data) not echoed
    assert "example.com" not in err.message


# ── wire helpers ──────────────────────────────────────────────────────
def test_to_payload_is_backward_compatible_envelope():
    payload = errors.to_payload(errors.unavailable("gemini", "ServerError: 503"))
    assert payload["detail"] == payload["error"]["message"]   # legacy `detail` == friendly message
    assert payload["error"]["code"] == "llm.unavailable"
    assert set(payload["error"]) == {"code", "title", "message", "detail", "retryable", "action"}


def test_http_error_reshapes_friendly_detail():
    err = errors.http_error(404, "job 5 not found")
    assert err.code == "not_found" and err.message == "job 5 not found"


def test_validation_errors_summarize_first_field():
    raw = [{"loc": ["body", "url"], "msg": "field required", "type": "missing"}]
    err = errors.from_validation_errors(raw)
    assert err.code == "validation" and "url" in err.message and err.detail is not None
