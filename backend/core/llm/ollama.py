"""Ollama — local, OpenAI-compatible.

Runs on the user's machine; no API key. The user points `llm_base_url` at Ollama
(e.g. http://localhost:11434/v1) and sets `llm_model` (e.g. "llama3").
"""

from __future__ import annotations

from core.llm._openai_compatible import OpenAICompatibleProvider


class OllamaProvider(OpenAICompatibleProvider):
    provider_id = "ollama"

    def __init__(self, settings: dict) -> None:
        super().__init__(base_url=settings["llm_base_url"], api_key="", model=settings["llm_model"])
