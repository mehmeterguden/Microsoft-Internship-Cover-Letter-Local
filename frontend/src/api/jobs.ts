import { client } from "./client";
import type { Job } from "./types";

export async function listJobs(): Promise<Job[]> {
  const { data } = await client.get<Job[]>("/jobs");
  return data;
}

export async function getJob(id: number): Promise<Job> {
  const { data } = await client.get<Job>(`/jobs/${id}`);
  return data;
}

export async function createJob(job: Job): Promise<Job> {
  const { data } = await client.post<Job>("/jobs", job);
  return data;
}

export async function updateJob(id: number, job: Job): Promise<Job> {
  const { data } = await client.put<Job>(`/jobs/${id}`, job);
  return data;
}

export async function deleteJob(id: number): Promise<void> {
  await client.delete(`/jobs/${id}`);
}
