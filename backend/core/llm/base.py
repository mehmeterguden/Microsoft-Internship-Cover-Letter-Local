"""The common interface every LLM provider implements.

Each provider connects to a different backend (Foundry Local, Azure OpenAI, Ollama,
OpenAI, Claude, Gemini) but exposes the same operations. Code elsewhere in the app
only ever talks to this interface, never to a specific provider.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator
from typing import Any

# A chat message: {"role": "system"|"user"|"assistant", "content": "..."}.
Message = dict[str, str]

# Optional structured-output request (OFF by default). When provided, callers use
# the OpenAI-style shape and each provider maps it to its native equivalent:
#   {"type": "json_object"}                      -> any valid JSON
#   {"type": "json_schema",                      -> JSON conforming to `schema`
#    "json_schema": {"name": str, "schema": {...}}}
# Providers that can't honour it degrade gracefully (they ignore it rather than
# fail), so passing it never breaks a request -- it only constrains where supported.
ResponseFormat = dict[str, Any] | None


def json_schema_of(response_format: ResponseFormat) -> dict[str, Any] | None:
    """Extract the raw JSON schema from a response_format, or None (json_object/off)."""
    if not response_format:
        return None
    if response_format.get("type") == "json_schema":
        schema = (response_format.get("json_schema") or {}).get("schema")
        return schema if isinstance(schema, dict) else None
    return None


class LLMProvider(ABC):
    """Base class -- one concrete subclass per backend."""

    provider_id: str = "base"

    @property
    @abstractmethod
    def model(self) -> str:
        """The model name this provider will request."""

    @abstractmethod
    def complete(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        response_format: ResponseFormat = None,
    ) -> str:
        """Return the model's full reply as a single string.

        `response_format` is an optional structured-output request (default OFF);
        see `ResponseFormat` above."""

    @abstractmethod
    def stream(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        response_format: ResponseFormat = None,
    ) -> Iterator[str]:
        """Yield the reply token by token as the model generates it."""

    def health(self) -> dict[str, object]:
        """Ping the model with a tiny prompt. Reports status; never raises."""
        info: dict[str, object] = {"provider": self.provider_id, "model": self.model}
        try:
            reply = self.complete([{"role": "user", "content": "ping"}], max_tokens=5)
            return {**info, "ok": True, "detail": reply.strip()[:60] or "ok"}
        except Exception as exc:  # noqa: BLE001 — surface any connection/auth/model error to the UI
            return {**info, "ok": False, "detail": f"{type(exc).__name__}: {exc}"}
