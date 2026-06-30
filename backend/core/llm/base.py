"""The common interface every LLM provider implements.

Each provider connects to a different backend (Foundry Local, Ollama, OpenAI,
Claude, Gemini) but exposes the same three operations. Code elsewhere in the app
only ever talks to this interface, never to a specific provider.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator

# A chat message: {"role": "system"|"user"|"assistant", "content": "..."}.
Message = dict[str, str]


class LLMProvider(ABC):
    """Base class — one concrete subclass per backend."""

    provider_id: str = "base"

    @property
    @abstractmethod
    def model(self) -> str:
        """The model name this provider will request."""

    @abstractmethod
    def complete(
        self, messages: list[Message], *, temperature: float = 0.7, max_tokens: int | None = None
    ) -> str:
        """Return the model's full reply as a single string."""

    @abstractmethod
    def stream(self, messages: list[Message], *, temperature: float = 0.7) -> Iterator[str]:
        """Yield the reply token by token as the model generates it."""

    def health(self) -> dict[str, object]:
        """Ping the model with a tiny prompt. Reports status; never raises."""
        info: dict[str, object] = {"provider": self.provider_id, "model": self.model}
        try:
            reply = self.complete([{"role": "user", "content": "ping"}], max_tokens=5)
            return {**info, "ok": True, "detail": reply.strip()[:60] or "ok"}
        except Exception as exc:  # noqa: BLE001 — surface any connection/auth/model error to the UI
            return {**info, "ok": False, "detail": f"{type(exc).__name__}: {exc}"}
