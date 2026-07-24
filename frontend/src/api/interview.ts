import { client } from "./client";

export type QuestionType = "boolean" | "single_choice" | "multi_select" | "rating" | "text";

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
  question: string;
  answer: unknown;
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

export async function getNextInterviewQuestion(history: QuestionHistoryItem[] = []): Promise<InterviewQuestion> {
  const { data } = await client.post<InterviewQuestion>("/profile/interview/next-question", { history });
  return data;
}

export async function synthesizeInterviewAnswers(answers: AnswerItem[]): Promise<SynthesizeResponse> {
  const { data } = await client.post<SynthesizeResponse>("/profile/interview/synthesize", { answers });
  return data;
}
