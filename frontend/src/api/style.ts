import { client } from "./client";
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
  style_profile: VoiceProfile | null;
}

export async function learnVoice(): Promise<LearnResult> {
  const { data } = await client.post<LearnResult>("/style/learn");
  return data;
}

export async function listPastLetters(): Promise<PastCoverLetter[]> {
  const { data } = await client.get<PastCoverLetter[]>("/past-cover-letters");
  return data;
}

export async function createPastLetter(letter: PastCoverLetter): Promise<PastCoverLetter> {
  const { data } = await client.post<PastCoverLetter>("/past-cover-letters", letter);
  return data;
}

export async function deletePastLetter(id: number): Promise<void> {
  await client.delete(`/past-cover-letters/${id}`);
}
