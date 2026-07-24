"""LLM provider registry + gateway.

Reads the configured provider from the DB `settings` table on every call and
delegates to the matching backend, so switching provider/model/keys from the
frontend takes effect immediately and the rest of the app calls one stable API:
`llm.complete(...)`, `llm.stream(...)`, `llm.health()`.

This module is the single metering boundary for the whole app:

  • Usage metering — every call is timed and recorded (provider, model, estimated
    tokens, latency, estimated cost) into `llm_runs`, and an in-flight counter
    powers the live "AI working" meter. See `core/llm_metrics.py`.

Messages are sent to the provider as-is; no redaction is applied.
"""

from __future__ import annotations

import time
from collections.abc import Iterator

from core import llm_metrics
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


def _build(settings: dict) -> tuple[LLMProvider, str, str, bool]:
    """Build the configured provider and return (provider, provider_id, model, is_cloud)."""
    provider_id = settings.get("llm_provider", "foundry_local")
    provider_cls = PROVIDERS.get(provider_id)
    if provider_cls is None:
        raise ValueError(f"Unknown LLM provider: {provider_id!r}")
    provider = provider_cls(settings)
    return provider, provider_id, provider.model, provider_id not in llm_metrics.LOCAL_PROVIDERS


def get_provider() -> LLMProvider:
    """Build the provider chosen in settings (used by health checks)."""
    return _build(queries.get_settings())[0]


def _prepare(messages: list[Message]) -> tuple[LLMProvider, str, str, list[Message]]:
    """Resolve the configured provider and return it with the original messages."""
    settings = queries.get_settings()
    provider, provider_id, model, _ = _build(settings)
    return provider, provider_id, model, messages


def complete(
    messages: list[Message],
    *,
    temperature: float = 0.7,
    max_tokens: int | None = None,
    response_format: ResponseFormat = None,
) -> str:
    """Full reply — metered."""
    provider, provider_id, model, outgoing = _prepare(messages)
    llm_metrics.begin()
    start = time.perf_counter()
    reply: str | None = None
    try:
        reply = provider.complete(
            outgoing, temperature=temperature, max_tokens=max_tokens, response_format=response_format
        )
        return reply
    finally:
        llm_metrics.end()
        if reply is not None:
            latency_ms = (time.perf_counter() - start) * 1000
            llm_metrics.record(provider_id, model, outgoing, reply, latency_ms, "complete")


def stream(
    messages: list[Message],
    *,
    temperature: float = 0.7,
    response_format: ResponseFormat = None,
) -> Iterator[str]:
    """Token stream — metered; tokens still flush as they arrive."""
    provider, provider_id, model, outgoing = _prepare(messages)

    def gen() -> Iterator[str]:
        llm_metrics.begin()
        start = time.perf_counter()
        parts: list[str] = []
        try:
            for token in provider.stream(outgoing, temperature=temperature, response_format=response_format):
                parts.append(token)
                yield token
        finally:
            llm_metrics.end()
            latency_ms = (time.perf_counter() - start) * 1000
            llm_metrics.record(provider_id, model, outgoing, "".join(parts), latency_ms, "stream")

    return gen()


def health() -> dict[str, object]:
    return get_provider().health()
