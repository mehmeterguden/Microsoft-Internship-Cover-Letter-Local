import { client } from "./client";
import type { CVExtraction } from "./types";

export type ReconcileKind = "fill" | "same" | "new" | "conflict";

export interface DiffField {
  field: string;
  existing: unknown;
  incoming: unknown;
}

/** One reconciled field (profile) or row (list section). */
export interface ReconcileEntry {
  id: string;
  section: string; // "profile" for identity fields, else a table name
  field: string | null;
  label: string;
  kind: ReconcileKind;
  incoming: unknown; // item object, or a scalar for profile fields
  existing: unknown; // matched item / scalar / null
  existing_id: number | null;
  note: string | null;
  recommend: "imported" | "existing" | null;
  diff: DiffField[] | null;
}

export interface ReconcilePlan {
  ai: boolean;
  profile: ReconcileEntry[];
  sections: Record<string, ReconcileEntry[]>;
  counts: { fill: number; same: number; new: number; conflict: number };
}

/** Compare an extraction against the saved profile → a merge plan. */
export async function planReconcile(
  extraction: CVExtraction,
  profileUrl?: string,
  useAi = true,
): Promise<ReconcilePlan> {
  const { data } = await client.post<ReconcilePlan>(`/reconcile/plan?use_ai=${useAi}`, {
    ...extraction,
    profile_url: profileUrl ?? null,
  });
  return data;
}

export interface ApplyItem {
  section: string;
  existing_id: number | null;
  data: Record<string, unknown>;
}

export interface ApplyRequest {
  source: string;
  source_detail?: string;
  profile_fields: { field: string; value: unknown }[];
  items: ApplyItem[];
}

export interface ApplyResult {
  ok: boolean;
  profile_fields: number;
  added: number;
  updated: number;
}

/** Apply the accepted decisions (fills, adds, in-place replaces). */
export async function applyReconcile(req: ApplyRequest): Promise<ApplyResult> {
  const { data } = await client.post<ApplyResult>("/reconcile/apply", req);
  return data;
}
