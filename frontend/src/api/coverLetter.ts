import { client } from "./client";
import type { AppError } from "./errors";
import { streamSSE } from "./sse";
import type { Tone } from "./types";

export interface CoverLetterRequest {
  company_name: string;
  role_title?: string | null;
  job_description?: string | null;
  tone?: Tone;
}

/** One piece of context that fed the generation (shown in the run-meta panel). */
export interface RunContextItem {
  source: "profile" | "research" | "voice" | "exemplar";
  label: string;
  snippet: string;
}

/** What produced this letter: model, provider, timing, the context used, and the steps taken. */
export interface RunMeta {
  model: string;
  provider: string;
  duration_s: number;
  tokens?: number;
  context: RunContextItem[];
  steps: string[];
}

/** SSE events emitted by POST /cover-letter/generate. */
export type CoverLetterEvent =
  | { type: "start"; has_profile: boolean; used_research: boolean; used_style: boolean; voice_samples: number; tone: string }
  | { type: "token"; text: string }
  | { type: "done"; approx_words: number; run_meta: RunMeta }
  | { type: "fatal"; error: AppError };

export function streamCoverLetter(
  req: CoverLetterRequest,
  onEvent: (event: CoverLetterEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamSSE<CoverLetterEvent>("/cover-letter/generate", req, onEvent, signal);
}

// ── Quality score (LLM-as-judge) ───────────────────────────────────────

export interface EvaluateRequest {
  text: string;
  company?: string | null;
  role?: string | null;
}

export interface RubricScore {
  name: string;
  score: number;
}

export interface Evaluation {
  score: number;
  breakdown: RubricScore[];
  rationale: string;
}

/** Score a finished letter 0–100 on persuasion, personalization, tone, language, length. */
export async function evaluateLetter(req: EvaluateRequest): Promise<Evaluation> {
  const { data } = await client.post<Evaluation>("/cover-letter/evaluate", req);
  return data;
}

// ── Groundedness (claims vs the applicant's data) ──────────────────────

export interface Claim {
  text: string;
  supported: boolean;
  evidence?: string;
  /** [start, end] character offsets of the claim's source phrase in the letter, when locatable. */
  span?: [number, number];
}

export interface Groundedness {
  claims: Claim[];
}

/** Flag any claim in the letter the local profile (CV + GitHub + profile) does not support. */
export async function checkGroundedness(text: string): Promise<Groundedness> {
  const { data } = await client.post<Groundedness>("/cover-letter/groundedness", { text });
  return data;
}

// ── Inline editing of a selection ──────────────────────────────────────

export type EditAction = "improve" | "shorten" | "lengthen" | "tone";

export interface EditRequest {
  text: string;
  selection: string;
  action: EditAction;
  tone?: Tone;
}

/** Rewrite the selected passage; returns the replacement text. */
export async function editSelection(req: EditRequest): Promise<string> {
  const { data } = await client.post<{ text: string }>("/cover-letter/edit", req);
  return data.text;
}
