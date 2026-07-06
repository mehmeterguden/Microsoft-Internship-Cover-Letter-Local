import { client } from "./client";
import type { GithubRepo } from "./types";

/** Repos already saved into the profile (the github_repos table). */
export async function listSavedRepos(): Promise<GithubRepo[]> {
  const { data } = await client.get<GithubRepo[]>("/github-repos");
  return data;
}

export async function deleteSavedRepo(id: number): Promise<void> {
  await client.delete(`/github-repos/${id}`);
}
