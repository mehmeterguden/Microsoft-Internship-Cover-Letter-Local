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
  | { type: "agent_progress"; agent: string; text: string }
  | { type: "agent_done"; agent: string; section: string; data: unknown; sources: { label?: string; source?: string; url?: string; ok: boolean }[] }
  | { type: "agent_error"; agent: string; error: string; reason?: "timeout" | "error" }
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

/** What POST /research/job-url extracts from a pasted job posting link. */
export interface JobUrlExtract {
  company: string;
  role: string;
  job_description: string;
}

/** Read a job posting page and let the LLM fill in company/role/JD. */
export async function autofillFromJobUrl(url: string): Promise<JobUrlExtract> {
  const { data } = await client.post<JobUrlExtract>("/research/job-url", { url });
  return data;
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
