import { client } from "./client";
import { streamSSE } from "./sse";
import type { Tone } from "./types";

export type LetterLength = "short" | "standard" | "detailed";

export interface CoverLetterRequest {
  company_name: string;
  role_title?: string | null;
  job_description?: string | null;
  tone?: Tone;
  length?: LetterLength;
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

/** A claim the local profile doesn't clearly support — advisory, no score. */
export interface ReviewClaim {
  text: string;
  reason: string;
}

/** POST /cover-letter/review — flag claims to double-check before sending. */
export async function reviewCoverLetter(letter: string): Promise<ReviewClaim[]> {
  const { data } = await client.post<{ claims: ReviewClaim[] }>("/cover-letter/review", { letter });
  return data.claims ?? [];
}
