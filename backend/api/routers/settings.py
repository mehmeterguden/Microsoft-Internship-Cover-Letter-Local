"""Settings endpoints — user-editable runtime config (singleton).

Replaces the old `.env`: the LLM endpoint/model and API tokens live in the DB and
are changed from the frontend. The row always exists (seeded at init).

    GET    /settings                       current settings
    PUT    /settings                       replace settings

Gemini key pool — each action persists immediately (survives a page reload),
independent of the main "Save settings" button:

    GET    /settings/gemini-keys           the pool + active key + switch mode
    POST   /settings/gemini-keys           add a key
    DELETE /settings/gemini-keys/{key_id}  remove a key
    PUT    /settings/gemini-keys/active    manually select the active key
    PUT    /settings/gemini-keys/mode      auto-rotate vs manual on rate limit
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from db import queries
from models import AzureAccountConfig, GeminiKeyConfig, KeySwitchMode, Settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=Settings)
def get_settings() -> Settings:
    """Return the current settings."""
    return Settings(**queries.get_settings())


# The Gemini key pool & Azure accounts pool are owned by their dedicated endpoints below.
# The general Save must not touch these columns.
_POOL_OWNED = {
    "gemini_api_keys",
    "gemini_active_key_id",
    "key_switch_mode",
    "azure_accounts",
    "azure_active_account_id",
}


@router.put("", response_model=Settings)
def update_settings(settings: Settings) -> Settings:
    """Replace settings with the submitted values (except the pool-owned columns)."""
    queries.save_settings(settings.model_dump(mode="json", exclude=_POOL_OWNED))
    return Settings(**queries.get_settings())


# ── Gemini key pool ──────────────────────────────────────────────

class GeminiKeyCreate(BaseModel):
    key: str = Field(..., min_length=1, description="The Gemini API key")
    label: str = Field("", description="Optional human name for the key")


class ActiveKeyUpdate(BaseModel):
    key_id: str


class SwitchModeUpdate(BaseModel):
    mode: KeySwitchMode


@router.get("/gemini-keys", response_model=GeminiKeyConfig)
def get_gemini_keys() -> GeminiKeyConfig:
    """Return the Gemini key pool, the active key, and the switch mode."""
    return GeminiKeyConfig(**queries.gemini_key_config())


@router.post("/gemini-keys", response_model=GeminiKeyConfig)
def add_gemini_key(body: GeminiKeyCreate) -> GeminiKeyConfig:
    """Add a key to the pool. The first key added becomes active. Duplicate keys
    are ignored. Returns the updated pool."""
    return GeminiKeyConfig(**queries.add_gemini_key(body.key, body.label))


@router.delete("/gemini-keys/{key_id}", response_model=GeminiKeyConfig)
def remove_gemini_key(key_id: str) -> GeminiKeyConfig:
    """Remove a key from the pool. If it was active, the pointer moves to the
    first remaining key. Returns the updated pool."""
    return GeminiKeyConfig(**queries.remove_gemini_key(key_id))


@router.put("/gemini-keys/active", response_model=GeminiKeyConfig)
def set_active_gemini_key(body: ActiveKeyUpdate) -> GeminiKeyConfig:
    """Manually select which key is active (used in manual mode)."""
    return GeminiKeyConfig(**queries.set_gemini_active_key(body.key_id))


@router.put("/gemini-keys/mode", response_model=GeminiKeyConfig)
def set_switch_mode(body: SwitchModeUpdate) -> GeminiKeyConfig:
    """Set what happens when the active key hits its limit: 'auto' or 'manual'."""
    return GeminiKeyConfig(**queries.set_key_switch_mode(body.mode))


# ── Azure AI Foundry / Azure OpenAI Accounts Pool ─────────────────────

class AzureAccountCreate(BaseModel):
    endpoint: str = Field(..., min_length=1, description="Azure OpenAI / Foundry resource endpoint")
    api_key: str = Field(..., min_length=1, description="Resource API key")
    model: str = Field(..., min_length=1, description="Deployment model name (e.g. gpt-5-mini, o3-mini)")
    label: str = Field("", description="Optional label for the account")
    api_version: str = Field("2024-10-21", description="REST API version")


class ActiveAzureAccountUpdate(BaseModel):
    account_id: str


@router.get("/azure-accounts", response_model=AzureAccountConfig)
def get_azure_accounts() -> AzureAccountConfig:
    """Return the Azure AI Foundry accounts pool and active account ID."""
    return AzureAccountConfig(**queries.azure_account_config())


@router.post("/azure-accounts", response_model=AzureAccountConfig)
def add_azure_account(body: AzureAccountCreate) -> AzureAccountConfig:
    """Add an Azure account configuration to the pool."""
    return AzureAccountConfig(**queries.add_azure_account(
        endpoint=body.endpoint,
        api_key=body.api_key,
        model=body.model,
        label=body.label,
        api_version=body.api_version,
    ))


@router.delete("/azure-accounts/{account_id}", response_model=AzureAccountConfig)
def remove_azure_account(account_id: str) -> AzureAccountConfig:
    """Remove an Azure account from the pool."""
    return AzureAccountConfig(**queries.remove_azure_account(account_id))


@router.put("/azure-accounts/active", response_model=AzureAccountConfig)
def set_active_azure_account(body: ActiveAzureAccountUpdate) -> AzureAccountConfig:
    """Set the active Azure account in the pool."""
    return AzureAccountConfig(**queries.set_azure_active_account(body.account_id))
