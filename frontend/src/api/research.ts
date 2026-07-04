import { client } from "./client";
import { streamSSE } from "./sse";
import type { CompanyIntelReport } from "./types";

export interface ResearchInput {
  company_name: string;
  role_title?: string | null;
  job_description?: string | null;
  refresh?: boolean;
}

/** SSE events emitted by POST /research/company (see backend research router). */
export type ResearchEvent =
  | { type: "phase"; phase: "gather" | "analyze"; agents: string[]; total: number }
  | { type: "agent_started"; agent: string; section: string }
  | { type: "source"; agent: string; source: string; ok: boolean }
  | { type: "agent_done"; agent: string; section: string; data: unknown; sources: { label?: string; source?: string; url?: string; ok: boolean }[] }
  | { type: "agent_error"; agent: string; error: string }
  | { type: "cached"; cached_at: string }
  | { type: "done"; report: CompanyIntelReport; duration_s: number }
  | { type: "fatal"; error: string };

export function streamResearch(
  input: ResearchInput,
  onEvent: (event: ResearchEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamSSE<ResearchEvent>("/research/company", input, onEvent, signal);
}

export interface CachedReport {
  cached_at: string;
  report: CompanyIntelReport;
}

/** Returns the cached report for a company+role, or null if none/expired (404). */
export async function getCachedReport(company: string, role?: string): Promise<CachedReport | null> {
  try {
    const { data } = await client.get<CachedReport>("/research/cached", {
      params: { company, role },
    });
    return data;
  } catch {
    return null;
  }
}
