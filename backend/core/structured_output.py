"""Reliable structured decoding for the structuring layer.

One place for the whole "get a JSON object out of the model" dance, so the
structuring modules stop "prompt-for-JSON then parse-and-pray":

  • schema_for()      — Pydantic model → JSON schema (derived, never hand-written)
  • json_schema()/json_object() — build the provider `response_format` (OpenAI-style;
                        each provider maps it to its native constrained-decoding, or
                        ignores it when unsupported — see core/llm/base.py)
  • extract_json()/loads() — robust extraction + tolerant parse (fences/prose/newlines)
  • structure()/parse()/finalize() — generate → parse → validate, with ONE repair
                        retry when the first reply won't parse/validate

The provider constrained-decoding is the speed/reliability win; the parse + repair
fallback keeps things working on providers that ignore `response_format` (e.g.
Claude) or models that drift from the shape — nothing regresses.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from pydantic import BaseModel, ValidationError

from core import llm
from core.llm.base import Message

# `ResponseFormat` lives in core.llm.base once the model-layer plumbing is present;
# fall back to its shape so this module imports even before that PR lands.
try:  # pragma: no cover - trivial import shim
    from core.llm.base import ResponseFormat
except ImportError:  # pragma: no cover
    ResponseFormat = dict[str, Any] | None  # type: ignore[misc,assignment]


class StructuredError(ValueError):
    """The model output couldn't be parsed into JSON (before any model validation)."""


# ── schema derivation (from the Pydantic models — the single source of truth) ──

@lru_cache(maxsize=None)
def schema_for(model: type[BaseModel]) -> dict[str, Any]:
    """JSON schema for a Pydantic model. Derived, cached, never hand-maintained."""
    return model.model_json_schema()


def json_object() -> ResponseFormat:
    """Ask for any valid JSON object (no schema). Guarantees parseable output while
    letting the prompt drive the exact shape — used when the reply carries extra
    fields the model doesn't declare, or has no single Pydantic model."""
    return {"type": "json_object"}


def json_schema(model: type[BaseModel]) -> ResponseFormat:
    """Ask for JSON constrained to a model's schema (where the provider supports it)."""
    return {"type": "json_schema", "json_schema": {"name": model.__name__, "schema": schema_for(model)}}


# ── robust extraction / parsing ──────────────────────────────────

def extract_json(text: str) -> str:
    """Pull the outermost JSON object out of a reply (tolerates code fences / prose)."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise StructuredError("No JSON object found in the model output.")
    return text[start : end + 1]


def loads(text: str) -> Any:
    """extract_json + tolerant json.loads (allows raw newlines inside string values)."""
    try:
        return json.loads(extract_json(text), strict=False)
    except json.JSONDecodeError as exc:
        raise StructuredError(f"Invalid JSON: {exc}") from exc


# ── generation (optionally constrained) ──────────────────────────

def _rejects_response_format(exc: TypeError) -> bool:
    """True when a provider's `complete`/`stream` doesn't accept `response_format`.

    Only the OpenAI-compatible providers take the kwarg; the local ones (Foundry,
    Ollama) and Claude/Gemini don't. Passing it there raises `TypeError: ... got an
    unexpected keyword argument 'response_format'`. We detect that and retry without
    it — the constrained-decoding path is a bonus, never a hard requirement (task 14:
    provider JSON mode where available, schema + repair everywhere else)."""
    return "response_format" in str(exc)


def complete(
    messages: list[Message],
    *,
    response_format: ResponseFormat = None,
    temperature: float = 0.0,
    max_tokens: int | None = None,
) -> str:
    """A single completion, constrained by `response_format` where the provider supports it.

    Falls back to an unconstrained call when the provider ignores/rejects the kwarg, so
    the same code path works on every provider — the parse + repair below keeps output
    reliable regardless."""
    if response_format is not None:
        try:
            return llm.complete(
                messages, temperature=temperature, max_tokens=max_tokens, response_format=response_format
            )
        except TypeError as exc:
            if not _rejects_response_format(exc):
                raise
    return llm.complete(messages, temperature=temperature, max_tokens=max_tokens)


def stream(
    messages: list[Message],
    *,
    response_format: ResponseFormat = None,
    temperature: float = 0.0,
) -> Iterator[str]:
    """A streamed completion, constrained by `response_format` where supported.

    A generator function rejects an unknown kwarg at call time (before the first
    `yield`), so we can catch it and re-enter without the constraint."""
    if response_format is not None:
        try:
            generator = llm.stream(messages, temperature=temperature, response_format=response_format)
        except TypeError as exc:
            if not _rejects_response_format(exc):
                raise
            generator = llm.stream(messages, temperature=temperature)
    else:
        generator = llm.stream(messages, temperature=temperature)
    yield from generator


def repair_messages(messages: list[Message], bad_output: str, error: object | None = None) -> list[Message]:
    """Follow-up turn that shows the model its unusable reply and asks for clean JSON."""
    reason = f" ({error})" if error else ""
    return [
        *messages,
        {"role": "assistant", "content": bad_output},
        {
            "role": "user",
            "content": (
                f"That was not valid JSON for the required shape{reason}. "
                "Reply with ONLY the corrected JSON object — no prose, no markdown, no code fences."
            ),
        },
    ]


# ── parse + validate (+ one repair retry) ────────────────────────

@dataclass
class Result:
    """Outcome of a structured call. `data` is the raw parsed dict (keeps any extra
    keys the model emitted, e.g. per-item confidence); `value` is the validated model
    instance when a model was given. `raw` is always the model's text, for debugging."""

    ok: bool
    raw: str
    data: dict[str, Any] | None = None
    value: BaseModel | None = None
    error: str | None = None


Normalizer = Callable[[dict[str, Any]], dict[str, Any]]

_PARSE_ERRORS = (StructuredError, ValidationError, ValueError, TypeError)


def _validate(raw: str, model: type[BaseModel] | None, normalize: Normalizer | None):
    """Parse raw → dict (+ optional normalize) → optional model validation."""
    data = loads(raw)
    if not isinstance(data, dict):
        raise StructuredError(f"Expected a JSON object, got {type(data).__name__}.")
    if normalize is not None:
        data = normalize(data)
    value = model(**data) if model is not None else None
    return data, value


def finalize(
    messages: list[Message],
    raw: str,
    model: type[BaseModel] | None = None,
    *,
    normalize: Normalizer | None = None,
    repair: bool = True,
    response_format: ResponseFormat = None,
    temperature: float = 0.0,
    max_tokens: int | None = None,
) -> Result:
    """Parse + validate an already-generated `raw`. On failure, do ONE repair call
    (re-showing the bad output) and try again. Never raises for parse/validation
    problems — returns `Result(ok=False, ...)` so callers can surface `error`/`raw`."""
    try:
        data, value = _validate(raw, model, normalize)
        return Result(ok=True, raw=raw, data=data, value=value)
    except _PARSE_ERRORS as first:
        if not repair:
            return Result(ok=False, raw=raw, error=f"{type(first).__name__}: {first}")
        try:
            raw2 = complete(
                repair_messages(messages, raw, first),
                response_format=response_format,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as exc:  # noqa: BLE001 — repair call failed (network/quota); report the parse error
            return Result(ok=False, raw=raw, error=f"{type(first).__name__}: {first} (repair failed: {exc})")
        try:
            data, value = _validate(raw2, model, normalize)
            return Result(ok=True, raw=raw2, data=data, value=value)
        except _PARSE_ERRORS as second:
            return Result(ok=False, raw=raw2, error=f"{type(second).__name__}: {second}")


def structure(
    messages: list[Message],
    model: type[BaseModel],
    *,
    response_format: ResponseFormat | bool = True,
    normalize: Normalizer | None = None,
    repair: bool = True,
    temperature: float = 0.0,
    max_tokens: int | None = None,
) -> Result:
    """Generate → parse → validate against `model`, with one repair retry.

    `response_format`: True (default) constrains to the model's schema; False asks
    only for a valid JSON object (use when the reply carries extra fields the model
    doesn't declare); or pass an explicit ResponseFormat.
    """
    rf = _resolve_rf(response_format, model)
    raw = complete(messages, response_format=rf, temperature=temperature, max_tokens=max_tokens)
    return finalize(
        messages, raw, model, normalize=normalize, repair=repair,
        response_format=rf, temperature=temperature, max_tokens=max_tokens,
    )


def parse(
    messages: list[Message],
    *,
    response_format: ResponseFormat | bool = True,
    repair: bool = True,
    temperature: float = 0.0,
    max_tokens: int | None = None,
) -> Result:
    """Generate → parse a JSON object (no model), with one repair retry. For dynamic
    shapes (keyed-by-id dicts, wrapper objects) that have no single Pydantic model."""
    rf = json_object() if response_format is True else (None if response_format is False else response_format)
    raw = complete(messages, response_format=rf, temperature=temperature, max_tokens=max_tokens)
    return finalize(
        messages, raw, None, repair=repair,
        response_format=rf, temperature=temperature, max_tokens=max_tokens,
    )


def _resolve_rf(response_format: ResponseFormat | bool, model: type[BaseModel]) -> ResponseFormat:
    if response_format is True:
        return json_schema(model)
    if response_format is False:
        return json_object()
    return response_format
