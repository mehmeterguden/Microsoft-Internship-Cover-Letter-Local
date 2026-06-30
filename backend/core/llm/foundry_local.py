"""Microsoft Foundry Local — local, OpenAI-compatible. The project default.

Runs on the user's machine; no API key. The user sets `llm_base_url` (Foundry's
dynamic port, e.g. http://127.0.0.1:5273/v1) and `llm_model` (the full model id).
"""

from __future__ import annotations

from core.llm._openai_compatible import OpenAICompatibleProvider


class FoundryLocalProvider(OpenAICompatibleProvider):
    provider_id = "foundry_local"

    def __init__(self, settings: dict) -> None:
        super().__init__(base_url=settings["llm_base_url"], api_key="", model=settings["llm_model"])
