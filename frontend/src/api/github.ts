import { client } from "./client";
import { streamSSE } from "./sse";
import type { GithubRepo, ScoredSkill } from "./types";

/** A live progress tick from a streaming operation. */
export interface Progress {
  percent: number;
  label: string;
}

export async function githubStatus(): Promise<{ account_connected: boolean }> {
  const { data } = await client.get("/github/status");
  return data;
}

export interface GithubProfile {
  login?: string;
  name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  html_url?: string | null;
  public_repos?: number | null;
  followers?: number | null;
}

export interface FetchReposResult {
  profile: GithubProfile;
  repos: GithubRepo[];
  count?: number;
}

export async function fetchRepos(username: string | null, useAccount: boolean): Promise<FetchReposResult> {
  const { data } = await client.post<FetchReposResult>("/github/fetch", {
    username,
    use_account: useAccount,
  });
  return data;
}

export interface AnalyzeResult {
  repos: GithubRepo[];
  skills: ScoredSkill[];
}

type AnalyzeEvent =
  | { type: "progress"; percent: number; label: string }
  | { type: "done"; result: AnalyzeResult }
  | { type: "fatal"; error: string };

/**
 * Analyze repos with live progress over SSE. `onProgress` fires as READMEs are
 * read (first ~40%) and each analysis batch completes (the rest). Resolves with
 * the final result; throws on a fatal stream error.
 */
export async function analyzeRepos(
  login: string,
  repos: GithubRepo[],
  onProgress?: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<AnalyzeResult> {
  let result: AnalyzeResult | null = null;
  let fatal: string | null = null;
  await streamSSE<AnalyzeEvent>("/github/analyze", { login, repos }, (event) => {
    if (event.type === "progress") onProgress?.({ percent: event.percent, label: event.label });
    else if (event.type === "done") result = event.result;
    else if (event.type === "fatal") fatal = event.error;
  }, signal);
  if (fatal) throw new Error(fatal);
  if (!result) throw new Error("Analysis produced no result");
  return result;
}

export interface SaveResult {
  ok: boolean;
  saved_repos: number;
  updated_repos: number;
  added_projects: number;
  updated_projects: number;
  skipped_projects: number;
  added_skills: number;
}

export async function saveRepos(repos: GithubRepo[], skills: ScoredSkill[]): Promise<SaveResult> {
  const { data } = await client.post<SaveResult>("/github/save", { repos, skills });
  return data;
}
