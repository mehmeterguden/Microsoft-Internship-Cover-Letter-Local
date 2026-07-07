import { client } from "./client";
import type {
  Certificate,
  Education,
  Experience,
  Language,
  Link,
  Profile,
  Project,
  Skill,
  Training,
} from "./types";

// ── Profile (singleton) ──────────────────────────────────────────

export async function getProfile(): Promise<Profile> {
  const { data } = await client.get<Profile>("/profile");
  return data;
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const { data } = await client.put<Profile>("/profile", profile);
  return data;
}

// ── Generic CRUD factory for the id-keyed list entities ──────────
// Every list endpoint follows the same REST shape (see the backend routers),
// so one factory gives us typed list/create/update/delete per resource.

function crud<T extends { id?: number | null }>(path: string) {
  return {
    list: async (): Promise<T[]> => (await client.get<T[]>(path)).data,
    create: async (item: T): Promise<T> => (await client.post<T>(path, item)).data,
    update: async (id: number, item: T): Promise<T> =>
      (await client.put<T>(`${path}/${id}`, item)).data,
    remove: async (id: number): Promise<void> => {
      await client.delete(`${path}/${id}`);
    },
  };
}

export const skillsApi = crud<Skill>("/skills");
export const experiencesApi = crud<Experience>("/experiences");
export const educationApi = crud<Education>("/education");
export const languagesApi = crud<Language>("/languages");
export const projectsApi = crud<Project>("/projects");
export const certificatesApi = crud<Certificate>("/certificates");
export const trainingsApi = crud<Training>("/trainings");
export const linksApi = crud<Link>("/links");

// ── Backwards-compatible named exports (used elsewhere) ──────────

export const listSkills = skillsApi.list;
export const createSkill = skillsApi.create;
export const deleteSkill = skillsApi.remove;
export const updateSkill = (id: number, skill: Skill) => skillsApi.update(id, skill);
export const listExperiences = experiencesApi.list;
export const listEducation = educationApi.list;
export const listLanguages = languagesApi.list;
