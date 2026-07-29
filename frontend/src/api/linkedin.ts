import { API_BASE, client } from "./client";
import { streamSSERequest } from "./sse";
import type { CVExtraction } from "./types";

/** OAuth config + connection state, plus the redirect URI to register in the LinkedIn app. */
export interface LinkedinStatus {
  configured: boolean;
  connected: boolean;
  name: string;
  redirect_uri: string;
}

export async function linkedinStatus(): Promise<LinkedinStatus> {
  const { data } = await client.get<LinkedinStatus>("/linkedin/status");
  return data;
}

/** Save the LinkedIn developer app's Client ID/Secret (used by "Sign in with LinkedIn"). */
export async function saveLinkedinConfig(clientId: string, clientSecret: string): Promise<void> {
  await client.post("/linkedin/config", { client_id: clientId, client_secret: clientSecret });
}

/** Forget the stored access token (disconnect the account). */
export async function disconnectLinkedin(): Promise<void> {
  await client.delete("/linkedin/connection");
}

/** Full-page URL that kicks off the OAuth flow — navigate the browser here. */
export function oauthStartUrl(): string {
  return `${API_BASE}/linkedin/oauth/start`;
}

export interface ImportProfileResult {
  filename: string;
  ok: boolean;
  structured?: CVExtraction;
  error?: string;
  raw_output?: string;
}

export type LinkedinImportEvent =
  | { type: "meta"; filename: string; source_type: string; num_pages: number; char_count: number }
  | { type: "token"; text: string }
  | { type: "done"; ok: boolean; structured?: CVExtraction; error?: string; raw_output: string; duration_s: number }
  | { type: "fatal"; error: string };

/**
 * Upload a LinkedIn profile PDF (profile → Resources → Save to PDF) — its text is
 * extracted locally and structured by the configured model. A data-export .zip is
 * also accepted and parsed deterministically.
 */
export async function importLinkedinProfile(file: File): Promise<ImportProfileResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await client.post<ImportProfileResult>("/linkedin/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export function streamImportLinkedinProfile(
  file: File,
  onEvent: (event: LinkedinImportEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  return streamSSERequest<LinkedinImportEvent>("/linkedin/import/stream", { method: "POST", body: form }, onEvent, signal);
}

export interface ParseTextResult {
  ok: boolean;
  structured?: CVExtraction;
  error?: string;
  raw_output?: string;
}

/** Structure pasted profile text with the LLM (reuses the CV structuring pipeline). */
export async function parseLinkedinText(text: string): Promise<ParseTextResult> {
  const { data } = await client.post<ParseTextResult>("/linkedin/parse-text", { text });
  return data;
}

export interface SaveImportResult {
  ok: boolean;
  profile_fields: number;
  saved: Record<string, number>;
}

/**
 * Persist a reviewed extraction into the profile (stamped `source='linkedin'`).
 * Non-destructive: fills only blank identity fields and refreshes just the
 * LinkedIn-sourced list rows — CV / manual / GitHub data is preserved.
 */
export async function saveLinkedinImport(
  extraction: CVExtraction,
  profileUrl?: string,
  replace = true,
): Promise<SaveImportResult> {
  const params = new URLSearchParams({ replace: String(replace) });
  const { data } = await client.post<SaveImportResult>(`/linkedin/save?${params}`, {
    ...extraction,
    profile_url: profileUrl ?? null,
  });
  return data;
}
