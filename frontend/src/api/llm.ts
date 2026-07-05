import { client } from "./client";
import type { LLMProviderId } from "./types";

export interface ModelsResult {
  provider: LLMProviderId;
  models: string[];
  error: string | null;
}

/** Discover models for a provider — installed local models, or cloud models when a key is set. */
export async function listModels(provider: LLMProviderId, baseUrl?: string): Promise<ModelsResult> {
  const { data } = await client.get<ModelsResult>("/llm/models", {
    params: { provider, ...(baseUrl != null ? { base_url: baseUrl } : {}) },
  });
  return data;
}
