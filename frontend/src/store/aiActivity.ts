import { create } from "zustand";

/** One recorded LLM call (mirror of backend `llm_runs` / GET /api/llm/usage). */
export interface UsageRun {
  id: number;
  created_at: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  cost_usd: number;
  kind: string | null;
}

export interface UsageToday {
  calls: number;
  tokens: number;
  cost_usd: number;
}

interface AiActivityState {
  inFlight: number; // client-side AI axios calls in flight (instant pulse)
  serverRunning: number; // backend in-flight count (covers SSE calls too), from polling
  last: UsageRun | null;
  today: UsageToday;
  recent: UsageRun[];
  start: () => void;
  end: () => void;
  setUsage: (u: { running: number; last: UsageRun | null; today: UsageToday; recent: UsageRun[] }) => void;
}

/** Tiny global store powering the AI usage meter. */
export const useAiActivity = create<AiActivityState>((set) => ({
  inFlight: 0,
  serverRunning: 0,
  last: null,
  today: { calls: 0, tokens: 0, cost_usd: 0 },
  recent: [],
  start: () => set((s) => ({ inFlight: s.inFlight + 1 })),
  end: () => set((s) => ({ inFlight: Math.max(0, s.inFlight - 1) })),
  setUsage: (u) => set({ serverRunning: u.running, last: u.last, today: u.today, recent: u.recent }),
}));

/** True whenever any AI request is in flight (client axios or backend/SSE). */
export const isAiActive = (s: AiActivityState): boolean => s.inFlight > 0 || s.serverRunning > 0;
