import { client } from "./client";
import type { AzureAccountConfig, GeminiKeyConfig, KeySwitchMode, Settings } from "./types";

export async function getSettings(): Promise<Settings> {
  const { data } = await client.get<Settings>("/settings");
  return data;
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const { data } = await client.put<Settings>("/settings", settings);
  return data;
}

// ── Gemini key pool ───────────────────────────────────────────────
// Each call persists a single change to the DB immediately (survives reload),
// independent of the main "Save" button. All return the updated pool.

export async function getGeminiKeys(): Promise<GeminiKeyConfig> {
  const { data } = await client.get<GeminiKeyConfig>("/settings/gemini-keys");
  return data;
}

export async function addGeminiKey(key: string, label = ""): Promise<GeminiKeyConfig> {
  const { data } = await client.post<GeminiKeyConfig>("/settings/gemini-keys", { key, label });
  return data;
}

export async function removeGeminiKey(id: string): Promise<GeminiKeyConfig> {
  const { data } = await client.delete<GeminiKeyConfig>(`/settings/gemini-keys/${id}`);
  return data;
}

export async function setGeminiActiveKey(id: string): Promise<GeminiKeyConfig> {
  const { data } = await client.put<GeminiKeyConfig>("/settings/gemini-keys/active", { key_id: id });
  return data;
}

export async function setKeySwitchMode(mode: KeySwitchMode): Promise<GeminiKeyConfig> {
  const { data } = await client.put<GeminiKeyConfig>("/settings/gemini-keys/mode", { mode });
  return data;
}

// ── Azure AI Foundry Accounts pool ────────────────────────────

export async function getAzureAccounts(): Promise<AzureAccountConfig> {
  const { data } = await client.get<AzureAccountConfig>("/settings/azure-accounts");
  return data;
}

export async function addAzureAccount(
  endpoint: string,
  apiKey: string,
  model: string,
  label = "",
  apiVersion = "2024-10-21",
): Promise<AzureAccountConfig> {
  const { data } = await client.post<AzureAccountConfig>("/settings/azure-accounts", {
    endpoint,
    api_key: apiKey,
    model,
    label,
    api_version: apiVersion,
  });
  return data;
}

export async function removeAzureAccount(id: string): Promise<AzureAccountConfig> {
  const { data } = await client.delete<AzureAccountConfig>(`/settings/azure-accounts/${id}`);
  return data;
}

export async function updateAzureAccount(
  id: string,
  updates: { endpoint?: string; api_key?: string; model?: string; label?: string; api_version?: string },
): Promise<AzureAccountConfig> {
  const { data } = await client.put<AzureAccountConfig>(`/settings/azure-accounts/${id}`, updates);
  return data;
}

export async function setAzureActiveAccount(id: string): Promise<AzureAccountConfig> {
  const { data } = await client.put<AzureAccountConfig>("/settings/azure-accounts/active", { account_id: id });
  return data;
}

// ── Foundry Local model management ────────────────────────────
// The on-device Microsoft path: list installed + downloadable models, and (when
// the Foundry Local SDK is present) download one with a single click.

export interface FoundryModels {
  installed: string[];
  catalog: string[];
  can_download: boolean; // true when the Foundry Local SDK is installed
  catalog_live: boolean; // false → curated fallback list (SDK/service absent)
  error: string | null; // set when the local server isn't reachable
}

export async function getFoundryModels(baseUrl?: string): Promise<FoundryModels> {
  const { data } = await client.get<FoundryModels>("/llm/foundry/models", {
    params: baseUrl != null ? { base_url: baseUrl } : undefined,
  });
  return data;
}

export async function downloadFoundryModel(alias: string): Promise<{ alias: string; installed: string[] }> {
  const { data } = await client.post<{ alias: string; installed: string[] }>("/llm/foundry/download", { alias });
  return data;
}
