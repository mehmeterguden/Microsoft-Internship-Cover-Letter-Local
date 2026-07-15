"""LM Studio — local, OpenAI-compatible. Self-contained.

LM Studio runs an OpenAI-compatible server on the user's machine (default
http://localhost:1234/v1); no API key. The user sets `llm_base_url` and
`llm_model` (the loaded model id) in settings. Same shape as Foundry Local.
"""

from __future__ import annotations

from collections.abc import Iterator

from openai import OpenAI

from core.llm.base import LLMProvider, Message


class LMStudioProvider(LLMProvider):
    provider_id = "lm_studio"

    def __init__(self, settings: dict) -> None:
        self._model = settings["llm_model"]
        # LM Studio ignores the key but the OpenAI client requires a non-empty one.
        self._client = OpenAI(base_url=settings["llm_base_url"], api_key="lm-studio")

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
