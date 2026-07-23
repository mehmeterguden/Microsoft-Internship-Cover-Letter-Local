"""LLM usage metering — token/cost estimation, an in-flight counter, and recording.

The gateway (core/llm/__init__.py) calls `begin()`/`end()` around every request
(so `running()` reflects live activity for the UI meter) and `record(...)` on
completion. Providers in this app return plain strings (no usage object exposed
through our interface), so token counts are ESTIMATED at ~chars/4; when a provider
starts reporting real usage it can be passed straight into `record`.

Cost is estimated from a small per-model price table (USD per 1K tokens). Local
providers are always $0 — they run on the user's machine.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone

from core.llm.base import Message
from db import queries

# Providers that run on-device — never billed, never redacted.
LOCAL_PROVIDERS = frozenset({"foundry_local", "ollama"})

# Per-model price (USD per 1K tokens) as (prompt, completion). Matched by substring,
# most-specific first. Rough public list prices — used only for a live estimate.
_PRICES: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.00015, 0.0006),
    "gpt-4o": (0.0025, 0.01),
    "gpt-4.1-mini": (0.0004, 0.0016),
    "gpt-4.1": (0.002, 0.008),
    "o3-mini": (0.0011, 0.0044),
    "o1-mini": (0.0011, 0.0044),
    "claude-3-5-haiku": (0.0008, 0.004),
    "claude-haiku": (0.0008, 0.004),
    "claude-3-5-sonnet": (0.003, 0.015),
    "claude-sonnet": (0.003, 0.015),
    "claude-opus": (0.015, 0.075),
    "gemini-2.5-flash-lite": (0.0001, 0.0004),
    "gemini-2.0-flash": (0.0001, 0.0004),
    "gemini-2.5-flash": (0.0003, 0.0025),
    "gemini-2.5-pro": (0.00125, 0.01),
    "gemini-1.5-flash": (0.000075, 0.0003),
    "gemini-1.5-pro": (0.00125, 0.005),
}


def estimate_tokens(text: str) -> int:
    """Rough token estimate (~4 chars/token). At least 1 for non-empty text."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def _price_for(model: str) -> tuple[float, float]:
    m = (model or "").lower()
    for key, price in _PRICES.items():
        if key in m:
            return price
    return (0.0, 0.0)


def estimate_cost(provider: str, model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimated USD cost. Local providers are always free."""
    if provider in LOCAL_PROVIDERS:
        return 0.0
    p_in, p_out = _price_for(model)
    return round(prompt_tokens / 1000 * p_in + completion_tokens / 1000 * p_out, 6)


# ── in-flight counter (process-global; covers every AI call incl. SSE) ──
_lock = threading.Lock()
_inflight = 0


def begin() -> None:
    global _inflight
    with _lock:
        _inflight += 1


def end() -> None:
    global _inflight
    with _lock:
        _inflight = max(0, _inflight - 1)


def running() -> int:
    with _lock:
        return _inflight


def record(
    provider: str,
    model: str,
    messages: list[Message],
    completion: str,
    latency_ms: float,
    kind: str,
    *,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
) -> None:
    """Persist one run. Token counts are estimated unless the caller supplies real
    ones. Never raises — metering must not break a generation."""
    try:
        pt = prompt_tokens if prompt_tokens is not None else sum(
            estimate_tokens(m.get("content", "")) for m in messages
        )
        ct = completion_tokens if completion_tokens is not None else estimate_tokens(completion)
        queries.record_llm_run(
            {
                "created_at": datetime.now(timezone.utc).isoformat(),
                "provider": provider,
                "model": model,
                "prompt_tokens": pt,
                "completion_tokens": ct,
                "total_tokens": pt + ct,
                "latency_ms": int(latency_ms),
                "cost_usd": estimate_cost(provider, model, pt, ct),
                "kind": kind,
            }
        )
    except Exception:  # noqa: BLE001 — metering is best-effort; never fail the call
        pass
