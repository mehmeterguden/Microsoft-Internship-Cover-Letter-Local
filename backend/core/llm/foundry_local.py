"""Microsoft Foundry Local — the default, on-device provider. Self-contained.

Foundry Local runs open models on the user's machine via ONNX Runtime, exposing an
OpenAI-compatible HTTP API — so no API key, no data leaving the device, and the
same request shape as OpenAI. The user sets `llm_base_url` (Foundry's port, e.g.
http://127.0.0.1:5273/v1) and `llm_model` (the model id/alias).

This module also exposes a small model-management surface (catalog / installed /
download) used by the Settings page. Those helpers use the optional
`foundry-local-sdk` when it's installed and degrade gracefully when it isn't:
installed models are read straight from the OpenAI-compatible `/models` endpoint
(no SDK needed), and a curated catalog is offered as a fallback.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from openai import OpenAI

from core.llm.base import LLMProvider, Message, ResponseFormat

# Bound requests so a stalled local server can't hang the app indefinitely.
_TIMEOUT = 600.0  # seconds — first token on a cold local model can be slow

# Common Foundry Local aliases, shown when the SDK isn't present to list the live
# catalog. Foundry resolves an alias to the best variant for the user's hardware.
CURATED_CATALOG = (
    "phi-4",
    "phi-4-mini",
    "phi-3.5-mini",
    "qwen2.5-7b-instruct",
    "qwen2.5-1.5b-instruct",
    "qwen2.5-coder-7b-instruct",
    "mistral-7b-instruct-v0.3",
    "deepseek-r1-7b",
)


class FoundryLocalProvider(LLMProvider):
    provider_id = "foundry_local"

    def __init__(self, settings: dict) -> None:
        self._model = settings["llm_model"]
        self._client = OpenAI(
            base_url=settings["llm_base_url"], api_key="not-needed", timeout=_TIMEOUT
        )

    @property
    def model(self) -> str:
        return self._model

    def complete(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        response_format: ResponseFormat = None,
    ) -> str:
        kwargs: dict[str, object] = {}
        if response_format:  # OpenAI-compatible; passed through when the user opts in
            kwargs["response_format"] = response_format
        response = self._client.chat.completions.create(
            model=self._model, messages=messages, temperature=temperature, max_tokens=max_tokens, **kwargs
        )
        return response.choices[0].message.content or ""

    def stream(
        self, messages: list[Message], *, temperature: float = 0.7, response_format: ResponseFormat = None
    ) -> Iterator[str]:
        kwargs: dict[str, object] = {}
        if response_format:
            kwargs["response_format"] = response_format
        for chunk in self._client.chat.completions.create(
            model=self._model, messages=messages, temperature=temperature, stream=True, **kwargs
        ):
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


# ─────────────────────────────────────────────────────────────
#  Model management (Settings surface) — SDK-optional
# ─────────────────────────────────────────────────────────────

def sdk_available() -> bool:
    """True if the optional `foundry-local-sdk` is importable (enables downloads)."""
    try:
        import foundry_local  # noqa: F401

        return True
    except Exception:  # noqa: BLE001 — any import failure means "not available"
        return False


def _manager() -> Any:
    """Build a FoundryLocalManager (starts/attaches to the local service). Raises if
    the SDK isn't installed or the service can't be reached."""
    from foundry_local import FoundryLocalManager

    return FoundryLocalManager()


def _model_ids(models: Any) -> list[str]:
    """Pull alias/id strings out of the SDK's model-info objects, defensively."""
    out: list[str] = []
    for m in models or []:
        alias = getattr(m, "alias", None) or getattr(m, "id", None)
        if not alias and isinstance(m, dict):
            alias = m.get("alias") or m.get("id")
        if alias:
            out.append(str(alias))
    # de-dupe, keep order
    return list(dict.fromkeys(out))


def catalog_models() -> tuple[list[str], bool]:
    """Return (aliases, from_sdk). Live catalog via the SDK when available, else the
    curated fallback list so the UI still has something to offer."""
    if sdk_available():
        try:
            models = _manager().list_catalog_models()
            ids = _model_ids(models)
            if ids:
                return sorted(ids), True
        except Exception:  # noqa: BLE001 — service down / SDK hiccup → fall back
            pass
    return list(CURATED_CATALOG), False


def download_model(alias: str) -> list[str]:
    """Download a model by alias via the SDK and return the installed aliases.

    Raises RuntimeError with actionable guidance when the SDK isn't installed."""
    if not sdk_available():
        raise RuntimeError(
            "Downloading needs the Foundry Local SDK. Install it (`pip install foundry-local-sdk`) "
            f"or run `foundry model download {alias}` in a terminal, then refresh."
        )
    manager = _manager()
    manager.download_model(alias)
    try:
        return _model_ids(manager.list_cached_models())
    except Exception:  # noqa: BLE001 — download worked; listing is best-effort
        return [alias]
