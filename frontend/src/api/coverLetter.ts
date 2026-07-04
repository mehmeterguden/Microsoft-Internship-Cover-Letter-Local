import { streamSSE } from "./sse";
import type { Tone } from "./types";

export interface CoverLetterRequest {
  company_name: string;
  role_title?: string | null;
  job_description?: string | null;
  tone?: Tone;
}

/** SSE events emitted by POST /cover-letter/generate. */
export type CoverLetterEvent =
  | { type: "start"; has_profile: boolean; used_research: boolean; used_style: boolean; voice_samples: number; tone: string }
  | { type: "token"; text: string }
  | { type: "done"; approx_words: number }
  | { type: "fatal"; error: string };

export function streamCoverLetter(
  req: CoverLetterRequest,
  onEvent: (event: CoverLetterEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamSSE<CoverLetterEvent>("/cover-letter/generate", req, onEvent, signal);
}
