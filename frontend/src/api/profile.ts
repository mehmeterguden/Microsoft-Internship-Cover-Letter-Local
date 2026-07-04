import { client } from "./client";
import type { Education, Experience, Language, Profile, Skill } from "./types";

export async function getProfile(): Promise<Profile> {
  const { data } = await client.get<Profile>("/profile");
  return data;
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const { data } = await client.put<Profile>("/profile", profile);
  return data;
}

export async function listSkills(): Promise<Skill[]> {
  const { data } = await client.get<Skill[]>("/skills");
  return data;
}

export async function createSkill(skill: Skill): Promise<Skill> {
  const { data } = await client.post<Skill>("/skills", skill);
  return data;
}

export async function updateSkill(id: number, skill: Skill): Promise<Skill> {
  const { data } = await client.put<Skill>(`/skills/${id}`, skill);
  return data;
}

export async function deleteSkill(id: number): Promise<void> {
  await client.delete(`/skills/${id}`);
}

export async function listExperiences(): Promise<Experience[]> {
  const { data } = await client.get<Experience[]>("/experiences");
  return data;
}

export async function listEducation(): Promise<Education[]> {
  const { data } = await client.get<Education[]>("/education");
  return data;
}

export async function listLanguages(): Promise<Language[]> {
  const { data } = await client.get<Language[]>("/languages");
  return data;
}
