import { client } from "./client";

export interface ResetResult {
  ok: boolean;
  removed: Record<string, number>;
  total: number;
}

/** Permanently delete ALL profile data (keeps settings). Irreversible. */
export async function resetAllData(): Promise<ResetResult> {
  const { data } = await client.post<ResetResult>("/data/reset");
  return data;
}
