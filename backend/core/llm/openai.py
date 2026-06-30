"""OpenAI — cloud, OpenAI-compatible. Self-contained.

Uses the `openai_api_key` setting and the default api.openai.com endpoint
(`llm_base_url` is ignored here so a leftover local URL can't misroute the call).
`llm_model` is e.g. "gpt-4o".

Cloud provider — prompts leave the user's machine. See the project brief.
"""

from __future__ import annotations

from collections.abc import Iterator

from openai import OpenAI  # the installed SDK (absolute import, not this module)

from core.llm.base import LLMProvider, Message


class OpenAIProvider(LLMProvider):
    provider_id = "openai"

    def __init__(self, settings: dict) -> None:
        self._model = settings["llm_model"]
        self._client = OpenAI(api_key=settings["openai_api_key"] or "not-set")

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
