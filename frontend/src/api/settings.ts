import { client } from "./client";
import type { GeminiKeyConfig, KeySwitchMode, Settings } from "./types";

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

// ── Foundry Local on-device models ────────────────────────────────
// Foundry Local runs models on the user's machine via ONNX Runtime. `installed`
// is read over its OpenAI-compatible HTTP API; `catalog`/downloads use the optional
// foundry-local-sdk (when absent, `can_download` is false and the UI shows the CLI).

export interface FoundryModels {
  installed: string[];
  catalog: string[];
  /** True when the catalog came live from the SDK (vs. the curated fallback list). */
  catalog_live: boolean;
  /** Whether one-click downloads are possible (foundry-local-sdk present). */
  can_download: boolean;
  /** Friendly message when the Foundry service can't be reached; null when healthy. */
  error: string | null;
}

/** Installed on-device models plus the downloadable catalog for Foundry Local. */
export async function getFoundryModels(baseUrl?: string): Promise<FoundryModels> {
  const { data } = await client.get<FoundryModels>("/llm/foundry/models", {
    params: baseUrl != null ? { base_url: baseUrl } : {},
  });
  return data;
}

/** Download a catalog model on-device (requires the foundry-local-sdk). */
export async function downloadFoundryModel(alias: string): Promise<FoundryModels> {
  const { data } = await client.post<FoundryModels>("/llm/foundry/download", { alias });
  return data;
}
