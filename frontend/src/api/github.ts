import { client } from "./client";
import type { GithubRepo, ScoredSkill } from "./types";

export async function githubStatus(): Promise<{ account_connected: boolean }> {
  const { data } = await client.get("/github/status");
  return data;
}

export interface FetchReposResult {
  profile: { login?: string } & Record<string, unknown>;
  repos: GithubRepo[];
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

export async function analyzeRepos(login: string, repos: GithubRepo[]): Promise<AnalyzeResult> {
  const { data } = await client.post<AnalyzeResult>("/github/analyze", { login, repos });
  return data;
}

export interface SaveResult {
  ok: boolean;
  saved_repos: number;
  updated_repos: number;
  added_skills: number;
}

export async function saveRepos(repos: GithubRepo[], skills: ScoredSkill[]): Promise<SaveResult> {
  const { data } = await client.post<SaveResult>("/github/save", { repos, skills });
  return data;
}
