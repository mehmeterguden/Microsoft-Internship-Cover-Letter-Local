"""Shared base for providers that speak the OpenAI chat-completions API.

OpenAI, Ollama, and Microsoft Foundry Local all expose the same
`/v1/chat/completions` request shape, so the call logic lives here once. Each
concrete provider (foundry_local.py, ollama.py, openai.py) only supplies its
connection — base URL, API key, model — and inherits these methods.
"""

from __future__ import annotations

from collections.abc import Iterator

from openai import OpenAI  # the installed SDK (absolute import, not the sibling openai.py)

from core.llm.base import LLMProvider, Message


class OpenAICompatibleProvider(LLMProvider):
    """Talks to any OpenAI-compatible endpoint. Subclasses set the connection."""

    def __init__(self, *, base_url: str | None, api_key: str, model: str) -> None:
        self._base_url = base_url or None
        self._api_key = api_key or "not-needed"  # local servers ignore the key
        self._model = model

    @property
    def model(self) -> str:
        return self._model

    def _client(self) -> OpenAI:
        kwargs: dict[str, object] = {"api_key": self._api_key}
        if self._base_url:  # omit → SDK uses api.openai.com
            kwargs["base_url"] = self._base_url
        return OpenAI(**kwargs)

    def complete(self, messages, *, temperature=0.7, max_tokens=None) -> str:
        response = self._client().chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    def stream(self, messages, *, temperature=0.7) -> Iterator[str]:
        for chunk in self._client().chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=temperature,
            stream=True,
        ):
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
