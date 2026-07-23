import { client } from "./client";
import type { AppError } from "./errors";
import { streamSSE } from "./sse";

/**
 * AI profile completion — find the gaps in the profile and fill them with the
 * user's help. The plan is deterministic; short/enumerated values are suggested
 * in one JSON call; free-text fields stream token by token.
 */

export type StepKind =
  | "generative"
  | "short_text"
  | "enum"
  | "date"
  | "languages"
  | "skills"
  | "projects_from_github";

export interface Option {
  value: string;
  label: string;
}

export interface RepoOption {
  github_repo_id: number;
  name: string;
  purpose: string | null;
  technologies: string[];
  url: string | null;
}

export interface CompletionStep {
  id: string;
  kind: StepKind;
  section: string;
  section_label: string;
  label: string;
  context_label: string;
  table: string | null;
  entity_id: number | null;
  field: string | null;
  options: Option[] | null;
  extra: {
    existing?: { id: number; name: string; proficiency?: string | null; category?: string | null; self_rating?: number | null }[];
    empty?: boolean;
    repos?: RepoOption[];
  } | null;
}

export interface CompletionPlan {
  steps: CompletionStep[];
  total: number;
}

export interface Suggestions {
  identity: Record<string, string>;
  languages: { name: string; proficiency: string | null }[];
  skills_categories: Record<string, string>;
  skills_ratings: Record<string, number>;
  skills_new: { name: string; category: string | null; self_rating: number }[];
  items: Record<string, string>;
  drafts: Record<string, string>;
}

// ── Collected-answer shapes (per step kind) ──────────────────────

export type Answer = unknown;

export interface LangEntry {
  id?: number;
  name: string;
  proficiency: string | null;
}

export interface SkillEntry {
  id?: number;
  name: string;
  category: string | null;
  self_rating: number | null;
  isNew: boolean;
  include: boolean;
}

export interface RepoPick {
  github_repo_id: number;
  name: string;
  description: string | null;
  technologies: string[];
  url: string | null;
  picked: boolean;
}

export interface SuggestResult {
  ok: boolean;
  suggestions?: Suggestions;
  error?: string;
}

export type DraftEvent =
  | { type: "token"; text: string }
  | { type: "done"; text: string }
  | { type: "fatal"; error: AppError };

export type SuggestionEvent =
  | { type: "suggestion"; id: string; value: unknown }
  | { type: "done"; count?: number }
  | { type: "fatal"; error: AppError };

export interface ApplyPayload {
  profile?: Record<string, string>;
  languages_new?: { name: string; proficiency: string | null }[];
  skills_updates?: { id: number; category?: string | null; self_rating?: number | null }[];
  skills_new?: { name: string; category?: string | null; self_rating?: number | null }[];
  item_updates?: { table: string; id: number; field: string; value: unknown }[];
  new_projects?: {
    name: string;
    description?: string | null;
    role?: string | null;
    technologies?: string[];
    url?: string | null;
    github_repo_id?: number | null;
  }[];
}

export async function getCompletionPlan(): Promise<CompletionPlan> {
  const { data } = await client.get<CompletionPlan>("/profile-completion/plan");
  return data;
}

export async function suggestCompletion(steps: CompletionStep[]): Promise<SuggestResult> {
  const { data } = await client.post<SuggestResult>("/profile-completion/suggest", { steps });
  return data;
}

/** Stream one suggestion per field as the model writes it (fast fields first). */
export function streamSuggestions(
  steps: CompletionStep[],
  onEvent: (e: SuggestionEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamSSE("/profile-completion/suggest/stream", { steps }, onEvent, signal);
}

export function streamDraft(
  body: { field_label: string; target?: string },
  onEvent: (e: DraftEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamSSE("/profile-completion/draft", body, onEvent, signal);
}

export function streamRefine(
  body: { field_label: string; current: string; instruction: string },
  onEvent: (e: DraftEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamSSE("/profile-completion/refine", body, onEvent, signal);
}

export async function applyCompletion(payload: ApplyPayload): Promise<{ ok: boolean; saved: Record<string, number> }> {
  const { data } = await client.post("/profile-completion/apply", payload);
  return data;
}
