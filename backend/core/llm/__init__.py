"""LLM provider registry.

Reads the configured provider from the DB `settings` table on every call and
delegates to the matching backend. So switching provider/model/keys from the
frontend takes effect immediately, and the rest of the app calls one stable API:
`llm.complete(...)`, `llm.stream(...)`, `llm.health()`.
"""

from __future__ import annotations

from core.llm.anthropic import ClaudeProvider
from core.llm.azure_openai import AzureOpenAIProvider
from core.llm.base import LLMProvider, Message, ResponseFormat
from core.llm.foundry_local import FoundryLocalProvider
from core.llm.gemini import GeminiProvider
from core.llm.lm_studio import LMStudioProvider
from core.llm.ollama import OllamaProvider
from core.llm.openai import OpenAIProvider
from db import queries

# provider_id (stored in settings.llm_provider) → provider class. Microsoft
# providers (Foundry Local — on-device, private; Azure OpenAI — cloud) lead; the
# rest are fully supported for users who prefer them.
PROVIDERS: dict[str, type[LLMProvider]] = {
    "foundry_local": FoundryLocalProvider,
    "azure_openai": AzureOpenAIProvider,
    "ollama": OllamaProvider,
    "lm_studio": LMStudioProvider,
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


def complete(
    messages: list[Message],
    *,
    temperature: float = 0.7,
    max_tokens: int | None = None,
    response_format: ResponseFormat = None,
) -> str:
    return get_provider().complete(
        messages, temperature=temperature, max_tokens=max_tokens, response_format=response_format
    )


def stream(
    messages: list[Message],
    *,
    temperature: float = 0.7,
    response_format: ResponseFormat = None,
):
    return get_provider().stream(messages, temperature=temperature, response_format=response_format)


def health() -> dict[str, object]:
    return get_provider().health()
