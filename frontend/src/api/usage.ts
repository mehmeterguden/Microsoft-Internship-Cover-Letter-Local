import { client } from "./client";
import type { UsageRun, UsageToday } from "@/store/aiActivity";

export interface UsageResponse {
  running: number;
  recent: UsageRun[];
  last: UsageRun | null;
  today: UsageToday;
}

/** Recent LLM runs + today's totals + whether a call is currently in flight. */
export async function getUsage(limit = 20): Promise<UsageResponse> {
  const { data } = await client.get<UsageResponse>("/llm/usage", { params: { limit } });
  return data;
}
