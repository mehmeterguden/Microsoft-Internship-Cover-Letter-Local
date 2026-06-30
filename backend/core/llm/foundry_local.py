"""Microsoft Foundry Local — local, OpenAI-compatible. Self-contained.

Runs on the user's machine; no API key. The user sets `llm_base_url` (Foundry's
dynamic port, e.g. http://127.0.0.1:5273/v1) and `llm_model` (the full model id).
"""

from __future__ import annotations

from collections.abc import Iterator

from openai import OpenAI

from core.llm.base import LLMProvider, Message


class FoundryLocalProvider(LLMProvider):
    provider_id = "foundry_local"

    def __init__(self, settings: dict) -> None:
        self._model = settings["llm_model"]
        self._client = OpenAI(base_url=settings["llm_base_url"], api_key="not-needed")

    @property
    def model(self) -> str:
        return self._model

    def complete(self, messages: list[Message], *, temperature: float = 0.7, max_tokens: int | None = None) -> str:
        response = self._client.chat.completions.create(
            model=self._model, messages=messages, temperature=temperature, max_tokens=max_tokens
        )
        return response.choices[0].message.content or ""

    def stream(self, messages: list[Message], *, temperature: float = 0.7) -> Iterator[str]:
        for chunk in self._client.chat.completions.create(
            model=self._model, messages=messages, temperature=temperature, stream=True
        ):
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
