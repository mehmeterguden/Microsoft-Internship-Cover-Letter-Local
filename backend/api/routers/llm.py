"""LLM endpoints — check the model is reachable and try a prompt.

Generation features (cover-letter streaming, CV extraction, repo analysis) are
added in later phases. For now this exposes:
  • GET  /llm/health   is the configured model reachable?
  • POST /llm/chat      send a message, get the full reply (handy from /docs)
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from core import llm, llm_metrics
from core.llm import azure_openai, foundry_local
from core.llm.gemini import effective_key
from db import queries

router = APIRouter(prefix="/llm", tags=["llm"])


def _get_json(url: str, headers: dict[str, str] | None = None, timeout: float = 5.0) -> dict:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — user-configured URL
        return json.loads(resp.read().decode("utf-8"))


def _discover_models(provider: str, base_url: str, settings: dict) -> tuple[list[str], str | None]:
    """Return (models, error): live-lists installed local models, or cloud models
    when a key is set. `error` is a human message when discovery isn't possible."""
    base = (base_url or "").rstrip("/")
    try:
        if provider == "ollama":
            root = base[:-3].rstrip("/") if base.endswith("/v1") else base  # tags API is at the root
            data = _get_json(f"{root}/api/tags")
            return sorted(m["name"] for m in data.get("models", [])), None
        if provider == "foundry_local":
            data = _get_json(f"{base}/models")  # OpenAI-compatible listing
            return sorted(m["id"] for m in data.get("data", [])), None
        if provider == "openai":
            key = settings.get("openai_api_key") or ""
            if not key:
                return [], "Add your OpenAI API key to list models."
            data = _get_json("https://api.openai.com/v1/models", {"Authorization": f"Bearer {key}"})
            return sorted(m["id"] for m in data.get("data", []) if "gpt" in m["id"] or m["id"].startswith("o")), None
        if provider == "anthropic":
            key = settings.get("anthropic_api_key") or ""
            if not key:
                return [], "Add your Anthropic API key to list models."
            data = _get_json("https://api.anthropic.com/v1/models", {"x-api-key": key, "anthropic-version": "2023-06-01"})
            return [m["id"] for m in data.get("data", [])], None
        if provider == "gemini":
            key = effective_key(settings)
            if not key:
                return [], "Add your Gemini API key to list models."
            data = _get_json(f"https://generativelanguage.googleapis.com/v1beta/models?key={key}")
            names = [m["name"].split("/")[-1] for m in data.get("models", [])
                     if "generateContent" in m.get("supportedGenerationMethods", [])]
            return sorted(n for n in names if n.startswith("gemini")), None
        if provider == "azure_openai":
            v1 = azure_openai.v1_base_url(settings.get("azure_openai_endpoint") or "")
            key = settings.get("azure_openai_api_key") or ""
            if not v1 or not key:
                return [], "Add your Azure OpenAI endpoint and key to list models."
            # The v1 surface lists models the resource can serve. You call them by
            # your *deployment* name (usually the same); enter it in the Model field.
            data = _get_json(f"{v1}/models", {"api-key": key})
            ids = [
                m["id"] for m in data.get("data", [])
                if m.get("id") and (m.get("capabilities") or {}).get("inference")
                and m.get("lifecycle_status") != "deprecated"
            ]
            return sorted(set(ids)), None
    except (urllib.error.URLError, TimeoutError, OSError):
        return [], f"Couldn't reach {provider} at {base or provider}. Is it running?"
    except Exception as exc:  # noqa: BLE001 — surface parse/HTTP issues to the UI
        return [], f"Could not list models ({type(exc).__name__})."
    return [], None


@router.get("/models")
def list_models(provider: str | None = None, base_url: str | None = None) -> dict[str, object]:
    """List models for a provider — installed local models, or cloud models when a
    key is configured. Returns an `error` message when discovery isn't possible."""
    settings = queries.get_settings()
    prov = provider or settings["llm_provider"]
    base = base_url if base_url is not None else settings["llm_base_url"]
    models, error = _discover_models(prov, base, settings)
    return {"provider": prov, "models": models, "error": error}


# ── Foundry Local model management (Microsoft-first on-device path) ──

@router.get("/foundry/models")
def foundry_models(base_url: str | None = None) -> dict[str, object]:
    """The Foundry Local model surface for Settings: what's installed on-device now,
    the downloadable catalog, and whether one-click download is available (SDK)."""
    settings = queries.get_settings()
    base = base_url if base_url is not None else settings["llm_base_url"]
    installed, error = _discover_models("foundry_local", base, settings)
    catalog, from_sdk = foundry_local.catalog_models()
    return {
        "installed": installed,
        "catalog": catalog,
        "can_download": foundry_local.sdk_available(),
        "catalog_live": from_sdk,   # False -> curated fallback (SDK/service absent)
        "error": error,             # non-null when the local server isn't reachable
    }


class FoundryDownloadRequest(BaseModel):
    alias: str = Field(..., min_length=1, description="Foundry model alias to download")


@router.post("/foundry/download")
def foundry_download(req: FoundryDownloadRequest) -> dict[str, object]:
    """Download a Foundry Local model by alias (needs the Foundry Local SDK).

    Sync `def` so FastAPI runs the (potentially long) download in its threadpool.
    Returns the updated installed list; 400 with guidance when the SDK is absent."""
    try:
        installed = foundry_local.download_model(req.alias)
    except RuntimeError as exc:  # SDK missing -> actionable message
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — surface a download/service failure
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail=f"Download failed ({type(exc).__name__}): {exc}"
        ) from exc
    return {"alias": req.alias, "installed": installed}


class ChatRequest(BaseModel):
    """A one-off prompt for manual testing from /docs."""

    message: str = Field(..., description="Your message to the model")
    system: str | None = Field(None, description="Optional system instruction")
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int | None = Field(None, gt=0, description="Cap the reply length")


class ChatResponse(BaseModel):
    reply: str
    model: str


@router.get("/health")
def llm_health() -> dict[str, object]:
    """Ping the configured model; report ok/model/base_url/detail."""
    return llm.health()


@router.post("/chat", response_model=ChatResponse)
def llm_chat(req: ChatRequest) -> ChatResponse:
    """Send a message to the model and return its full reply.

    Use this from /docs to sanity-check the LLM: type a message, Execute, read the
    reply. 502 if Foundry Local is unreachable (start it and try again).
    """
    messages: list[dict[str, str]] = []
    if req.system:
        messages.append({"role": "system", "content": req.system})
    messages.append({"role": "user", "content": req.message})

    try:
        reply = llm.complete(messages, temperature=req.temperature, max_tokens=req.max_tokens)
    except Exception as exc:  # noqa: BLE001 — surface the upstream error to the caller
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM request failed ({type(exc).__name__}): {exc}",
        ) from exc

    return ChatResponse(reply=reply, model=queries.get_settings()["llm_model"])


@router.get("/usage")
def llm_usage(limit: int = 20) -> dict[str, object]:
    """Recent LLM runs, today's totals, and whether any call is in flight.

    Powers the global "AI usage" meter. `running` > 0 means a generation is
    currently streaming/completing (covers SSE calls too, via the gateway's
    in-flight counter)."""
    recent = queries.recent_llm_runs(limit)
    return {
        "running": llm_metrics.running(),
        "recent": recent,
        "last": recent[0] if recent else None,
        "today": queries.llm_usage_today(),
    }
