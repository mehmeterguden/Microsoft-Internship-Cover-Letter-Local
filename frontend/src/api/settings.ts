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
