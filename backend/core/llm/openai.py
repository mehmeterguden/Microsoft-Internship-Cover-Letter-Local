"""OpenAI — cloud, OpenAI-compatible.

Uses the `openai_api_key` setting and talks to api.openai.com (the default base
URL — `llm_base_url` is ignored here so a leftover local URL can't misroute the
request). `llm_model` is e.g. "gpt-4o".

Note: this is a cloud provider — prompts leave the user's machine. See the LLM
provider note in the project brief.
"""

from __future__ import annotations

from core.llm._openai_compatible import OpenAICompatibleProvider


class OpenAIProvider(OpenAICompatibleProvider):
    provider_id = "openai"

    def __init__(self, settings: dict) -> None:
        super().__init__(base_url=None, api_key=settings["openai_api_key"], model=settings["llm_model"])
