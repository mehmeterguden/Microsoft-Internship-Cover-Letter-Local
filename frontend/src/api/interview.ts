import { client } from "./client";

export type QuestionType = "boolean" | "single_choice" | "multi_select" | "rating" | "text";

export type FocusArea = string;

export interface InterviewQuestion {
  id: string;
  target_type: "project" | "experience" | "skill" | "general";
  target_id: number | null;
  target_name?: string;
  question: string;
  type: QuestionType;
  options: string[] | null;
  allow_custom: boolean;
  hint?: string;
}

export interface QuestionHistoryItem {
  id?: string;
  question: string;
  answer: unknown;
}

export interface AnswerItem {
  question_id: string;
  target_type: string;
  target_id: number | null;
  target_name?: string;
  question: string;
  answer: unknown;
}

export interface SynthesisDiffItem {
  id: string;
  target_type: "project" | "experience" | "skill" | "general";
  target_id: number | null;
  target_name: string;
  current_text: string;
  proposed_text: string;
  approved: boolean;
}

export interface SynthesisPreviewResponse {
  diffs: SynthesisDiffItem[];
}

export interface ApplySynthesisResponse {
  ok: boolean;
  updated_count: number;
  session_id: number | null;
}

export interface SynthesizeResponse {
  ok: boolean;
  updated_count: number;
  updates: {
    projects?: number[];
    experiences?: number[];
    skills?: number[];
  };
}

export async function generateBatchQuestions(count: number = 5, focus: FocusArea = "all"): Promise<InterviewQuestion[]> {
  const { data } = await client.post<{ questions: InterviewQuestion[] }>("/profile/interview/generate-batch", {
    count,
    focus,
  });
  return data.questions;
}

export async function previewSynthesis(answers: AnswerItem[]): Promise<SynthesisDiffItem[]> {
  const { data } = await client.post<SynthesisPreviewResponse>("/profile/interview/preview-synthesis", { answers });
  return data.diffs;
}

export async function applySynthesis(
  approvedDiffs: SynthesisDiffItem[],
  sessionInfo?: { count: number; focus: string; questions: InterviewQuestion[]; answers: AnswerItem[] }
): Promise<ApplySynthesisResponse> {
  const { data } = await client.post<ApplySynthesisResponse>("/profile/interview/apply-synthesis", {
    approved_diffs: approvedDiffs,
    session_info: sessionInfo,
  });
  return data;
}

// Legacy helpers
export async function getNextInterviewQuestion(history: QuestionHistoryItem[] = []): Promise<InterviewQuestion> {
  const { data } = await client.post<InterviewQuestion>("/profile/interview/next-question", { history });
  return data;
}

export async function synthesizeInterviewAnswers(answers: AnswerItem[]): Promise<SynthesizeResponse> {
  const { data } = await client.post<SynthesizeResponse>("/profile/interview/synthesize", { answers });
  return data;
}
