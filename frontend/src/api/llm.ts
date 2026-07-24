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

export interface HealthResult {
  ok: boolean;
  provider: LLMProviderId;
  model: string;
  detail: string;
}

/** Ping the configured model with a tiny prompt — a real "does this exact model
 *  respond?" check (tests the saved provider + model, not a list). Never throws
 *  for a model/auth error; those come back as `ok: false` with a `detail`. */
export async function checkHealth(): Promise<HealthResult> {
  const { data } = await client.get<HealthResult>("/llm/health");
  return data;
}
