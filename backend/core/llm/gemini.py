"""Google Gemini — cloud, native GenAI API.

Gemini's API also differs from the OpenAI shape: roles are "user"/"model", the
system prompt goes in the request config, and content is a list of typed parts.
This module adapts our uniform interface to it.

Note: this is a cloud provider — prompts leave the user's machine. See the LLM
provider note in the project brief.
"""

from __future__ import annotations

from collections.abc import Iterator

from google import genai
from google.genai import types

from core.llm.base import LLMProvider, Message


def _to_gemini(messages: list[Message]) -> tuple[str | None, list[types.Content]]:
    """Adapt our messages to Gemini's (system_instruction, contents) shape."""
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    contents = [
        types.Content(
            role="model" if m["role"] == "assistant" else "user",
            parts=[types.Part(text=m["content"])],
        )
        for m in messages
        if m["role"] != "system"
    ]
    system = "\n\n".join(system_parts) if system_parts else None
    return system, contents


class GeminiProvider(LLMProvider):
    provider_id = "gemini"

    def __init__(self, settings: dict) -> None:
        self._api_key = settings["gemini_api_key"]
        self._model = settings["llm_model"]

    @property
    def model(self) -> str:
        return self._model

    def _client(self) -> genai.Client:
        return genai.Client(api_key=self._api_key)

    def complete(self, messages, *, temperature=0.7, max_tokens=None) -> str:
        system, contents = _to_gemini(messages)
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            system_instruction=system,
        )
        response = self._client().models.generate_content(
            model=self._model, contents=contents, config=config
        )
        return response.text or ""

    def stream(self, messages, *, temperature=0.7) -> Iterator[str]:
        system, contents = _to_gemini(messages)
        config = types.GenerateContentConfig(temperature=temperature, system_instruction=system)
        for chunk in self._client().models.generate_content_stream(
            model=self._model, contents=contents, config=config
        ):
            if chunk.text:
                yield chunk.text
