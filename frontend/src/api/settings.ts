import { client } from "./client";
import type { Settings } from "./types";

export async function getSettings(): Promise<Settings> {
  const { data } = await client.get<Settings>("/settings");
  return data;
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const { data } = await client.put<Settings>("/settings", settings);
  return data;
}
