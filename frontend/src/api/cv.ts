import { client } from "./client";
import type { AppError } from "./errors";
import { streamSSERequest } from "./sse";
import type { CVExtraction } from "./types";

export interface ImportResult {
  filename: string;
  text: string;
  num_pages: number;
  source_type: string;
  ok: boolean;
  structured?: CVExtraction;
  error?: string;
  raw_output?: string;
}

/** Upload a CV file (multipart) and get extracted + structured data in one call. */
export async function importCv(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await client.post<ImportResult>("/cv/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** SSE events from POST /cv/import/stream — the AI's JSON as it's written. */
export type CvImportEvent =
  | { type: "meta"; filename: string; source_type: string; num_pages: number; char_count: number }
  | { type: "token"; text: string }
  | { type: "done"; ok: boolean; structured?: CVExtraction; error?: string; raw_output: string; duration_s: number }
  | { type: "fatal"; error: AppError };

/** Upload a CV and stream the structuring output token by token. */
export function streamImportCv(
  file: File,
  onEvent: (event: CvImportEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  return streamSSERequest<CvImportEvent>("/cv/import/stream", { method: "POST", body: form }, onEvent, signal);
}

export interface ParseResult {
  filename: string;
  text: string;
  num_pages: number;
  source_type: string;
}

/** Extract plain text from a PDF/DOCX/image without structuring it. */
export async function parseDocument(file: File): Promise<ParseResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await client.post<ParseResult>("/cv/parse", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export interface SaveExtractionResult {
  ok: boolean;
  saved: Record<string, number>;
}

export async function saveExtraction(
  extraction: CVExtraction,
  replace = true,
  sourceDetail?: string,
): Promise<SaveExtractionResult> {
  const params = new URLSearchParams({ replace: String(replace) });
  if (sourceDetail) params.set("source_detail", sourceDetail);
  const { data } = await client.post<SaveExtractionResult>(`/cv/save?${params}`, extraction);
  return data;
}
