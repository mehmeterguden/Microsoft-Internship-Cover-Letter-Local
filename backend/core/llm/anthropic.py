"""Anthropic Claude — cloud, native Messages API.

Claude's API differs from the OpenAI shape: the system prompt is a separate
argument (not a message), `max_tokens` is required, and replies come back as
content blocks. This module adapts our uniform interface to it.

`import anthropic` below is absolute — it resolves to the installed SDK, not this
module (Python 3 absolute imports), even though the file is named anthropic.py.

Note: this is a cloud provider — prompts leave the user's machine. See the LLM
provider note in the project brief.
"""

from __future__ import annotations

from collections.abc import Iterator

import anthropic

from core.llm.base import LLMProvider, Message

DEFAULT_MAX_TOKENS = 4096  # Anthropic requires max_tokens; used when the caller gives none


def _split_system(messages: list[Message]) -> tuple[str | None, list[Message]]:
    """Pull system messages out — Claude takes the system prompt separately."""
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    conversation = [m for m in messages if m["role"] != "system"]
    system = "\n\n".join(system_parts) if system_parts else None
    return system, conversation


class ClaudeProvider(LLMProvider):
    provider_id = "anthropic"

    def __init__(self, settings: dict) -> None:
        self._api_key = settings["anthropic_api_key"]
        self._model = settings["llm_model"]

    @property
    def model(self) -> str:
        return self._model

    def _client(self) -> anthropic.Anthropic:
        return anthropic.Anthropic(api_key=self._api_key)

    def complete(self, messages, *, temperature=0.7, max_tokens=None) -> str:
        system, conversation = _split_system(messages)
        kwargs: dict[str, object] = {
            "model": self._model,
            "max_tokens": max_tokens or DEFAULT_MAX_TOKENS,
            "messages": conversation,
        }
        if system:
            kwargs["system"] = system
        response = self._client().messages.create(**kwargs)
        return "".join(block.text for block in response.content if block.type == "text")

    def stream(self, messages, *, temperature=0.7) -> Iterator[str]:
        system, conversation = _split_system(messages)
        kwargs: dict[str, object] = {
            "model": self._model,
            "max_tokens": DEFAULT_MAX_TOKENS,
            "messages": conversation,
        }
        if system:
            kwargs["system"] = system
        with self._client().messages.stream(**kwargs) as stream:
            yield from stream.text_stream
