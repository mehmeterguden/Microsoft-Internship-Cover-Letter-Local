/**
 * Write-screen letter tools — the adapter between the Write UI and P1's
 * cover-letter API (`@/api/coverLetter`).
 *
 * This chat owns only the Write screen; P1 owns the API. The API is now wired,
 * so these functions delegate to it and translate its shapes into the ones the
 * Write components expect (e.g. rubric `name`→`label`, edit action
 * `extend`→`lengthen`, run-meta `snake_case`→`camelCase`). Keeping the mapping
 * here means the components never need to know the wire format.
 *
 * Export is the one exception: P1 has no `/cover-letter/export` endpoint yet, so
 * `exportLetter` below is a self-contained client-side implementation (Word via
 * an HTML `.doc`, PDF via the browser print pipeline). Swap it for the real
 * endpoint once it lands.
 */

import {
  checkGroundedness as apiCheckGroundedness,
  editSelection as apiEditSelection,
  evaluateLetter as apiEvaluateLetter,
  type EditAction as ApiEditAction,
  type RunMeta as ApiRunMeta,
} from "@/api/coverLetter";
import type { Tone } from "@/api/types";

// ── Run inspector shapes (view model for RunInspector) ───────────────────────

/** One context source that fed (or was skipped by) a generation run. */
export interface RunContextItem {
  label: string;
  included: boolean;
  detail?: string;
}

/** One step in the generation pipeline, for the run inspector timeline. */
export interface RunStep {
  label: string;
  detail?: string;
  status: "done" | "skipped";
}

/** "Behind the scenes" metadata for a single generation run (view model). */
export interface RunMeta {
  model?: string;
  provider?: string;
  durationS: number;
  approxWords?: number;
  tokens?: number | null;
  context: RunContextItem[];
  steps: RunStep[];
}

// ── Quality / groundedness view models ───────────────────────────────────────

export interface QualityBreakdownItem {
  label: string;
  score: number; // 0–100
}

export interface LetterEvaluation {
  score: number; // 0–100 overall
  breakdown: QualityBreakdownItem[];
  rationale: string;
}

export interface GroundednessClaim {
  text: string;
  supported: boolean;
  /** Supporting snippet when supported, or the reason it was flagged otherwise. */
  evidence?: string;
  /** `[start, end)` character offsets into the letter text. */
  span?: [number, number];
}

export interface GroundednessResult {
  claims: GroundednessClaim[];
}

/** UI-facing edit actions (mapped to P1's names before the call). */
export type EditAction = "improve" | "shorten" | "extend" | "retone";

export interface EditSelectionArgs {
  text: string; // full letter
  selection: string; // the selected fragment
  action: EditAction;
  tone?: Tone;
}

export interface EditSelectionResult {
  text: string;
}

// ── [2] Quality evaluation ───────────────────────────────────────────────────

/** Score the letter via P1's LLM-as-judge, mapping the rubric to the UI shape. */
export async function evaluateLetter(
  text: string,
  ctx?: { company?: string; role?: string },
): Promise<LetterEvaluation> {
  const ev = await apiEvaluateLetter({
    text,
    company: ctx?.company?.trim() || null,
    role: ctx?.role?.trim() || null,
  });
  return {
    score: ev.score,
    breakdown: ev.breakdown.map((b) => ({ label: b.name, score: b.score })),
    rationale: ev.rationale,
  };
}

// ── [1] Groundedness check ───────────────────────────────────────────────────

/**
 * Ask P1 which claims the profile can't support. Back-fill a span for any claim
 * the backend couldn't locate, so it can still be highlighted in the letter.
 */
export async function checkGroundedness(text: string): Promise<GroundednessResult> {
  const res = await apiCheckGroundedness(text);
  const claims: GroundednessClaim[] = res.claims.map((c) => {
    let span = c.span;
    if (!span) {
      const idx = text.indexOf(c.text);
      if (idx >= 0) span = [idx, idx + c.text.length];
    }
    return { text: c.text, supported: c.supported, evidence: c.evidence, span };
  });
  return { claims };
}

// ── [8] Selection editing ────────────────────────────────────────────────────

const ACTION_MAP: Record<EditAction, ApiEditAction> = {
  improve: "improve",
  shorten: "shorten",
  extend: "lengthen",
  retone: "tone",
};

/** Rewrite the selected fragment via P1's inline editor. */
export async function editSelection(args: EditSelectionArgs): Promise<EditSelectionResult> {
  const replacement = await apiEditSelection({
    text: args.text,
    selection: args.selection,
    action: ACTION_MAP[args.action],
    tone: args.tone,
  });
  return { text: replacement };
}

// ── [11] Export (client-side — P1 has no export endpoint yet) ─────────────────

export type ExportFormat = "pdf" | "docx";
export type ExportTemplate = "classic" | "modern" | "compact";

export interface ExportOptions {
  template: ExportTemplate;
  text: string;
  company?: string;
  role?: string;
  applicant?: string;
}

const TEMPLATE_META: Record<ExportTemplate, { name: string; blurb: string }> = {
  classic: { name: "Classic", blurb: "Serif, centered letterhead — timeless and formal." },
  modern: { name: "Modern", blurb: "Clean sans-serif with an accent rule — crisp and current." },
  compact: { name: "Compact", blurb: "Tighter spacing — fits a dense letter on one page." },
};

export const EXPORT_TEMPLATES = (Object.keys(TEMPLATE_META) as ExportTemplate[]).map((id) => ({
  id,
  ...TEMPLATE_META[id],
}));

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build a self-contained, styled HTML document for a template (preview + export). */
export function buildLetterHtml(opts: ExportOptions): string {
  const paragraphs = opts.text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  const heading = [opts.applicant, [opts.role, opts.company].filter(Boolean).join(" · ")]
    .filter(Boolean)
    .map((line, i) => `<div class="${i === 0 ? "name" : "meta"}">${esc(line as string)}</div>`)
    .join("");

  const styles: Record<ExportTemplate, string> = {
    classic: `
      body{font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;line-height:1.7;max-width:640px;margin:48px auto;padding:0 32px}
      .head{text-align:center;border-bottom:2px solid #1a1a1a;padding-bottom:16px;margin-bottom:28px}
      .name{font-size:26px;font-weight:700;letter-spacing:.02em}
      .meta{font-size:13px;color:#555;margin-top:6px;text-transform:uppercase;letter-spacing:.14em}
      p{margin:0 0 16px;font-size:15px}`,
    modern: `
      body{font-family:'Helvetica Neue',Arial,sans-serif;color:#18202b;line-height:1.65;max-width:660px;margin:48px auto;padding:0 36px}
      .head{border-left:4px solid #0ea373;padding-left:16px;margin-bottom:32px}
      .name{font-size:24px;font-weight:800}
      .meta{font-size:12px;color:#5b6b7b;margin-top:4px;text-transform:uppercase;letter-spacing:.16em;font-weight:600}
      p{margin:0 0 15px;font-size:14.5px}`,
    compact: `
      body{font-family:'Helvetica Neue',Arial,sans-serif;color:#20262e;line-height:1.5;max-width:600px;margin:32px auto;padding:0 28px}
      .head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #d5dbe1;padding-bottom:10px;margin-bottom:18px}
      .name{font-size:19px;font-weight:700}
      .meta{font-size:11px;color:#6a7683;text-transform:uppercase;letter-spacing:.1em}
      p{margin:0 0 10px;font-size:13.5px}`,
  };

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>${esc(opts.applicant || opts.company || "Cover letter")}</title>
<style>*{box-sizing:border-box}html,body{background:#fff}@media print{body{margin:0}}${styles[opts.template]}</style>
</head><body>
<div class="head">${heading || '<div class="name">Cover letter</div>'}</div>
${paragraphs || "<p>Your letter will appear here.</p>"}
</body></html>`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cover-letter";
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function printHtml(html: string, fallbackName: string): void {
  const w = window.open("", "_blank", "width=820,height=1040");
  if (!w) {
    // Popup blocked — fall back to a downloadable HTML document.
    downloadBlob(new Blob([html], { type: "text/html" }), `${fallbackName}.html`);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  window.setTimeout(() => {
    try {
      w.print();
    } catch {
      /* user can print manually */
    }
  }, 350);
}

/**
 * Export the letter. Word: an HTML-based `.doc` that opens with the template
 * styling intact. PDF: the browser's own print-to-PDF pipeline (renders the
 * same template). Replace with P1's `/cover-letter/export` endpoint once added.
 */
export async function exportLetter(format: ExportFormat, opts: ExportOptions): Promise<void> {
  const html = buildLetterHtml(opts);
  const base = `${slugify(opts.company || opts.applicant || "cover-letter")}-${opts.template}`;
  if (format === "docx") {
    downloadBlob(new Blob([html], { type: "application/msword" }), `${base}.doc`);
  } else {
    printHtml(html, base);
  }
}

// ── Run metadata ─────────────────────────────────────────────────────────────

export interface StartInfo {
  has_profile: boolean;
  used_research: boolean;
  used_style: boolean;
  voice_samples: number;
  tone: string;
}

/** Map P1's run metadata (from the SSE `done` event) into the inspector's shape. */
export function toRunMeta(rm: ApiRunMeta, approxWords: number): RunMeta {
  return {
    model: rm.model,
    provider: rm.provider,
    durationS: rm.duration_s,
    approxWords,
    tokens: rm.tokens ?? null,
    context: rm.context.map((c) => ({ label: c.label, included: true, detail: c.snippet })),
    steps: rm.steps.map((s) => ({ label: s, status: "done" as const })),
  };
}

/**
 * Fallback RunMeta assembled from the SSE `start` event plus local timing — used
 * only if a run arrives without `run_meta` (e.g. the backend lags the frontend
 * during parallel development).
 */
export function buildRunMeta(
  start: StartInfo | null,
  durationS: number,
  approxWords: number,
  model?: string,
  provider?: string,
): RunMeta {
  const samples = start?.voice_samples ?? 0;
  const context: RunContextItem[] = [
    { label: "Your profile", included: start?.has_profile ?? false, detail: "Skills, experience & projects" },
    { label: "Company research", included: start?.used_research ?? false, detail: "Cached intel report" },
    { label: "Writing style", included: start?.used_style ?? false, detail: "Learned voice profile" },
    { label: "Voice samples", included: samples > 0, detail: `${samples} sample${samples === 1 ? "" : "s"}` },
    { label: `Tone: ${start?.tone ?? "—"}`, included: true },
  ];
  const usedCount = context.filter((c) => c.included).length;
  const steps: RunStep[] = [
    { label: "Gathered context", status: "done", detail: `${usedCount} source${usedCount === 1 ? "" : "s"} in play` },
    { label: "Composed the letter", status: "done", detail: `~${approxWords} words` },
    { label: "Streamed to editor", status: "done", detail: `${durationS.toFixed(1)}s end to end` },
  ];
  return { model, provider, durationS, approxWords, tokens: null, context, steps };
}
