"""A tiny tool registry — the set of "hands" the research agents can use.

Each tool is a plain callable that gathers data from one free source and returns
a `ToolResult` (payload + provenance). Tools never raise for expected failures
(a 404, an empty result, a source being down); they return `ok=False` with an
`error` so an agent can shrug it off and try another angle. `ToolRegistry.call`
wraps unexpected exceptions the same way, so a single flaky source can never
crash a whole research run.

The registry also exposes `specs()` — name + description for every tool — which
a later phase feeds to the LLM so agents can pick tools by name. No agent logic
lives here; this is just the lookup table.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

# ── Per-run resilience knobs (applied centrally in ToolRegistry.call) ──
_TOOL_ATTEMPTS = 3        # a tool is retried this many times on a transient failure
_TOOL_BACKOFF = 0.75      # seconds; grows per attempt (0.75s, 1.5s, …)


class ToolBudget:
    """A thread-safe cap on how many tool calls a single research run may make.

    The fleet gathers concurrently (each agent in its own thread), so this counter
    is shared and locked. When the budget is spent, further calls short-circuit with
    a failed `ToolResult` instead of hitting the network — bounding cost and time."""

    def __init__(self, max_calls: int) -> None:
        self.max_calls = max_calls
        self._used = 0
        self._lock = threading.Lock()

    def take(self) -> bool:
        """Claim one call. Returns False (and claims nothing) once the budget is spent."""
        with self._lock:
            if self._used >= self.max_calls:
                return False
            self._used += 1
            return True

    @property
    def used(self) -> int:
        with self._lock:
            return self._used


# The active run's budget, propagated into gather threads via `asyncio.to_thread`
# (which copies the context). None outside a run → no cap (e.g. the dev /tools route).
tool_budget: ContextVar[ToolBudget | None] = ContextVar("research_tool_budget", default=None)


def _is_transient(error: str | None) -> bool:
    """True for retryable tool failures (network hiccups, 5xx, rate limits)."""
    if not error:
        return False
    e = error.lower()
    return any(
        k in e
        for k in ("timed out", "timeout", "could not reach", "http 5", "429",
                  "rate limit", "temporarily", "connection", "reset")
    )


@dataclass(frozen=True, slots=True)
class ToolResult:
    """What every tool returns: a payload plus where it came from."""

    tool: str
    source: str                       # provenance: a URL or a provider label
    data: Any = None                  # tool-specific payload (dict / list)
    ok: bool = True
    error: str | None = None

    @classmethod
    def fail(cls, tool: str, source: str, error: str) -> "ToolResult":
        return cls(tool=tool, source=source, data=None, ok=False, error=error)


@dataclass(frozen=True, slots=True)
class Tool:
    name: str
    description: str                  # one line — shown to the LLM for tool selection
    run: Callable[..., ToolResult]


@dataclass(slots=True)
class ToolRegistry:
    _tools: dict[str, Tool] = field(default_factory=dict)

    def register(self, name: str, description: str, run: Callable[..., ToolResult]) -> None:
        if name in self._tools:
            raise ValueError(f"Tool already registered: {name!r}")
        self._tools[name] = Tool(name=name, description=description, run=run)

    def get(self, name: str) -> Tool:
        tool = self._tools.get(name)
        if tool is None:
            raise ValueError(f"Unknown tool: {name!r}. Available: {sorted(self._tools)}")
        return tool

    def names(self) -> list[str]:
        return sorted(self._tools)

    def specs(self) -> list[dict[str, str]]:
        """`[{name, description}, ...]` — the menu an agent chooses from."""
        return [{"name": t.name, "description": t.description} for t in self._tools.values()]

    def call(self, name: str, /, **kwargs: Any) -> ToolResult:
        """Run a tool by name — with the per-run budget and transient-failure retries.

        Any unexpected error becomes a failed `ToolResult` (a broken tool must never
        kill a run). Transient failures (network/5xx/rate-limit) are retried with
        backoff, up to `_TOOL_ATTEMPTS`. Each attempt claims one unit of the run's
        `ToolBudget`; once that's spent, the call short-circuits without a network hit.
        """
        tool = self.get(name)
        budget = tool_budget.get()
        result = ToolResult.fail(name, source=name, error="Tool budget exhausted for this run.")
        for attempt in range(_TOOL_ATTEMPTS):
            if budget is not None and not budget.take():
                return result  # budget spent — return the last failure (or the budget message)
            try:
                result = tool.run(**kwargs)
            except Exception as exc:  # noqa: BLE001 — a broken tool must not kill the run
                result = ToolResult.fail(name, source=name, error=f"{type(exc).__name__}: {exc}")
            if result.ok or attempt == _TOOL_ATTEMPTS - 1 or not _is_transient(result.error):
                return result
            time.sleep(_TOOL_BACKOFF * (attempt + 1))  # transient — back off and retry
        return result
