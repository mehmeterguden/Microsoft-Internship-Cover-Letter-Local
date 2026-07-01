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

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


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
        """Run a tool by name, turning any unexpected error into a failed result."""
        tool = self.get(name)
        try:
            return tool.run(**kwargs)
        except Exception as exc:  # noqa: BLE001 — a broken tool must not kill the run
            return ToolResult.fail(name, source=name, error=f"{type(exc).__name__}: {exc}")
