"""Microsoft Foundry Local — on-device model management (list / download / health).

Foundry Local runs models on the user's machine via ONNX Runtime, exposing an
OpenAI-compatible HTTP API. This module powers the Settings "on-device models"
panel without adding a hard dependency:

  • Installed models are read over HTTP (the OpenAI-compatible `/models` listing),
    so they work whenever the Foundry service is running — no SDK required.
  • The catalog (what you *could* download) and one-click downloads use the optional
    `foundry-local-sdk`. When it isn't installed we fall back to a curated list and
    the UI shows the `foundry model download <alias>` CLI command instead.

Everything here is best-effort and never raises to the caller except an explicit,
friendly error when a download is requested without the SDK.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

# Common Foundry Local aliases, shown when the SDK's live catalog isn't available
# so the user still sees what they can pull (and the CLI command to do it).
_CATALOG_FALLBACK = [
    "phi-4",
    "phi-4-mini",
    "phi-3.5-mini",
    "qwen2.5-7b-instruct",
    "qwen2.5-1.5b-instruct",
    "mistral-7b-instruct-v0.3",
    "deepseek-r1-7b",
]


def _get_json(url: str, timeout: float = 5.0) -> dict:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — user-configured local URL
        return json.loads(resp.read().decode("utf-8"))


def list_installed(base_url: str) -> tuple[list[str], str | None]:
    """Models Foundry Local is serving right now, via its OpenAI-compatible listing.

    Returns (models, error). `error` is a friendly message when the service can't
    be reached — the panel stays usable and the user can still pick a model name.
    """
    base = (base_url or "").rstrip("/")
    try:
        data = _get_json(f"{base}/models")
        return sorted(m["id"] for m in data.get("data", [])), None
    except (urllib.error.URLError, TimeoutError, OSError):
        return [], "Couldn't reach Foundry Local. Is the service running?"
    except Exception as exc:  # noqa: BLE001 — surface parse/HTTP issues to the UI
        return [], f"Could not list models ({type(exc).__name__})."


def sdk_available() -> bool:
    """Whether the optional `foundry-local-sdk` is importable (enables downloads)."""
    try:
        import foundry_local  # noqa: F401
    except Exception:  # noqa: BLE001 — any import failure means "not available"
        return False
    return True


def catalog() -> tuple[list[str], bool]:
    """(aliases, live). The SDK's live catalog when present, else the curated list."""
    if sdk_available():
        try:
            from foundry_local import FoundryLocalManager

            manager = FoundryLocalManager()
            models = manager.list_catalog_models()
            aliases = sorted({getattr(m, "alias", None) or getattr(m, "id", "") for m in models} - {""})
            if aliases:
                return aliases, True
        except Exception:  # noqa: BLE001 — fall back to the curated list on any SDK error
            pass
    return list(_CATALOG_FALLBACK), False


def models_overview(base_url: str) -> dict[str, object]:
    """Everything the Settings panel needs in one call."""
    installed, error = list_installed(base_url)
    cat, live = catalog()
    return {
        "installed": installed,
        "catalog": cat,
        "catalog_live": live,
        "can_download": sdk_available(),
        "error": error,
    }


def download(alias: str) -> None:
    """Download a model on-device via the SDK. Raises a friendly error without it."""
    if not sdk_available():
        raise RuntimeError(
            "The foundry-local-sdk isn't installed, so downloads can't run from here. "
            "Install it (pip install foundry-local-sdk) or run: foundry model download "
            f"{alias}"
        )
    from foundry_local import FoundryLocalManager

    manager = FoundryLocalManager()
    manager.download_model(alias)
