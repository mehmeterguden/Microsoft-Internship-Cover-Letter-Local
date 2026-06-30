"""LLM provider registry.

Reads the configured provider from the DB `settings` table on every call and
delegates to the matching backend. So switching provider/model/keys from the
frontend takes effect immediately, and the rest of the app calls one stable API:
`llm.complete(...)`, `llm.stream(...)`, `llm.health()`.
"""

from __future__ import annotations

from core.llm.anthropic import ClaudeProvider
from core.llm.base import LLMProvider, Message
from core.llm.foundry_local import FoundryLocalProvider
from core.llm.gemini import GeminiProvider
from core.llm.ollama import OllamaProvider
from core.llm.openai import OpenAIProvider
from db import queries

# provider_id (stored in settings.llm_provider) → provider class.
PROVIDERS: dict[str, type[LLMProvider]] = {
    "foundry_local": FoundryLocalProvider,
    "ollama": OllamaProvider,
    "openai": OpenAIProvider,
    "anthropic": ClaudeProvider,
    "gemini": GeminiProvider,
}


def get_provider() -> LLMProvider:
    """Build the provider chosen in settings, from current settings."""
    settings = queries.get_settings()
    provider_id = settings.get("llm_provider", "foundry_local")
    provider_cls = PROVIDERS.get(provider_id)
    if provider_cls is None:
        raise ValueError(f"Unknown LLM provider: {provider_id!r}")
    return provider_cls(settings)


def complete(messages: list[Message], **kwargs) -> str:
    return get_provider().complete(messages, **kwargs)


def stream(messages: list[Message], **kwargs):
    return get_provider().stream(messages, **kwargs)


def health() -> dict[str, object]:
    return get_provider().health()
