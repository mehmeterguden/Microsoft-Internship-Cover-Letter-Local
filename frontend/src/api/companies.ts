import { API_BASE, client } from "./client";
import type { CompanySuggestion } from "./types";

/** Company-name autocomplete. Returns [] on empty/short queries (backend-enforced). */
export async function suggestCompanies(q: string, signal?: AbortSignal): Promise<CompanySuggestion[]> {
  const { data } = await client.get<CompanySuggestion[]>("/companies/suggest", {
    params: { q },
    signal,
  });
  return data;
}

/**
 * Same-origin URL for a suggestion's logo, routed through our backend proxy so the
 * browser never hits a third party directly (and broken logos become a clean 404 →
 * the component shows a monogram instead).
 */
export function companyLogoUrl(upstream?: string | null): string | null {
  if (!upstream) return null;
  return `${API_BASE}/companies/logo?src=${encodeURIComponent(upstream)}`;
}
