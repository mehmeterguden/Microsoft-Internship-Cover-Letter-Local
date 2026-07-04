import { client } from "./client";
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

export interface SaveExtractionResult {
  ok: boolean;
  saved: Record<string, number>;
}

export async function saveExtraction(extraction: CVExtraction, replace = true): Promise<SaveExtractionResult> {
  const { data } = await client.post<SaveExtractionResult>(`/cv/save?replace=${replace}`, extraction);
  return data;
}
