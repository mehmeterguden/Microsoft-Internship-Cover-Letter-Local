import { client } from "./client";
import { streamSSE } from "./sse";
import type { Progress } from "./github";
import type { PastCoverLetter, VoiceProfile } from "./types";

export interface StyleState {
  style_profile: VoiceProfile | null;
  samples: number;
  embeddings_available: boolean;
}

export async function getStyle(): Promise<StyleState> {
  const { data } = await client.get<StyleState>("/style");
  return data;
}

export interface LearnResult {
  samples: number;
  chunks_indexed: number;
  embeddings: boolean;
  llm_analyzed: boolean;
  /** True when there were letters but the deep LLM analysis couldn't complete. */
  analysis_failed: boolean;
  error: string | null;
  /** Why it failed, e.g. ["unavailable"] (model busy) or ["limit"] (quota). */
  failure_reasons?: string[];
  /** True when switching model would likely help (the model itself is unavailable). */
  suggest_model_switch?: boolean;
  /** The model that was in use when it failed. */
  model?: string;
  provider?: string;
  style_profile: VoiceProfile | null;
}

type LearnEvent =
  | { type: "progress"; percent: number; label: string }
  | { type: "token"; text: string }
  | { type: "done"; result: LearnResult }
  | { type: "fatal"; error: string };

export interface LearnCallbacks {
  /** Fires per phase (gather → metrics → deep voice → index). */
  onProgress?: (p: Progress) => void;
  /** Raw JSON tokens from the deep voice analysis, as the model writes them. */
  onToken?: (text: string) => void;
}

/**
 * Learn the writing voice with live progress over SSE. `onProgress` fires per
 * phase; `onToken` streams the deep analysis JSON as it's written, so the UI can
 * render the fingerprint filling in live. Resolves with the summary; throws on a
 * fatal stream error.
 */
export async function learnVoice(
  callbacks: LearnCallbacks = {},
  signal?: AbortSignal,
): Promise<LearnResult> {
  let result: LearnResult | null = null;
  let fatal: string | null = null;
  await streamSSE<LearnEvent>("/style/learn", {}, (event) => {
    if (event.type === "progress") callbacks.onProgress?.({ percent: event.percent, label: event.label });
    else if (event.type === "token") callbacks.onToken?.(event.text);
    else if (event.type === "done") result = event.result;
    else if (event.type === "fatal") fatal = event.error;
  }, signal);
  if (fatal) throw new Error(fatal);
  if (!result) throw new Error("Voice learning produced no result");
  return result;
}

export async function listPastLetters(): Promise<PastCoverLetter[]> {
  const { data } = await client.get<PastCoverLetter[]>("/past-cover-letters");
  return data;
}

export async function createPastLetter(letter: PastCoverLetter): Promise<PastCoverLetter> {
  const { data } = await client.post<PastCoverLetter>("/past-cover-letters", letter);
  return data;
}

export async function updatePastLetter(id: number, letter: PastCoverLetter): Promise<PastCoverLetter> {
  const { data } = await client.put<PastCoverLetter>(`/past-cover-letters/${id}`, letter);
  return data;
}

export async function deletePastLetter(id: number): Promise<void> {
  await client.delete(`/past-cover-letters/${id}`);
}
