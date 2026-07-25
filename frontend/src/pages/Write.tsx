import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  Info,
  Link as LinkIcon,
  Loader2,
  Maximize2,
  MessageSquare,
  Pencil,
  RotateCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import { Segmented, Slider, Toggle } from "@/components/ui/controls";
import { Pill, StatDot } from "@/components/ui/feedback";
import { ScoreRing, SourceChip } from "@/components/ui/data";
import {
  exportLetter,
  fetchTailoringQuestions,
  inlineEditCvLetter,
  reviewCoverLetter,
  scanPii,
  streamCoverLetter,
  type ExportFormat,
  type LetterLength,
  type PiiFinding,
  type ReviewClaim,
} from "@/api/coverLetter";
import {
  autofillFromJobUrl,
  getCachedReport,
  streamResearch,
  type ResearchEvent,
} from "@/api/research";
import { getStyle } from "@/api/style";
import { errorMessage } from "@/api/client";
import { createJob, getJob, updateJob } from "@/api/jobs";
import type { TailoringQuestion, Tone } from "@/api/types";
import { useAsync } from "@/lib/useAsync";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";

function deriveDefaultTone(toneStr?: string | null): Tone {
  if (!toneStr) return "warm";
  const lower = toneStr.toLowerCase();
  if (lower.includes("confident")) return "confident";
  if (lower.includes("warm") || lower.includes("personable")) return "warm";
  if (lower.includes("concise") || lower.includes("brief") || lower.includes("crisp")) return "concise";
  if (lower.includes("professional") || lower.includes("polished")) return "professional";
  return "warm";
}

/* ───────────────────────────────────────────────────────────────────
   Wire types (local mirror of Research.tsx schema)
────────────────────────────────────────────────────────────────────*/
interface WireFirmographics {
  industry?: string | null;
  size?: string | null;
  employees?: number | null;
  hq?: string | null;
  founded?: string | null;
  website?: string | null;
}
interface WireOverview { summary?: string | null; mission?: string | null; division_context?: string | null }
interface WireValueSignal { name: string; weight: number; evidence: { text: string; source: { label: string } }[] }
interface WireCulture { ways_of_working: string[]; notes: { text: string; source?: { label: string; url?: string | null } | null }[] }
interface WireTechItem { name: string; you_know: boolean; worth_learning: boolean; source?: { label: string; url?: string | null } | null }
interface WireNewsSignal { headline: string; date?: string | null; url?: string | null; why_it_matters?: string | null }
interface WireFitDimension { name: string; you: number; role_need: number }
interface WireFit { score: number; verdict?: string | null; recommendation?: string | null; dimensions: WireFitDimension[]; matched_skills: string[]; gaps: string[]; experience_fit_pct: number }
interface WireLetterHook { hook: string; use_in_letter?: string | null }
interface WireRoleAnalysis { title?: string | null; responsibilities: string[]; must_haves: string[]; nice_to_haves: string[]; keywords: string[] }
interface WireReportMeta {
  sources: { label: string; url?: string | null }[];
  section_sources: Record<string, { label: string; url?: string | null }[]>;
  confidence: number;
  completeness: number;
  missing: string[];
  gathered_at?: string | null;
  duration_s?: number | null;
  from_cache: boolean;
  agents: string[];
}
interface WireReport {
  company_name: string;
  role_title?: string | null;
  firmographics: WireFirmographics;
  overview: WireOverview;
  values: WireValueSignal[];
  culture: WireCulture;
  tech_stack: WireTechItem[];
  signals: WireNewsSignal[];
  interview: { order: number; area: string; note?: string | null }[];
  role: WireRoleAnalysis;
  fit: WireFit;
  ammo: WireLetterHook[];
  meta: WireReportMeta;
}

/* ───────────────────────────────────────────────────────────────────
   Research agent UI
────────────────────────────────────────────────────────────────────*/
type ResearchPhase = "idle" | "running" | "done" | "error";
type AgentStatus = "queued" | "running" | "done" | "error";
interface AgentUi { id: string; label: string; status: AgentStatus; note?: string; sources: string[] }

const AGENT_LABELS: Record<string, string> = {
  company_profile: "Company profile (Overview, Facts, Values)",
  firmographics: "Firmographics", overview: "Company overview", values: "Values & mission",
  culture: "Culture", tech_stack: "Tech stack", signals: "Recent signals",
  interview: "Interview prep", jd_analyst: "Role analysis", fit: "Fit analysis", ammo: "Letter hooks",
};
function agentLabel(id: string) {
  return AGENT_LABELS[id] ?? id.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
}

/* ───────────────────────────────────────────────────────────────────
   Write page constants
────────────────────────────────────────────────────────────────────*/
const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "warm", label: "Warm" },
  { value: "confident", label: "Confident" },
  { value: "concise", label: "Concise" },
];

function lengthFor(pct: number): { length: LetterLength; label: string; words: number } {
  if (pct < 34) return { length: "short", label: "Brief", words: 210 };
  if (pct > 66) return { length: "detailed", label: "Detailed", words: 430 };
  return { length: "standard", label: "Standard", words: 310 };
}
function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
function clampPct(n: number) { return Math.max(0, Math.min(100, n)); }

/* ───────────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────────────*/
function fitTone(score: number): "success" | "warning" | "accent" {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "accent";
}
function fitColor(tone: "success" | "warning" | "accent") {
  return tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : "var(--accent)";
}

/* ───────────────────────────────────────────────────────────────────
   JSON live stream token colouriser (syntax-highlight without deps)
────────────────────────────────────────────────────────────────────*/
function formatJsonStream(raw: string): string {
  if (!raw.trim()) return raw;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    let formatted = "";
    let indent = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (escaped) {
        formatted += char;
        escaped = false;
        continue;
      }
      if (char === "\\") {
        formatted += char;
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        formatted += char;
        continue;
      }
      if (inString) {
        formatted += char;
        continue;
      }

      if (char === "{" || char === "[") {
        indent += 2;
        formatted += char + "\n" + " ".repeat(indent);
      } else if (char === "}" || char === "]") {
        indent = Math.max(0, indent - 2);
        formatted += "\n" + " ".repeat(indent) + char;
      } else if (char === ",") {
        formatted += char + "\n" + " ".repeat(indent);
      } else {
        formatted += char;
      }
    }
    return formatted.replace(/\n\s*\n/g, "\n");
  }
}

function JsonToken({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => {
        const parts: { content: string; cls: string }[] = [];
        // Tokenise: key, string value, number, bool/null, bracket
        const re = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(true|false|null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],:])/g;
        let last = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line)) !== null) {
          if (m.index > last) parts.push({ content: line.slice(last, m.index), cls: "text-fg-low" });
          if (m[1]) parts.push({ content: m[0], cls: "text-accent-text" });         // key
          else if (m[2]) parts.push({ content: m[2], cls: "text-success" });        // string value
          else if (m[3]) parts.push({ content: m[3], cls: "text-warning" });        // bool/null
          else if (m[4]) parts.push({ content: m[4], cls: "text-[#e5c07b]" });      // number
          else parts.push({ content: m[5]!, cls: "text-fg-low opacity-60" });       // bracket/comma
          last = m.index + m[0].length;
        }
        if (last < line.length) parts.push({ content: line.slice(last), cls: "text-fg-low" });
        return (
          <div key={li}>
            {parts.map((p, i) => (
              <span key={i} className={p.cls}>{p.content}</span>
            ))}
          </div>
        );
      })}
    </>
  );
}

function parseJsonAnswer(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Return null on invalid JSON
  }
  return null;
}

function renderBoldInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold text-fg">{part.slice(2, -2)}</strong>;
        }
        return part;
      })}
    </>
  );
}

function FormattedValue({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const isList = lines.some((l) => l.startsWith("- ") || l.startsWith("* ") || /^\d+\.\s/.test(l));

  if (isList) {
    return (
      <ul className="mt-1 space-y-1.5 pl-0.5">
        {lines.map((line, idx) => {
          const clean = line.replace(/^[-*]\s+|\d+\.\s+/, "");
          return (
            <li key={idx} className="flex items-start gap-2 text-[12px] leading-snug text-fg">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>{renderBoldInline(clean)}</span>
            </li>
          );
        })}
      </ul>
    );
  }
  return <div className="text-[12.5px] leading-relaxed text-fg">{renderBoldInline(text)}</div>;
}

function AiAnswerView({ text, onApply }: { text: string; onApply?: (replacement: string) => void }) {
  const jsonObj = parseJsonAnswer(text);

  if (jsonObj) {
    const keys = Object.keys(jsonObj);
    return (
      <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-surface-2 p-3.5 shadow-sm">
        {keys.map((k) => {
          const val = String(jsonObj[k] || "").trim();
          if (!val) return null;
          const isRephrase = k.toLowerCase().includes("example") || k.toLowerCase().includes("rephrase");
          const title = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

          if (isRephrase) {
            return (
              <div key={k} className="rounded-[10px] border border-accent/40 bg-accent-weak/30 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-accent-text">
                  <Sparkles size={11} /> {title}
                </div>
                <p className="text-[12.5px] font-medium italic leading-relaxed text-fg">&ldquo;{val}&rdquo;</p>
                {onApply && (
                  <button
                    type="button"
                    onClick={() => onApply(val)}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-[6px] bg-accent px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-all hover:opacity-90 cursor-pointer"
                  >
                    <Check size={11} /> Replace selection with this
                  </button>
                )}
              </div>
            );
          }

          return (
            <div key={k} className="flex flex-col gap-1 rounded-[9px] border border-border/70 bg-surface p-3">
              <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-accent-text">
                {title}
              </div>
              <FormattedValue text={val} />
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback: Markdown / Text Formatter
  const lines = text.split("\n");
  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-border bg-surface-2 p-3.5 text-[12.5px] leading-relaxed text-fg">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const content = trimmed.replace(/^[-*]\s+/, "");
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span className="flex-1">{renderBoldInline(content)}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(trimmed)) {
          const content = trimmed.replace(/^\d+\.\s+/, "");
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="mt-0.5 shrink-0 font-mono text-[10px] font-semibold text-accent">{trimmed.match(/^\d+/)?.[0]}.</span>
              <span className="flex-1">{renderBoldInline(content)}</span>
            </div>
          );
        }
        if (trimmed.startsWith("#") || (trimmed.startsWith("**") && trimmed.endsWith("**"))) {
          const clean = trimmed.replace(/^#+\s*/, "").replace(/^\*\*/, "").replace(/\*\*$/, "");
          return (
            <div key={idx} className="mt-1 mb-0.5 font-semibold text-accent-text text-[12px]">
              {clean}
            </div>
          );
        }
        return <div key={idx}>{renderBoldInline(trimmed)}</div>;
      })}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────
   Modal: full-screen overlay (portal)
────────────────────────────────────────────────────────────────────*/
function ResearchModal({
  phase,
  agents,
  agentData,
  agentPartials,
  report,
  cachedAt,
  company,
  doneCount,
  total,
  onClose,
  onStop,
  onRerun,
}: {
  phase: ResearchPhase;
  agents: AgentUi[];
  agentData: Record<string, unknown>;
  agentPartials: Record<string, string>;
  report: WireReport | null;
  cachedAt: string | null;
  company: string;
  doneCount: number;
  total: number;
  onClose: () => void;
  onStop: () => void;
  onRerun: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Auto-scroll to bottom as tokens stream in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agentData, agentPartials]);

  const jsonStr = Object.keys(agentData).length
    ? JSON.stringify(agentData, null, 2)
    : null;

  const partialEntries = Object.entries(agentPartials);
  const pct = total > 0 ? (doneCount / total) * 100 : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
      style={{ animation: "cll-fade .18s ease" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[6px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal panel */}
      <div
        className="relative z-10 flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-[20px] border border-border bg-bg shadow-[0_32px_80px_-12px_rgba(0,0,0,.9)]"
        style={{
          background: "radial-gradient(140% 80% at 50% -5%, var(--accent-weak), transparent 55%), var(--bg)",
          animation: "cll-fade .2s ease",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Company Research"
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white"
            style={{ background: "var(--accent-grad)", boxShadow: "0 6px 18px -4px var(--accent-shadow)" }}
          >
            <Search size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-fg">Company Research</span>
              {phase === "running" ? (
                <Pill tone="accent" mono className="text-[9.5px]">
                  <StatDot tone="accent" pulse size={5} /> Live
                </Pill>
              ) : phase === "done" ? (
                <Pill tone="success" mono className="text-[9.5px]">Complete</Pill>
              ) : null}
            </div>
            <div className="font-mono text-[10.5px] text-fg-mid">
              {company || "—"}
              {phase === "running" ? ` · ${doneCount}/${total || agents.length} agents` : ""}
              {phase === "done" && report ? ` · ${report.meta.agents.length} agents · ${Math.round(report.meta.completeness * 100)}% filled` : ""}
              {cachedAt ? ` · from cache ${formatWhen(cachedAt)}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {phase === "running" ? (
              <Button type="button" variant="outline" size="sm" onClick={onStop}>
                <X size={13} /> Stop
              </Button>
            ) : phase === "done" ? (
              <Button type="button" variant="outline" size="sm" onClick={onRerun}>
                <RotateCw size={13} /> Re-run
              </Button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-border bg-surface text-fg-mid transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Body: two-column during running, full during done ───── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {phase === "running" ? (
            <>
              {/* Left: agent list */}
              <div className="flex w-[220px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-3">
                {/* Progress bar */}
                <div className="mb-2 px-1">
                  <div className="mb-1.5 flex justify-between font-mono text-[9.5px] text-fg-low">
                    <span>Agents</span>
                    <span>{doneCount}/{total || agents.length}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-input">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: "var(--accent-grad)" }}
                    />
                  </div>
                </div>
                {agents.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-[8px] px-2 py-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {a.status === "done" && <Check size={11} strokeWidth={2.8} className="text-success" />}
                      {a.status === "running" && <Loader2 size={11} className="animate-spin text-accent" />}
                      {a.status === "error" && <AlertTriangle size={11} className="text-danger" />}
                      {a.status === "queued" && <span className="block h-1.5 w-1.5 rounded-full bg-fg-low opacity-40" />}
                    </span>
                    <span
                      className={cn(
                        "flex-1 truncate text-[11.5px]",
                        a.status === "done" ? "text-fg" : a.status === "running" ? "text-accent-text font-medium" : "text-fg-low",
                      )}
                    >
                      {a.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Right: live JSON stream */}
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-4 py-2">
                  <span className="font-mono text-[10px] font-semibold text-fg-low uppercase tracking-[0.06em]">Live Stream Output</span>
                  <StatDot tone="accent" pulse size={5} />
                  <span className="ml-auto font-mono text-[9px] text-fg-low">real-time tokens</span>
                </div>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                  {/* Completed sections */}
                  {jsonStr && (
                    <div className="flex flex-col gap-2">
                      <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.06em] text-success flex items-center gap-1.5">
                        <Check size={11} strokeWidth={2.8} /> Completed section data
                      </div>
                      <pre className="font-mono text-[11px] leading-[1.75] break-all whitespace-pre-wrap rounded-[10px] bg-surface p-3 border border-border">
                        <JsonToken text={jsonStr} />
                      </pre>
                    </div>
                  )}

                  {/* Live streaming text for active agents */}
                  {partialEntries.map(([agentId, liveText]) => (
                    <div key={agentId} className="flex flex-col gap-2 rounded-[12px] border border-accent/40 bg-surface-2 p-3.5 shadow-[0_8px_24px_-8px_var(--accent-shadow)]">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-semibold text-accent-text flex items-center gap-1.5">
                          <Loader2 size={12} className="animate-spin text-accent" />
                          Streaming reasoning: {agentLabel(agentId)}
                        </span>
                        <Pill tone="accent" mono className="text-[8.5px] py-0 px-1.5 animate-pulse">typing</Pill>
                      </div>
                      <pre className="font-mono text-[11.5px] leading-[1.75] break-all whitespace-pre-wrap rounded-[10px] bg-surface p-3.5 border border-border/80 shadow-inner">
                        <JsonToken text={formatJsonStream(liveText)} />
                        <span className="cll-caret ml-0.5 inline-block h-3.5 w-1.5 bg-accent" aria-hidden />
                      </pre>
                    </div>
                  ))}

                  {!jsonStr && partialEntries.length === 0 && (
                    <div className="flex h-full items-center justify-center py-12">
                      <div className="text-center">
                        <Loader2 size={22} className="mx-auto mb-3 animate-spin text-accent" />
                        <p className="text-[12px] text-fg-mid">Agents gathering web sources & initializing LLM reasoning…</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : phase === "done" && report ? (
            <div className="flex min-w-0 flex-1 flex-col gap-0 overflow-y-auto">
              <FullReport report={report} cachedAt={cachedAt} />
            </div>
          ) : phase === "error" ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="text-center">
                <span className="mb-4 inline-grid h-14 w-14 place-items-center rounded-[16px] bg-danger-weak text-danger">
                  <AlertTriangle size={22} />
                </span>
                <p className="mt-3 text-[14px] font-semibold text-fg">Research failed</p>
                <p className="mt-1 text-[12.5px] text-fg-mid">Check that the backend and LLM provider are reachable.</p>
                <Button type="button" variant="primary" size="md" className="mt-5" onClick={onRerun}>
                  <RotateCw size={14} /> Try again
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────────────────────────────────────────────────
   Full report sections (shown inside modal when done)
────────────────────────────────────────────────────────────────────*/
function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-[12px] border border-border bg-surface", className)}>{children}</div>;
}
function SectionHead({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="text-[13.5px] font-semibold text-fg">{title}</div>
      {aside}
    </div>
  );
}

function FullReport({ report, cachedAt }: { report: WireReport; cachedAt: string | null }) {
  const fit = report.fit;
  const tone = fitTone(fit.score);
  const color = fitColor(tone);
  const f = report.firmographics;

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Meta */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="success" mono className="text-[9.5px]">Complete</Pill>
        {report.meta.completeness > 0 && (
          <Pill tone="accent" mono className="text-[9.5px]">{Math.round(report.meta.completeness * 100)}% Filled</Pill>
        )}
        {report.meta.from_cache && cachedAt && (
          <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[9px] text-fg-low">
            From cache · {formatWhen(cachedAt)}
          </span>
        )}
        {report.meta.duration_s != null && (
          <span className="font-mono text-[9px] text-fg-low">· {report.meta.duration_s}s</span>
        )}
        {report.meta.agents.length > 0 && (
          <span className="font-mono text-[9px] text-fg-low">· {report.meta.agents.length} agents</span>
        )}
      </div>

      {/* Fit score */}
      {fit.score > 0 && (
        <Panel className="flex items-center gap-5 p-5">
          <ScoreRing
            value={fit.score}
            size={80}
            thickness={7}
            color={color}
            track="var(--border)"
            bg="var(--surface)"
            label="/ 100"
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-accent-text">Fit score</span>
              {fit.verdict && <Pill tone={tone} mono className="text-[9.5px]">{fit.verdict}</Pill>}
            </div>
            <p className="mt-1.5 text-[13.5px] leading-[1.6] text-fg">
              {fit.recommendation ?? "Your profile was scored against this posting locally."}
            </p>
          </div>
        </Panel>
      )}

      {/* Fit breakdown */}
      {fit.dimensions.length > 0 && (
        <Panel className="p-5">
          <SectionHead title="Fit breakdown" aside={<span className="font-mono text-[9px] text-fg-low">you vs role need</span>} />
          <div className="flex flex-col gap-3.5">
            {fit.dimensions.map((b) => (
              <div key={b.name}>
                <div className="mb-1.5 flex justify-between text-[12px]">
                  <span className="text-fg">{b.name}</span>
                  <span className="font-mono text-accent-text">{b.you} / {b.role_need}</span>
                </div>
                <div className="relative h-1.5 rounded-full bg-input">
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${clampPct(b.you)}%`, background: "var(--accent-grad)" }} />
                  <div className="absolute -bottom-[3px] -top-[3px] w-0.5 rounded-full" style={{ left: `${clampPct(b.role_need)}%`, background: "var(--text-mid)" }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Firmographics */}
      {(f.industry || f.size || f.hq || f.founded || f.website) && (
        <Panel className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          {[
            f.industry && { k: "Industry", v: f.industry },
            (f.size ?? f.employees) && { k: "Size", v: f.size ?? `${f.employees?.toLocaleString()} employees` },
            f.hq && { k: "HQ", v: f.hq },
            f.founded && { k: "Founded", v: f.founded },
            f.website && {
              k: "Website", v: (
                <a href={f.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent-text hover:underline">
                  <ExternalLink size={10} /> {f.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                </a>
              )
            },
          ].filter(Boolean).map((it) => (
            <div key={(it as { k: string }).k}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">{(it as { k: string }).k}</div>
              <div className="mt-1 text-[12.5px] font-semibold text-fg">{(it as { v: React.ReactNode }).v}</div>
            </div>
          ))}
        </Panel>
      )}

      {/* Overview */}
      {(report.overview.summary || report.overview.mission || report.overview.division_context) && (
        <Panel className="p-5">
          <SectionHead title="Company overview" />
          <div className="flex flex-col gap-3 text-[13px] leading-[1.7] text-fg-mid">
            {report.overview.summary && <p>{report.overview.summary}</p>}
            {report.overview.mission && (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">Mission</div>
                <p>{report.overview.mission}</p>
              </div>
            )}
            {report.overview.division_context && (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">Your team / division</div>
                <p>{report.overview.division_context}</p>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Role analysis */}
      {(report.role.responsibilities.length || report.role.must_haves.length || report.role.nice_to_haves.length) ? (
        <Panel className="p-5">
          <SectionHead
            title="Role analysis"
            aside={report.role.title ? <span className="truncate font-mono text-[9px] text-fg-low max-w-[45%]">{report.role.title}</span> : undefined}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Responsibilities", list: report.role.responsibilities },
              { label: "Must-haves", list: report.role.must_haves },
              { label: "Nice to have", list: report.role.nice_to_haves },
            ].filter((c) => c.list.length).map((c) => (
              <div key={c.label}>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">{c.label}</div>
                <ul className="flex flex-col gap-1.5 text-[12.5px] leading-[1.5] text-fg-mid">
                  {c.list.map((x) => (
                    <li key={x} className="flex gap-2">
                      <span className="text-accent">—</span>
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {report.role.keywords.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">Keywords</div>
              <div className="flex flex-wrap gap-1.5">
                {report.role.keywords.map((k) => (
                  <span key={k} className="rounded-[7px] bg-surface-2 px-2.5 py-1 text-[11.5px] text-fg-mid">{k}</span>
                ))}
              </div>
            </div>
          )}
        </Panel>
      ) : null}

      {/* Values */}
      {report.values.length > 0 && (
        <Panel className="p-5">
          <SectionHead title="What they value" />
          <div className="flex flex-col gap-3.5">
            {report.values.map((v) => (
              <div key={v.name}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-fg">{v.name}</span>
                  {v.weight > 0 && <span className="font-mono text-[9px] text-fg-low">{clampPct(v.weight)}</span>}
                </div>
                {v.weight > 0 && (
                  <div className="mt-1.5 h-1 rounded-full bg-input">
                    <div className="h-full rounded-full" style={{ width: `${clampPct(v.weight)}%`, background: "var(--accent-grad)" }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Culture */}
      {(report.culture.ways_of_working.length || report.culture.notes.length) ? (
        <Panel className="p-5">
          <SectionHead title="Culture" />
          {report.culture.ways_of_working.length > 0 && (
            <div className="flex flex-col gap-2.5 text-[13px] leading-[1.6] text-fg-mid">
              {report.culture.ways_of_working.map((w) => (
                <div key={w} className="flex gap-2.5"><span className="text-accent">—</span><span>{w}</span></div>
              ))}
            </div>
          )}
          {report.culture.notes.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {report.culture.notes.map((n) => (
                <div key={n.text} className="rounded-[9px] bg-surface-2 p-2.5">
                  <p className="text-[12px] leading-[1.6] text-fg-mid">{n.text}</p>
                  {n.source?.label && (
                    <div className="mt-1.5"><SourceChip label={n.source.label} href={n.source.url ?? undefined} /></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {/* Tech stack */}
      {report.tech_stack.length > 0 && (
        <Panel className="p-5">
          <SectionHead
            title="Tech stack"
            aside={
              <div className="flex gap-3 font-mono text-[9px] text-fg-mid">
                <span className="flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: "var(--success)" }} /> you know</span>
                <span className="flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: "var(--accent)" }} /> worth learning</span>
              </div>
            }
          />
          <div className="flex flex-wrap gap-1.5">
            {report.tech_stack.map((t) => (
              <span
                key={t.name}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11.5px]",
                  t.you_know ? "bg-success-weak text-fg" : "bg-accent-weak text-accent-text",
                )}
              >
                <span className="h-1.5 w-1.5 rounded-[2px]" style={{ background: t.you_know ? "var(--success)" : "var(--accent)" }} />
                {t.name}
              </span>
            ))}
          </div>
        </Panel>
      )}

      {/* Skills */}
      {(fit.matched_skills.length || fit.gaps.length) ? (
        <Panel className="p-5">
          <SectionHead title="Your skills vs the role" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2.5 text-[10.5px] font-semibold tracking-[0.01em] text-success">Matched · {fit.matched_skills.length}</div>
              <div className="flex flex-wrap gap-1.5">
                {fit.matched_skills.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5 rounded-[7px] bg-success-weak px-2.5 py-1 text-[11.5px] text-fg">
                    <Check size={11} strokeWidth={2.4} className="text-success" />{s}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2.5 text-[10.5px] font-semibold tracking-[0.01em] text-warning">Gaps · {fit.gaps.length}</div>
              <div className="flex flex-wrap gap-1.5">
                {fit.gaps.map((s) => (
                  <span key={s} className="rounded-[7px] border border-dashed border-border-strong bg-input px-2.5 py-1 text-[11.5px] text-fg-mid">{s}</span>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {/* Recent signals */}
      {report.signals.length > 0 && (
        <Panel className="p-5">
          <SectionHead title="Recent signals" />
          <div className="flex flex-col gap-3">
            {report.signals.map((s) => (
              <div key={s.headline} className="border-l-2 border-border-strong pl-3">
                <div className="flex items-start justify-between gap-3">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-fg hover:text-accent-text transition-colors">{s.headline}</a>
                  ) : (
                    <span className="text-[13px] font-medium text-fg">{s.headline}</span>
                  )}
                  {s.date && <span className="shrink-0 font-mono text-[9px] text-fg-low">{s.date}</span>}
                </div>
                {s.why_it_matters && <p className="mt-1 text-[12px] leading-[1.6] text-fg-mid">{s.why_it_matters}</p>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Interview prep */}
      {report.interview.length > 0 && (
        <Panel className="p-5">
          <SectionHead title="Interview prep" />
          <div className="flex flex-col gap-2.5 text-[13px] leading-[1.6] text-fg-mid">
            {[...report.interview].sort((a, b) => a.order - b.order).map((it) => (
              <div key={`${it.order}-${it.area}`} className="flex gap-2.5">
                <span className="font-mono text-accent">{String(it.order).padStart(2, "0")}</span>
                <span>
                  <span className="text-fg">{it.area}</span>
                  {it.note && <span> — {it.note}</span>}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Letter hooks */}
      {report.ammo.length > 0 && (
        <Panel className="p-5">
          <SectionHead title="Letter hooks · ammo" aside={<Zap size={13} className="text-accent" />} />
          <div className="flex flex-col gap-2.5">
            {report.ammo.map((h, i) => (
              <div key={h.hook} className="flex gap-2.5">
                <span className="font-mono text-[10px] text-accent shrink-0 mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <span className="text-[13px] text-fg">{h.hook}</span>
                  {h.use_in_letter && <span className="mt-0.5 block text-[12px] text-fg-low">{h.use_in_letter}</span>}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Missing */}
      {report.meta.missing.length > 0 && (
        <p className="px-1 text-[11px] leading-relaxed text-fg-low">
          Sections with no data: {report.meta.missing.join(", ")}.
        </p>
      )}

      {/* Sources */}
      {report.meta.sources.length > 0 && (
        <Panel className="p-4">
          <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-low">Sources</div>
          <div className="flex flex-col gap-2.5">
            {report.meta.sources.map((s, i) => {
              const inner = (
                <>
                  <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] bg-accent-weak font-mono text-[9px] text-accent-text">{i + 1}</span>
                  <span className="truncate text-[11.5px] text-fg-mid">{s.label}</span>
                  {s.url && <ExternalLink size={11} className="ml-auto shrink-0 text-fg-low" />}
                </>
              );
              return s.url ? (
                <a key={`${s.label}-${i}`} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-fg transition-colors">{inner}</a>
              ) : (
                <div key={`${s.label}-${i}`} className="flex items-center gap-2">{inner}</div>
              );
            })}
          </div>
        </Panel>
      )}

      <p className="pb-1 text-center text-[10px] text-fg-low">
        ✦ This intel is automatically used when generating your cover letter.
      </p>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────
   Compact Intel Summary card (shown inline below company field)
────────────────────────────────────────────────────────────────────*/
function CompactIntelCard({
  report,
  cachedAt,
  expanded,
  onToggle,
  onRerun,
  onViewDetails,
}: {
  report: WireReport;
  cachedAt: string | null;
  expanded: boolean;
  onToggle: () => void;
  onRerun: () => void;
  onViewDetails: () => void;
}) {
  const f = report.firmographics;
  const fit = report.fit;
  const tone = fitTone(fit.score);
  const color = fitColor(tone);
  const knowTech = report.tech_stack.filter((t) => t.you_know).slice(0, 4);
  const learnTech = report.tech_stack.filter((t) => !t.you_know && t.worth_learning).slice(0, 3);
  const hooks = report.ammo.slice(0, 2);
  const cultureLines = report.culture.ways_of_working.slice(0, 2);

  return (
    <div
      className="cll-fade mt-3 overflow-hidden rounded-[12px] border border-border bg-surface-2"
      style={{ background: "radial-gradient(160% 100% at 50% -10%, var(--accent-weak), transparent 55%), var(--surface-2)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-white"
          style={{ background: "var(--accent-grad)", boxShadow: "0 4px 12px -4px var(--accent-shadow)" }}
        >
          <Sparkles size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-fg">Company Intel</span>
            <Pill tone="success" mono className="py-0 px-1.5 text-[9px]">Ready</Pill>
            {report.meta.from_cache && cachedAt && (
              <span className="font-mono text-[9px] text-fg-low">{formatWhen(cachedAt)}</span>
            )}
          </div>
          <div className="truncate font-mono text-[10px] text-fg-mid">
            {report.meta.agents.length || "8"} agents · {Math.round(report.meta.completeness * 100)}% filled
            {fit.score > 0 ? ` · Fit: ${fit.score}/100` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* View details button */}
          <button
            type="button"
            onClick={onViewDetails}
            className="flex items-center gap-1 rounded-[6px] border border-accent/40 bg-accent-weak px-2 py-1 text-[10px] font-semibold text-accent-text hover:bg-accent hover:text-white transition-all"
          >
            <Search size={10} /> Details
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRerun(); }}
            className="flex items-center gap-1 rounded-[6px] border border-border bg-surface px-2 py-1 text-[10px] font-semibold text-fg-mid hover:text-fg transition-colors"
          >
            <RotateCw size={10} /> Re-run
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="flex h-6 w-6 items-center justify-center rounded-[6px] text-fg-low hover:text-fg transition-colors"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border px-3.5 pb-3.5 pt-3 flex flex-col gap-3">
          {/* Firmographics */}
          {(f.industry || f.hq) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {f.industry && (
                <span className="text-[11.5px] text-fg-mid">
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">Industry</span>{f.industry}
                </span>
              )}
              {(f.size ?? f.employees) && (
                <span className="text-[11.5px] text-fg-mid">
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">Size</span>
                  {f.size ?? `${f.employees?.toLocaleString()} employees`}
                </span>
              )}
              {f.hq && (
                <span className="text-[11.5px] text-fg-mid">
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">HQ</span>{f.hq}
                </span>
              )}
            </div>
          )}

          {/* Fit score bar */}
          {fit.score > 0 && (
            <div className="flex items-center gap-2.5 rounded-[9px] border border-border bg-surface px-3 py-2">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[14px] font-bold"
                style={{ background: `${color}20`, color }}
              >
                {fit.score}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] font-semibold text-fg">Fit score</span>
                  {fit.verdict && <Pill tone={tone} mono className="py-0 px-1.5 text-[9px]">{fit.verdict}</Pill>}
                </div>
                {fit.recommendation && (
                  <p className="mt-0.5 text-[10.5px] leading-snug text-fg-mid line-clamp-2">{fit.recommendation}</p>
                )}
              </div>
            </div>
          )}

          {/* Tech stack */}
          {(knowTech.length > 0 || learnTech.length > 0) && (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">Tech stack</div>
              <div className="flex flex-wrap gap-1">
                {knowTech.map((t) => (
                  <span key={t.name} className="inline-flex items-center gap-1 rounded-[6px] bg-success-weak px-2 py-0.5 text-[11px] text-fg">
                    <span className="h-1 w-1 rounded-[2px] bg-success" />{t.name}
                  </span>
                ))}
                {learnTech.map((t) => (
                  <span key={t.name} className="inline-flex items-center gap-1 rounded-[6px] bg-accent-weak px-2 py-0.5 text-[11px] text-accent-text">
                    <span className="h-1 w-1 rounded-[2px] bg-accent" />{t.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Culture */}
          {cultureLines.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">Culture</div>
              {cultureLines.map((w) => (
                <div key={w} className="flex gap-2 text-[11.5px] text-fg-mid">
                  <span className="text-accent shrink-0">—</span><span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Letter hooks */}
          {hooks.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">
                <Zap size={10} className="text-accent" /> Letter hooks
              </div>
              {hooks.map((h, i) => (
                <div key={h.hook} className="flex gap-2 text-[11.5px] mb-1">
                  <span className="font-mono text-[9.5px] text-accent shrink-0 mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-fg-mid">{h.hook}</span>
                </div>
              ))}
            </div>
          )}

          {/* View full details CTA */}
          <button
            type="button"
            onClick={onViewDetails}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-[9px] border border-dashed border-border bg-surface py-2 text-[11.5px] font-semibold text-fg-mid hover:border-accent hover:text-accent-text transition-all"
          >
            <Search size={12} /> View full report · role analysis · all sources
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────
   Compact running panel (inline, no modal)
────────────────────────────────────────────────────────────────────*/
function ResearchRunningInline({
  agents,
  company,
  doneCount,
  total,
  onStop,
  onOpenModal,
}: {
  agents: AgentUi[];
  company: string;
  doneCount: number;
  total: number;
  onStop: () => void;
  onOpenModal: () => void;
}) {
  const pct = total > 0 ? (doneCount / total) * 100 : 0;
  return (
    <div
      className="cll-fade mt-3 overflow-hidden rounded-[12px] border border-border bg-surface-2"
      style={{ background: "radial-gradient(160% 100% at 50% -10%, var(--accent-weak), transparent 55%), var(--surface-2)" }}
    >
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-white"
          style={{ background: "var(--accent-grad)", boxShadow: "0 4px 12px -4px var(--accent-shadow)" }}
        >
          <Search size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-fg truncate">Researching {company || "company"}…</span>
            <StatDot tone="accent" pulse glow size={6} />
          </div>
          <div className="font-mono text-[10px] text-fg-mid">{doneCount} / {total || agents.length} agents</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenModal}
            className="flex items-center gap-1 rounded-[6px] border border-accent/40 bg-accent-weak px-2 py-1 text-[10px] font-semibold text-accent-text hover:bg-accent hover:text-white transition-all"
          >
            <Sparkles size={10} /> Live view
          </button>
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-1 rounded-[6px] border border-border bg-surface px-2 py-1 text-[10px] font-semibold text-fg-mid hover:text-fg transition-colors"
          >
            <X size={10} /> Stop
          </button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="mx-3.5 mb-2.5 h-1 overflow-hidden rounded-full bg-input">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: "var(--accent-grad)" }}
        />
      </div>
      {/* Mini agent list */}
      <div className="grid grid-cols-2 gap-0.5 px-2 pb-2.5">
        {agents.slice(0, 8).map((a) => (
          <div key={a.id} className="flex items-center gap-1.5 rounded-[7px] px-2 py-1">
            <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              {a.status === "done" && <Check size={10} strokeWidth={2.8} className="text-success" />}
              {a.status === "running" && <Loader2 size={10} className="animate-spin text-accent" />}
              {a.status === "error" && <AlertTriangle size={10} className="text-danger" />}
              {a.status === "queued" && <span className="block h-1.5 w-1.5 rounded-full bg-fg-low opacity-40" />}
            </span>
            <span className={cn(
              "truncate text-[11px]",
              a.status === "done" ? "text-fg" : a.status === "running" ? "text-accent-text" : "text-fg-low",
            )}>
              {a.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────
   Research prompt button
────────────────────────────────────────────────────────────────────*/
function ResearchPromptButton({
  company, onRun, onReRun, checking, cachedAt, onViewCache,
}: {
  company: string; onRun: () => void; onReRun: () => void; checking: boolean;
  cachedAt: string | null; onViewCache: () => void;
}) {
  if (cachedAt) {
    return (
      <div className="cll-fade mt-3 flex items-center justify-between gap-3 rounded-[12px] border border-accent/40 bg-surface-2 px-3.5 py-2.5 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <StatDot tone="accent" pulse size={7} />
          <span className="text-[12px] font-semibold text-fg truncate">Researched & Brainstormed</span>
          <span className="font-mono text-[10px] text-fg-low shrink-0">· {formatWhen(cachedAt)}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button type="button" variant="solid" size="sm" className="h-7 px-2.5 text-[11px]" onClick={onViewCache}>View intel</Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={onReRun}>Re-run</Button>
        </div>
      </div>
    );
  }

  const active = Boolean(company.trim() && !checking);

  return (
    <button
      type="button"
      onClick={onRun}
      disabled={!active}
      className={cn(
        "cll-fade mt-3 flex w-full items-center justify-between gap-3 rounded-[12px] border px-3.5 py-2.5 text-left transition-all duration-200",
        active
          ? "border-accent/40 bg-gradient-to-r from-accent-weak/30 via-surface to-surface hover:border-accent hover:shadow-[0_4px_16px_-4px_var(--accent-shadow)] cursor-pointer"
          : "border-border/50 bg-surface-2/40 opacity-65 cursor-not-allowed",
      )}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] transition-all",
            active ? "bg-accent-grad text-white shadow-sm" : "bg-input text-fg-low",
          )}
        >
          {checking ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        </span>
        <span className="text-[12.5px] font-bold text-fg group-hover:text-accent-text transition-colors truncate">
          {checking
            ? "Checking cache…"
            : company.trim()
            ? `Run Deep Search on ${company}?`
            : "Run Deep Search on Company? (Optional)"}
        </span>
      </span>

      {active && (
        <span className="flex items-center gap-1 text-[11.5px] font-semibold text-accent-text shrink-0">
          <span>Start Search</span>
          <ArrowRight size={13} />
        </span>
      )}
    </button>
  );
}

/* ───────────────────────────────────────────────────────────────────
   Tailoring Questions button & modal
────────────────────────────────────────────────────────────────────*/
function TailoringQuestionsButton({
  company,
  answeredCount,
  onClick,
}: {
  company: string;
  answeredCount: number;
  onClick: () => void;
}) {
  const active = Boolean(company.trim());
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!active}
      className={cn(
        "cll-fade mt-2 flex w-full items-center justify-between gap-3 rounded-[12px] border px-3.5 py-2.5 text-left transition-all duration-200",
        active
          ? "border-accent/40 bg-gradient-to-r from-accent-weak/30 via-surface to-surface hover:border-accent hover:shadow-[0_4px_16px_-4px_var(--accent-shadow)] cursor-pointer"
          : "border-border/50 bg-surface-2/40 opacity-65 cursor-not-allowed",
      )}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] transition-all",
            active ? "bg-accent-grad text-white shadow-sm" : "bg-input text-fg-low",
          )}
        >
          <MessageSquare size={14} />
        </span>
        <span className="text-[12.5px] font-bold text-fg group-hover:text-accent-text transition-colors truncate">
          {answeredCount > 0
            ? `Tailoring Q&A (${answeredCount} Answered)`
            : company.trim()
            ? `Answer Tailoring Questions for ${company}?`
            : "Answer Tailoring Questions? (Optional)"}
        </span>
      </span>

      {active && (
        <span className="flex items-center gap-1 text-[11.5px] font-semibold text-accent-text shrink-0">
          <span>{answeredCount > 0 ? "Edit Answers" : "Open Q&A"}</span>
          <ArrowRight size={13} />
        </span>
      )}
    </button>
  );
}

function TailoringQuestionsModal({
  company,
  questions,
  answers,
  loading,
  onGenerateQuestions,
  onSave,
  onClear,
  onClose,
}: {
  company: string;
  questions: TailoringQuestion[];
  answers: Record<string, string>;
  loading: boolean;
  onGenerateQuestions: (count: number, focus: string) => Promise<void>;
  onSave: (newAnswers: Record<string, string>) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [modalStep, setModalStep] = useState<"setup" | "qna">(questions.length > 0 ? "qna" : "setup");

  // Setup Parameters
  const [countMode, setCountMode] = useState<"preset" | "custom">("preset");
  const [presetCount, setPresetCount] = useState<number>(3);
  const [customCountInput, setCustomCountInput] = useState<string>("5");

  const [focusMode, setFocusMode] = useState<"preset" | "custom">("preset");
  const [presetFocus, setPresetFocus] = useState<string>("all");
  const [customFocusInput, setCustomFocusInput] = useState<string>("");

  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({ ...answers });

  const answeredCount = Object.values(draftAnswers).filter((v) => v.trim()).length;

  const getEffectiveCount = (): number => {
    if (countMode === "custom") {
      const parsed = parseInt(customCountInput.trim(), 10);
      return !isNaN(parsed) && parsed > 0 ? Math.min(10, parsed) : 3;
    }
    return presetCount;
  };

  const getEffectiveFocus = (): string => {
    if (focusMode === "custom") {
      return customFocusInput.trim() || "all";
    }
    return presetFocus;
  };

  const handleStartGeneration = async () => {
    const finalCount = getEffectiveCount();
    const finalFocus = getEffectiveFocus();

    if (focusMode === "custom" && !customFocusInput.trim()) {
      toast.danger("Please enter a custom focus topic or choose a preset.");
      return;
    }

    setModalStep("qna");
    await onGenerateQuestions(finalCount, finalFocus);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative flex max-h-[88vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[18px] border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent-grad text-white shadow-sm">
              <MessageSquare size={16} />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-fg">Targeted Application Questions</h2>
              <p className="text-[11.5px] text-fg-mid">
                {company ? `Tailored specifically for ${company}` : "Targeted Q&A for your cover letter"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-fg-low hover:bg-surface-2 hover:text-fg transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {modalStep === "setup" ? (
            <div className="space-y-6 pt-1">
              <div className="space-y-1">
                <h3 className="text-[14px] font-semibold text-fg">Customize Your Question Session</h3>
                <p className="text-[12px] text-fg-mid">
                  Select how many questions to generate and choose a focus topic tailored for {company || "the company"}.
                </p>
              </div>

              {/* Question Count Option */}
              <div className="space-y-2.5">
                <label className="text-[12px] font-medium text-fg">How many questions would you like to answer?</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[3, 5, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setCountMode("preset");
                        setPresetCount(num);
                      }}
                      className={cn(
                        "py-3 px-3 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center gap-1 cursor-pointer",
                        countMode === "preset" && presetCount === num
                          ? "bg-accent-weak border-accent text-accent-text shadow-sm"
                          : "bg-surface-2/60 border-border/60 text-fg-mid hover:bg-surface-2",
                      )}
                    >
                      <span className="text-sm font-bold text-fg">{num} Questions</span>
                      <span className="text-[10px] text-fg-low font-normal">
                        {num === 3 ? "~2 min quick" : num === 5 ? "~4 min standard" : "~8 min deep dive"}
                      </span>
                    </button>
                  ))}
                  <div
                    onClick={() => setCountMode("custom")}
                    className={cn(
                      "py-2.5 px-3 rounded-xl border transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer",
                      countMode === "custom"
                        ? "bg-accent-weak border-accent text-accent-text shadow-sm"
                        : "bg-surface-2/60 border-border/60 text-fg-mid hover:bg-surface-2",
                    )}
                  >
                    <span className="text-xs font-bold flex items-center gap-1 text-fg">
                      Custom
                    </span>
                    {countMode === "custom" ? (
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={customCountInput}
                        onChange={(e) => setCustomCountInput(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Qty (1-10)"
                        className="w-full h-7 bg-surface border border-accent rounded-lg px-2 text-center text-xs text-fg focus:outline-none font-semibold"
                        autoFocus
                      />
                    ) : (
                      <span className="text-[10px] text-fg-low font-normal">Enter count</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Focus Area Option */}
              <div className="space-y-2.5">
                <label className="text-[12px] font-medium text-fg">Select Focus Topic / Area</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: "all", label: "All-Round Fit", desc: "Balanced profile alignment" },
                    { id: "technical", label: "Technical Deep Dive", desc: "Architecture & engineering" },
                    { id: "culture", label: "Culture & Mission", desc: "Values & team alignment" },
                    { id: "projects", label: "Projects & Metrics", desc: "Key wins & measurable impact" },
                    { id: "gaps", label: "Skill Gaps & Growth", desc: "Address role requirements" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setFocusMode("preset");
                        setPresetFocus(f.id);
                      }}
                      className={cn(
                        "p-3 rounded-xl border text-left transition-all flex flex-col gap-0.5 cursor-pointer",
                        focusMode === "preset" && presetFocus === f.id
                          ? "bg-accent-weak border-accent text-accent-text shadow-sm"
                          : "bg-surface-2/60 border-border/60 text-fg-mid hover:bg-surface-2",
                      )}
                    >
                      <span className="text-[12px] font-bold text-fg">{f.label}</span>
                      <span className="text-[10px] text-fg-low">{f.desc}</span>
                    </button>
                  ))}

                  <div
                    onClick={() => setFocusMode("custom")}
                    className={cn(
                      "p-2.5 rounded-xl border transition-all flex flex-col justify-between gap-1.5 cursor-pointer",
                      focusMode === "custom"
                        ? "bg-accent-weak border-accent text-accent-text shadow-sm"
                        : "bg-surface-2/60 border-border/60 text-fg-mid hover:bg-surface-2",
                    )}
                  >
                    <span className="text-[12px] font-bold text-fg">Custom Topic</span>
                    {focusMode === "custom" ? (
                      <input
                        type="text"
                        value={customFocusInput}
                        onChange={(e) => setCustomFocusInput(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="e.g. AI Safety, Distributed Systems..."
                        className="w-full h-7 bg-surface border border-accent rounded-lg px-2 text-xs text-fg focus:outline-none font-medium"
                        autoFocus
                      />
                    ) : (
                      <span className="text-[10px] text-fg-low">Type custom focus</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 size={24} className="animate-spin text-accent" />
              <p className="mt-3 text-[13px] font-medium text-fg">Generating job-specific AI questions…</p>
              <p className="mt-1 text-[11.5px] text-fg-mid">Analyzing your profile & target role context</p>
            </div>
          ) : questions.length === 0 ? (
            <div className="py-8 text-center text-fg-mid text-[13px]">
              No tailoring questions available right now. You can proceed directly to generate your cover letter!
            </div>
          ) : (
            questions.map((q, idx) => (
              <div key={q.id || idx} className="rounded-[14px] border border-border/80 bg-surface-2/40 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[13px] font-bold text-fg leading-snug">
                    <span className="text-accent mr-1">Q{idx + 1}.</span> {q.question}
                  </span>
                </div>
                {q.context && (
                  <div className="flex items-center gap-1.5 text-[11px] text-accent-text font-medium bg-accent-weak/40 rounded-[6px] px-2.5 py-1 w-fit">
                    <Info size={12} className="shrink-0" />
                    <span>Why ask: {q.context}</span>
                  </div>
                )}
                <Textarea
                  value={draftAnswers[q.question] || ""}
                  onChange={(e) =>
                    setDraftAnswers((prev) => ({
                      ...prev,
                      [q.question]: e.target.value,
                    }))
                  }
                  placeholder={q.placeholder || "Type your specific story, metric, or answer here…"}
                  className="mt-2 text-[12.5px] min-h-[75px]"
                />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/80 bg-surface-2/30 px-6 py-3.5">
          {modalStep === "setup" ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-[12px]">
                Cancel
              </Button>
              <Button
                type="button"
                variant="solid"
                size="sm"
                onClick={handleStartGeneration}
                className="text-[12px] px-4"
              >
                <Sparkles size={14} className="mr-1.5" />
                Generate {getEffectiveCount()} Questions
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalStep("setup")}
                  className="text-[12px]"
                >
                  Change Setup
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraftAnswers({});
                    onClear();
                  }}
                  className="text-[12px] text-fg-low hover:text-danger"
                >
                  Clear All
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-[12px]">
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="solid"
                  size="sm"
                  onClick={() => {
                    onSave(draftAnswers);
                    onClose();
                  }}
                  className="text-[12px] px-4"
                >
                  <Check size={14} className="mr-1.5" />
                  {answeredCount > 0 ? `Apply ${answeredCount} Answer${answeredCount > 1 ? "s" : ""}` : "Save & Close"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────────────────────────────────────────────────
   Main Write component
────────────────────────────────────────────────────────────────────*/
export function Write() {
  /* Letter inputs */
  const [company, setCompanyRaw] = useState("");
  const [role, setRole] = useState("");
  const [jobPosting, setJobPosting] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [tone, setTone] = useState<Tone>("warm");
  const [toneAutoDetected, setToneAutoDetected] = useState(false);
  const styleState = useAsync(getStyle, []);

  useEffect(() => {
    if (styleState.data?.style_profile?.tone) {
      const derived = deriveDefaultTone(styleState.data.style_profile.tone);
      setTone(derived);
      setToneAutoDetected(true);
    }
  }, [styleState.data]);
  const [lengthPct, setLengthPct] = useState(50);
  const [grounded, setGrounded] = useState(true);

  const handleJobUrlImport = async () => {
    const url = jobUrl.trim();
    if (!url) return;
    setImportingUrl(true);
    try {
      const data = await autofillFromJobUrl(url);
      const updated: string[] = [];

      if (data.company && data.company.trim()) {
        setCompany(data.company.trim());
        updated.push("company");
      }
      if (data.role && data.role.trim()) {
        setRole(data.role.trim());
        updated.push("role");
      }
      if (data.job_description && data.job_description.trim()) {
        setJobPosting(data.job_description.trim());
        updated.push("description");
      }

      if (updated.length > 0) {
        toast.success(
          "Job details imported!",
          `Updated: ${updated.join(", ")} from link.`
        );
      } else {
        toast.warning(
          "No details extracted",
          "Could not identify company or role from that URL. Try pasting the description directly."
        );
      }
    } catch (err: unknown) {
      toast.danger("Couldn't import job link", errorMessage(err));
    } finally {
      setImportingUrl(false);
    }
  };

  const [letter, setLetter] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);

  const [claims, setClaims] = useState<ReviewClaim[] | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [_pii, setPii] = useState<PiiFinding[]>([]);

  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const jobIdRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [searchParams] = useSearchParams();
  const bootRef = useRef(false);

  // Selection AI toolbar
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [aiMode, setAiMode] = useState<"menu" | "custom" | "ask">("menu");
  const [aiInput, setAiInput] = useState("");
  const [aiWorking, setAiWorking] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);

  // App Info Modal & Custom Instruction
  const [editAppModalOpen, setEditAppModalOpen] = useState(false);
  const [customInstruction, setCustomInstruction] = useState("");

  // AI Career Advisor Chat Modal & Context State
  interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }

  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatWorking, setChatWorking] = useState(false);

  const handleSendChatMessage = async (presetMessage?: string) => {
    const query = (presetMessage || chatInput).trim();
    if (!query || chatWorking) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!presetMessage) setChatInput("");
    setChatWorking(true);

    const researchIntel = researchReport
      ? typeof researchReport.overview === "string"
        ? researchReport.overview
        : (researchReport.overview as { summary?: string })?.summary || JSON.stringify(researchReport.overview)
      : "None";

    const tailoringContext = Object.keys(tailoringAnswers).length > 0
      ? Object.entries(tailoringAnswers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n")
      : "None";

    const contextInstruction = `
You are an elite Executive Recruiter and Senior Career Advisor. You are providing strategic counseling to the user about their application.

[APPLICATION CONTEXT]
- Target Company: ${company || "Not specified"}
- Target Role: ${role || "Not specified"}
- Job Description Snippet: ${jobPosting.slice(0, 400) || "None"}
- Company Deep Research Intel: ${researchIntel}
- Candidate Questionnaire Responses:
${tailoringContext}

[CURRENT COVER LETTER DRAFT]
${letter || "Draft not generated yet"}

[STRICT BEHAVIORAL DIRECTIVES]
- You are a CONVERSATIONAL ADVISOR and MENTOR.
- Do NOT edit or rewrite the document directly.
- Answer the candidate's questions, critique their draft, evaluate recruiter impressions, or suggest phrasing improvements.
- Keep your answer clear, encouraging, structured, and insightful.

Candidate Question / Prompt: "${query}"
`;

    try {
      const res = await inlineEditCvLetter({
        selected_text: letter.slice(0, 300),
        action: "ask",
        instruction: contextInstruction,
        full_letter: letter,
        company_name: company,
        role_title: role,
      });

      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: res.result,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      toast.danger("Chat failed", errorMessage(err));
    } finally {
      setChatWorking(false);
    }
  };

  const { length, label: lenLabel, words } = useMemo(() => lengthFor(lengthPct), [lengthPct]);

  /* Research state */
  const [researchPhase, setResearchPhase] = useState<ResearchPhase>("idle");
  const [researchReport, setResearchReport] = useState<WireReport | null>(null);
  const [researchCachedAt, setResearchCachedAt] = useState<string | null>(null);
  const [researchAgents, setResearchAgents] = useState<AgentUi[]>([]);
  const [researchTotal, setResearchTotal] = useState(0);
  const [researchExpanded, setResearchExpanded] = useState(true);
  const [checkingCache, setCheckingCache] = useState(false);
  const [researchCacheHit, setResearchCacheHit] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Accumulated done data from agents — for live JSON in modal
  const [agentData, setAgentData] = useState<Record<string, unknown>>({});
  const [agentPartials, setAgentPartials] = useState<Record<string, string>>({});

  const researchAbortRef = useRef<AbortController | null>(null);
  const agentStartRef = useRef<Record<string, number>>({});

  /* Tailoring Questions state */
  const [tailoringModalOpen, setTailoringModalOpen] = useState(false);
  const [tailoringQuestions, setTailoringQuestions] = useState<TailoringQuestion[]>([]);
  const [tailoringAnswers, setTailoringAnswers] = useState<Record<string, string>>({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const handleOpenTailoringModal = () => {
    if (!company.trim()) {
      toast.warning("Enter a company first", "Type a company name so AI can generate targeted tailoring questions.");
      return;
    }
    setTailoringModalOpen(true);
  };

  // Reset research when company changes
  const setCompany = (v: string) => {
    setCompanyRaw(v);
    setTailoringQuestions([]);
    setTailoringAnswers({});
    if (researchPhase !== "idle") {
      researchAbortRef.current?.abort();
      setResearchPhase("idle");
      setResearchReport(null);
      setResearchCachedAt(null);
      setResearchAgents([]);
      setResearchTotal(0);
      setResearchCacheHit(null);
      setAgentData({});
      setAgentPartials({});
      setModalOpen(false);
    }
    setResearchCacheHit(null);
  };

  useEffect(() => () => researchAbortRef.current?.abort(), []);

  /* Boot from URL params */
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const jobId = searchParams.get("job");
    if (jobId) {
      getJob(Number(jobId))
        .then((job) => {
          setCompanyRaw(job.company || "");
          setRole(job.role || "");
          setJobPosting(job.job_description || "");
          const text = job.letter?.text ?? "";
          if (text) { setLetter(text); setDone(true); }
          jobIdRef.current = job.id ?? Number(jobId);
        })
        .catch(() => toast.danger("Couldn't open that letter"));
      return;
    }
    const c = searchParams.get("company");
    const r = searchParams.get("role");
    const jd = searchParams.get("jd");
    if (c) setCompanyRaw(c);
    if (r) setRole(r);
    if (jd) setJobPosting(jd);
  }, [searchParams]);

  /* Research event handler */
  const onResearchEvent = useCallback((event: ResearchEvent) => {
    switch (event.type) {
      case "phase": {
        if (event.phase === "gather") {
          setResearchTotal(event.total);
          setResearchAgents(event.agents.map((id): AgentUi => ({ id, label: agentLabel(id), status: "queued", sources: [] })));
        }
        break;
      }
      case "agent_started": {
        agentStartRef.current[event.agent] = performance.now();
        setResearchAgents((prev) =>
          prev.map((a) => a.id === event.agent ? { ...a, status: a.status === "error" ? "error" : "running", note: undefined } : a)
        );
        break;
      }
      case "source": {
        setResearchAgents((prev) =>
          prev.map((a) => a.id === event.agent && !a.sources.includes(event.source) ? { ...a, sources: [...a.sources, event.source] } : a)
        );
        break;
      }
      case "agent_progress": {
        setAgentPartials((prev) => ({ ...prev, [event.agent]: event.text }));
        setResearchAgents((prev) =>
          prev.map((a) => a.id === event.agent && a.status !== "done" && a.status !== "error" ? { ...a, status: "running" } : a)
        );
        break;
      }
      case "agent_done": {
        const labels = event.sources.map((s) => s.label ?? s.source ?? "source");
        setResearchAgents((prev) =>
          prev.map((a) => a.id === event.agent ? { ...a, status: "done", sources: labels.length ? labels : a.sources } : a)
        );
        setAgentPartials((prev) => {
          const next = { ...prev };
          delete next[event.agent];
          return next;
        });
        if (event.data != null) {
          setAgentData((prev) => ({ ...prev, [event.agent]: event.data }));
        }
        break;
      }
      case "agent_error": {
        setResearchAgents((prev) => prev.map((a) => a.id === event.agent ? { ...a, status: "error", note: event.error } : a));
        break;
      }
      case "cached": {
        setResearchCachedAt(event.cached_at);
        break;
      }
      case "done": {
        const r = event.report as unknown as WireReport;
        setResearchReport(r);
        // Set full report JSON for final modal view
        setAgentData(r as unknown as Record<string, unknown>);
        if (!r.meta.from_cache) setResearchCachedAt(null);
        setResearchPhase("done");
        setResearchExpanded(true);
        break;
      }
      case "fatal": {
        setResearchPhase("error");
        toast.danger("Research failed", event.error);
        break;
      }
    }
  }, []);

  function startResearch(refresh = false) {
    const c = company.trim();
    if (!c) return;
    researchAbortRef.current?.abort();
    const ctrl = new AbortController();
    researchAbortRef.current = ctrl;
    agentStartRef.current = {};

    setResearchReport(null);
    setResearchCachedAt(null);
    setResearchAgents([]);
    setResearchTotal(0);
    setResearchPhase("running");
    setResearchCacheHit(null);
    setAgentData({});
    setAgentPartials({});
    setModalOpen(true); // auto-open modal when research starts

    streamResearch(
      {
        company_name: c,
        role_title: role.trim() || null,
        job_description: jobPosting.trim() || null,
        job_url: jobUrl.trim() || null,
        refresh,
      },
      onResearchEvent,
      ctrl.signal,
    ).catch((err: unknown) => {
      if (ctrl.signal.aborted) return;
      setResearchPhase("error");
      toast.danger("Research failed", errorMessage(err));
    });
  }

  async function handleResearchRun() {
    const c = company.trim();
    if (!c) return;
    setCheckingCache(true);
    try {
      const hit = await getCachedReport(c, role.trim() || undefined);
      if (hit) { setResearchCacheHit(hit.cached_at); return; }
    } catch { /* no cache */ } finally { setCheckingCache(false); }
    startResearch(false);
  }

  function loadCachedResearch() {
    startResearch(false);
    setResearchCacheHit(null);
  }

  /* Letter actions */
  async function runReview(text: string) {
    if (!grounded || !text.trim()) { setClaims(null); return; }
    setReviewing(true);
    try { setClaims(await reviewCoverLetter(text)); } catch { setClaims(null); } finally { setReviewing(false); }
  }

  async function runPiiScan(text: string) {
    if (!text.trim()) { setPii([]); return; }
    try { setPii((await scanPii(text)).findings); } catch { setPii([]); }
  }

  async function generate() {
    if (!company.trim()) { toast.warning("Add a company first", "Tell me who you're applying to."); return; }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLetter(""); setClaims(null); setPii([]); setDone(false); setStreaming(true);
    setSelectedText(""); setSelectionRange(null);
    let acc = "";
    try {
      const validTailoringAnswers = Object.fromEntries(
        Object.entries(tailoringAnswers).filter(([, v]) => v.trim())
      );
      await streamCoverLetter(
        {
          company_name: company.trim(),
          role_title: role.trim() || null,
          job_description: jobPosting.trim() || null,
          tone,
          length,
          tailoring_answers: Object.keys(validTailoringAnswers).length > 0 ? validTailoringAnswers : undefined,
        },
        (ev) => { if (ev.type === "token") { acc += ev.text; setLetter(acc); } else if (ev.type === "fatal") toast.danger("Generation failed", ev.error); },
        ac.signal,
      );
      setStreaming(false);
      if (acc.trim()) { setDone(true); void runReview(acc); void runPiiScan(acc); }
    } catch (e) {
      setStreaming(false);
      if (!ac.signal.aborted) toast.danger("Generation failed", e instanceof Error ? e.message : String(e));
    }
  }

  function copyLetter() {
    navigator.clipboard?.writeText(letter).then(
      () => toast.success("Copied to clipboard"),
      () => toast.danger("Couldn't copy"),
    );
  }
  function downloadTxt() {
    const blob = new Blob([letter], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cover-letter-${(company || "draft").toLowerCase().replace(/\s+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded .txt");
  }
  async function download(format: ExportFormat) {
    if (!letter.trim() || exporting) return;
    setExporting(format);
    try {
      await exportLetter(format, { text: letter, company_name: company || null, role_title: role || null });
      toast.success(format === "pdf" ? "Exported PDF" : "Exported Word (.docx)");
    } catch (err) { toast.danger("Couldn't export", errorMessage(err)); }
    finally { setExporting(null); }
  }
  async function saveDraft() {
    if (!letter.trim()) { toast.warning("Nothing to save yet", "Generate a letter first."); return; }
    setSaving(true);
    try {
      const payload = { company: company.trim() || "Untitled", role: role.trim() || "", job_description: jobPosting.trim() || null, status: "draft" as const, letter: { text: letter, completed: false } };
      if (jobIdRef.current != null) { await updateJob(jobIdRef.current, { ...payload, id: jobIdRef.current }); }
      else { const created = await createJob(payload); jobIdRef.current = created.id ?? null; }
      toast.success("Draft saved", "Find it under Cover Letters.");
    } catch (e) { toast.danger("Couldn't save", e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  const [floatingPos, setFloatingPos] = useState<{ top: number; left: number } | null>(null);

  const handleTextareaSelect = (e?: React.SyntheticEvent<HTMLTextAreaElement>) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    if (start != null && end != null && end - start >= 3) {
      const sel = letter.substring(start, end);
      if (sel.trim().length >= 3) {
        setSelectedText(sel);
        setSelectionRange({ start, end });
        setAiMode("menu");
        setAiAnswer(null);

        if (e && "nativeEvent" in e && e.nativeEvent instanceof MouseEvent) {
          const mouseEvt = e.nativeEvent as MouseEvent;
          const rect = textareaRef.current.parentElement?.getBoundingClientRect();
          if (rect) {
            const relativeLeft = Math.min(
              rect.width - 340,
              Math.max(16, mouseEvt.clientX - rect.left - 160)
            );
            const relativeTop = Math.max(12, mouseEvt.clientY - rect.top - 64);
            setFloatingPos({ top: relativeTop, left: relativeLeft });
          }
        } else if (!floatingPos) {
          setFloatingPos({ top: 30, left: 40 });
        }
      }
    }
  };

  const handleInlineAction = async (action: "regenerate" | "custom" | "ask", customPrompt?: string) => {
    if (!selectedText || !selectionRange) return;
    setAiWorking(true); setAiAnswer(null);
    try {
      const res = await inlineEditCvLetter({ selected_text: selectedText, action, instruction: customPrompt || aiInput, full_letter: letter, company_name: company, role_title: role });
      if (action === "ask") { setAiAnswer(res.result); }
      else {
        const updated = letter.substring(0, selectionRange.start) + res.result + letter.substring(selectionRange.end);
        setLetter(updated);
        toast.success("Text updated by AI", "The selected snippet has been rewritten.");
        setSelectedText(""); setSelectionRange(null); setAiMode("menu"); setAiInput(""); setFloatingPos(null);
        if (grounded) void runReview(updated);
      }
    } catch (err) { toast.danger("AI action failed", errorMessage(err)); }
    finally { setAiWorking(false); }
  };

  /* Claim fix */
  const handleFixClaim = (claim: ReviewClaim, index: number) => {
    const replacement = claim.suggestion || claim.reason;
    if (!replacement || !letter.includes(claim.text)) { toast.warning("Could not auto-replace", "Edit the letter text directly."); return; }
    const updated = letter.replace(claim.text, replacement);
    setLetter(updated);
    setClaims((prev) => (prev ? prev.filter((_, i) => i !== index) : null));
    toast.success("Claim fixed", `Updated: "${claim.text.slice(0, 30)}..."`);
  };

  const handleFixAllClaims = () => {
    if (!claims || claims.length === 0) return;
    let updated = letter;
    let fixedCount = 0;
    claims.forEach((c) => {
      if (c.suggestion && updated.includes(c.text)) { updated = updated.replace(c.text, c.suggestion); fixedCount++; }
    });
    if (fixedCount > 0) { setLetter(updated); setClaims([]); toast.success("All claims fixed", `Rephrased ${fixedCount} claim${fixedCount === 1 ? "" : "s"}.`); }
    else toast.warning("Manual edit required", "Please edit the flagged lines directly.");
  };

  const hasLetter = letter.trim().length > 0;
  const researchDoneCount = researchAgents.filter((a) => a.status === "done").length;

  return (
    <Page
      eyebrow="Generate / Write Letter"
      title="Write letter"
      subtitle="A grounded first draft in your voice — written only from your real profile."
      actions={
        <>
          <Button variant="outline" size="md" onClick={saveDraft} loading={saving} disabled={!hasLetter}>
            <Save size={15} /> Save draft
          </Button>
          <Button variant="primary" size="md" onClick={generate} loading={streaming}>
            {done ? <RotateCw size={15} /> : <Sparkles size={15} />}
            {done ? "Regenerate" : "Generate"}
          </Button>
        </>
      }
      bodyClassName="px-7 py-5"
    >
      {/* Research modal (portal) */}
      {modalOpen && (researchPhase === "running" || researchPhase === "done" || researchPhase === "error") && (
        <ResearchModal
          phase={researchPhase}
          agents={researchAgents}
          agentData={agentData}
          agentPartials={agentPartials}
          report={researchReport}
          cachedAt={researchCachedAt}
          company={company}
          doneCount={researchDoneCount}
          total={researchTotal}
          onClose={() => setModalOpen(false)}
          onStop={() => {
            researchAbortRef.current?.abort();
            setResearchPhase("idle");
            setResearchReport(null);
            setResearchAgents([]);
            setModalOpen(false);
          }}
          onRerun={() => startResearch(true)}
        />
      )}

      {/* INITIAL STATE: Centered Form View (No Letter Generated Yet) */}
      {!hasLetter && !streaming ? (
        <div className="mx-auto max-w-[760px] space-y-6 cll-fade py-2">
          {/* Main Application Details Card */}
          <section className="rounded-[16px] border border-border bg-surface p-6 shadow-md space-y-5">
            <div className="flex items-center justify-between border-b border-border/70 pb-4">
              <div>
                <h2 className="text-[17px] font-bold text-fg">What role are you applying for?</h2>
                <p className="mt-1 text-[13px] text-fg-mid">
                  Provide company details to generate a grounded, personalized draft in your exact voice.
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-weak text-accent-text">
                <Sparkles size={20} />
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Company Name">
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Anthropic, Google, Stripe"
                  className="h-10 text-sm"
                />
              </Field>
              <Field label="Role Title">
                <Input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Senior Software Engineer"
                  className="h-10 text-sm"
                />
              </Field>
            </div>

            {/* Job Posting Link Import */}
            <div>
              <Field label={<>Job posting link <span className="text-fg-low">· optional auto-fill</span></>}>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={jobUrl}
                      onChange={(e) => setJobUrl(e.target.value)}
                      placeholder="Paste job posting URL (LinkedIn, Greenhouse, Lever…)"
                      className="pl-9 h-10 text-sm"
                    />
                    <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-low" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    loading={importingUrl}
                    disabled={!jobUrl.trim() || importingUrl}
                    onClick={handleJobUrlImport}
                    className="shrink-0 h-10 px-4 text-xs font-semibold"
                  >
                    <Download size={14} /> Import
                  </Button>
                </div>
              </Field>
            </div>

            <div>
              <Field label={<>Job Description <span className="text-fg-low">· optional</span></>}>
                <Textarea
                  value={jobPosting}
                  onChange={(e) => setJobPosting(e.target.value)}
                  placeholder="Paste full job description or key requirements to tailor experience match..."
                  className="min-h-[110px] text-xs"
                />
              </Field>
            </div>

            {/* Deep Research Section */}
            {researchPhase === "idle" ? (
              <ResearchPromptButton
                company={company} onRun={handleResearchRun} onReRun={() => startResearch(true)} checking={checkingCache}
                cachedAt={researchCacheHit} onViewCache={loadCachedResearch}
              />
            ) : researchPhase === "running" ? (
              <ResearchRunningInline
                agents={researchAgents} company={company} doneCount={researchDoneCount}
                total={researchTotal}
                onStop={() => {
                  researchAbortRef.current?.abort();
                  setResearchPhase("idle");
                  setResearchReport(null);
                  setResearchAgents([]);
                  setModalOpen(false);
                }}
                onOpenModal={() => setModalOpen(true)}
              />
            ) : researchPhase === "done" && researchReport ? (
              <CompactIntelCard
                report={researchReport} cachedAt={researchCachedAt}
                expanded={researchExpanded} onToggle={() => setResearchExpanded((v) => !v)}
                onRerun={() => startResearch(true)}
                onViewDetails={() => setModalOpen(true)}
              />
            ) : researchPhase === "error" ? (
              <div className="cll-fade mt-3 flex items-center gap-2.5 rounded-[10px] border border-danger/30 bg-danger-weak px-3 py-2.5">
                <AlertTriangle size={14} className="shrink-0 text-danger" />
                <span className="flex-1 text-[11.5px] text-fg-mid">Research failed</span>
                <Button type="button" variant="outline" size="sm" className="shrink-0 h-7 px-2.5 text-[11px]" onClick={() => startResearch(true)}>
                  <RotateCw size={10} /> Retry
                </Button>
              </div>
            ) : null}

            {/* Tailoring Questions Wizard Section */}
            <TailoringQuestionsButton
              company={company}
              answeredCount={Object.values(tailoringAnswers).filter((v) => v.trim()).length}
              onClick={handleOpenTailoringModal}
            />
          </section>

          {/* Tone & Length Preferences */}
          <section className="rounded-[16px] border border-border bg-surface p-6 shadow-md space-y-5">
            <Field
              label={
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold text-fg">Tone of Voice</span>
                  {toneAutoDetected && (
                    <span className="font-mono text-[10px] font-semibold text-accent-text flex items-center gap-1">
                      <Sparkles size={11} className="text-accent" /> Auto-detected from past letters
                    </span>
                  )}
                </div>
              }
            >
              <Segmented options={TONES} value={tone} onChange={(v) => { setTone(v); setToneAutoDetected(false); }} />
            </Field>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-fg">Target Length</Label>
                <span className="font-mono text-[11px] font-semibold text-accent-text">{lenLabel} · ~{words} words</span>
              </div>
              <Slider value={lengthPct} min={0} max={100} onChange={setLengthPct} aria-label="Letter length" />
              <div className="flex justify-between text-[11px] font-semibold text-fg-low">
                <span>Brief</span><span>Detailed</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface-2 p-4">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-fg">Groundedness Claim Verification</div>
                <p className="mt-0.5 text-[11.5px] text-fg-mid">Audit & flag any state statements not present in your profile.</p>
              </div>
              <Toggle checked={grounded} onChange={setGrounded} aria-label="Check claims before sending" />
            </div>
          </section>

          {/* Big Primary Generation CTA */}
          <div className="pt-2">
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={generate}
              loading={streaming}
              className="w-full py-4 text-[15px] font-bold shadow-xl shadow-accent/25 hover:shadow-accent/35 transition-all"
            >
              <Sparkles size={18} className="mr-2 animate-pulse" />
              Generate Cover Letter
            </Button>
          </div>
        </div>
      ) : (
        /* GENERATED STATE: 2-Column Editor + Rich Assistant & Control Sidebar */
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          {/* Main Left: Cover Letter Editor */}
          <div className="flex min-w-0 flex-col gap-4">
            <section className="cll-fade relative flex min-h-[540px] flex-1 flex-col overflow-hidden rounded-[16px] border border-border bg-reading shadow-lg">
              {/* Top Header Bar: Company Badge + Edit Info + Top-Right Export Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-surface-2/60 px-5 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-weak text-accent-text font-bold">
                    <Sparkles size={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-fg truncate max-w-[240px]">
                        {company || "Untitled Application"} {role ? `· ${role}` : ""}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setEditAppModalOpen(true)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-text hover:underline cursor-pointer bg-accent-weak/60 px-2 py-0.5 rounded-full border border-accent/20"
                        title="Edit company, role, or job posting description"
                      >
                        <Pencil size={11} /> Edit Info
                      </button>
                    </div>
                    <span className="text-[10.5px] font-mono text-fg-low">
                      {words} words · Grounded Draft
                    </span>
                  </div>
                </div>

                {/* Top-Right Exports & Actions Bar */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="outline" size="xs" onClick={saveDraft} loading={saving} className="text-xs">
                    <Save size={12} className="mr-1" /> Save
                  </Button>
                  <Button variant="ghost" size="xs" onClick={copyLetter} title="Copy text"><Copy size={13} /> Copy</Button>
                  <Button variant="ghost" size="xs" onClick={downloadTxt} title="Download TXT"><Download size={13} /> .txt</Button>
                  <Button variant="ghost" size="xs" onClick={() => download("pdf")} loading={exporting === "pdf"} disabled={exporting !== null} title="Export PDF"><FileDown size={13} /> PDF</Button>
                  <Button variant="ghost" size="xs" onClick={() => download("docx")} loading={exporting === "docx"} disabled={exporting !== null} title="Export Word"><FileText size={13} /> Word</Button>
                </div>
              </div>

              {/* Research grounding banner */}
              {researchPhase === "done" && researchReport && !streaming && (
                <div className="flex items-center gap-1.5 border-b border-border bg-accent-weak px-4 py-2 text-[10.5px] font-semibold text-accent-text">
                  <Sparkles size={11} />
                  Grounded in company intel · {researchReport.company_name}
                  <button type="button" onClick={() => setModalOpen(true)} className="ml-auto flex items-center gap-1 text-[10px] hover:underline">
                    <Search size={10} /> View report
                  </button>
                </div>
              )}

              {/* Editor Container with Relative Positioning for Floating Popover */}
              <div className="relative flex-1 flex flex-col">
                {/* FLOATING SELECTION AI TOOLBAR OVER SELECTED TEXT */}
                {selectedText && floatingPos && !streaming && (
                  <div
                    className="absolute z-40 flex flex-col rounded-xl border border-indigo-500/50 bg-surface/95 p-3 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 max-w-[420px]"
                    style={{ top: `${floatingPos.top}px`, left: `${floatingPos.left}px` }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-600 text-white shadow-sm">
                          <Sparkles size={11} />
                        </span>
                        <span className="font-mono text-[11px] text-indigo-400">Inline AI Helper:</span>
                        <span className="truncate max-w-[180px] text-fg-mid font-medium">"{selectedText}"</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSelectedText(""); setSelectionRange(null); setFloatingPos(null); }}
                        className="text-fg-low hover:text-fg rounded p-0.5"
                      >
                        <X size={13} />
                      </button>
                    </div>

                    {/* Actions */}
                    {aiMode === "menu" ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button variant="primary" size="xs" loading={aiWorking} onClick={() => handleInlineAction("regenerate")}>
                          <RotateCw size={11} /> Rephrase
                        </Button>

                        <Button
                          variant="outline"
                          size="xs"
                          loading={aiWorking}
                          onClick={() => handleInlineAction("custom", "Make this sound more professional, polished and compelling.")}
                        >
                          <Sparkles size={11} className="text-amber-400" /> Professional
                        </Button>

                        <Button
                          variant="outline"
                          size="xs"
                          loading={aiWorking}
                          onClick={() => handleInlineAction("custom", "Make this selection shorter and more concise.")}
                        >
                          Shorten
                        </Button>

                        <Button
                          variant="outline"
                          size="xs"
                          loading={aiWorking}
                          onClick={() => handleInlineAction("custom", "Expand on this point with more concrete impact.")}
                        >
                          Expand
                        </Button>

                        <Button variant="ghost" size="xs" onClick={() => setAiMode("custom")}>
                          <Wand2 size={11} /> Custom AI
                        </Button>
                      </div>
                    ) : aiMode === "custom" ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={aiInput}
                          onChange={(e) => setAiInput(e.target.value)}
                          placeholder="Custom AI instruction..."
                          className="h-8 text-[12px]"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") handleInlineAction("custom"); }}
                        />
                        <Button variant="primary" size="xs" loading={aiWorking} onClick={() => handleInlineAction("custom")}>
                          Apply
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => setAiMode("menu")}>
                          Back
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={aiInput}
                            onChange={(e) => setAiInput(e.target.value)}
                            placeholder="Ask AI about this text..."
                            className="h-8 text-[12px]"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") handleInlineAction("ask"); }}
                          />
                          <Button variant="primary" size="xs" loading={aiWorking} onClick={() => handleInlineAction("ask")}>
                            Ask
                          </Button>
                        </div>
                        {aiAnswer && (
                          <AiAnswerView
                            text={aiAnswer}
                            onApply={(replacement) => {
                              if (!selectionRange) return;
                              const updated = letter.substring(0, selectionRange.start) + replacement + letter.substring(selectionRange.end);
                              setLetter(updated);
                              toast.success("Text replaced");
                              setSelectedText(""); setSelectionRange(null); setFloatingPos(null);
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Textarea */}
                {streaming ? (
                  <div className="flex-1 overflow-auto p-7 sm:px-8">
                    <div className="max-w-[640px] whitespace-pre-wrap text-[15px] leading-[1.85] text-reading-ink">
                      {letter}<span className="cll-caret" aria-hidden />
                    </div>
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    value={letter}
                    onChange={(e) => setLetter(e.target.value)}
                    onSelect={handleTextareaSelect}
                    onMouseUp={handleTextareaSelect}
                    onKeyUp={handleTextareaSelect}
                    spellCheck
                    className="min-h-[440px] flex-1 resize-none border-0 bg-transparent p-7 text-[15px] leading-[1.85] text-reading-ink outline-none sm:px-8"
                    aria-label="Cover letter (editable)"
                  />
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border px-5 py-2.5 bg-surface-2/30 text-[11px] text-fg-low">
                <span className="flex items-center gap-1.5">
                  <Info size={12} strokeWidth={1.6} /> Select text to trigger Floating AI Toolbar
                </span>
                <span>Press Save or export anytime</span>
              </div>
            </section>
          </div>

          {/* Right Assistant & Control Sidebar */}
          <div className="flex flex-col gap-4">
            {/* Card 1: Ask AI Career Advisor Expandable Trigger */}
            <section className="rounded-[16px] border border-indigo-500/40 bg-gradient-to-b from-indigo-500/10 via-surface to-surface p-4 space-y-3 shadow-md relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30">
                    <Sparkles size={16} />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-fg">AI Career Advisor</h3>
                    <span className="text-[10px] text-indigo-400 font-medium">Strategic Counseling & Context</span>
                  </div>
                </div>
                {chatMessages.length > 0 && (
                  <span className="text-[10px] font-mono font-bold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/30">
                    {chatMessages.length} msgs
                  </span>
                )}
              </div>

              <p className="text-[11.5px] text-fg-mid leading-relaxed">
                Chat with an AI mentor equipped with your CV, company research intel, and cover letter draft.
              </p>

              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => setAiChatOpen(true)}
                className="w-full text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/25 gap-2"
              >
                <MessageSquare size={14} /> Open AI Advisor Chat <Maximize2 size={12} className="ml-auto opacity-70" />
              </Button>
            </section>

            {/* Card 2: Regenerate & Refine Options */}
            <section className="rounded-[16px] border border-border bg-surface p-4 space-y-3.5">
              <div className="flex items-center justify-between border-b border-border/70 pb-2">
                <h3 className="text-xs font-bold text-fg">Regenerate Options</h3>
                <span className="text-[10px] font-mono text-fg-low">Refine Controls</span>
              </div>

              <Field label="Tone">
                <Segmented options={TONES} value={tone} onChange={(v) => { setTone(v); setToneAutoDetected(false); }} />
              </Field>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-semibold text-fg">
                  <span>Target Length</span>
                  <span className="font-mono text-[10px] text-accent-text">{lenLabel}</span>
                </div>
                <Slider value={lengthPct} min={0} max={100} onChange={setLengthPct} aria-label="Letter length" />
              </div>

              <Field label={<>Custom AI Direction <span className="text-fg-low">· optional</span></>}>
                <Input
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  placeholder="e.g. Emphasize backend scaling experience..."
                  className="h-8 text-xs"
                />
              </Field>

              <div className="pt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={generate}
                  loading={streaming}
                  className="w-full text-xs font-bold shadow-md shadow-accent/20"
                >
                  <RotateCw size={14} className="mr-1.5" />
                  Regenerate Draft
                </Button>
              </div>
            </section>

            {/* Card 3: Company Intel & Search Influence */}
            <section className="rounded-[16px] border border-border bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <h4 className="text-xs font-bold text-fg flex items-center gap-1.5">
                  <Search size={13} className="text-accent" /> Company Intel
                </h4>
                {researchPhase === "done" && (
                  <span className="text-[9.5px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Active</span>
                )}
              </div>

              {researchPhase === "done" && researchReport ? (
                <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs space-y-2">
                  <div className="font-semibold text-accent-text flex items-center justify-between">
                    <span>{researchReport.company_name}</span>
                    <button type="button" onClick={() => setModalOpen(true)} className="text-[10px] text-fg-mid hover:text-fg hover:underline">
                      View details
                    </button>
                  </div>
                  <p className="text-[11px] text-fg-mid line-clamp-3">
                    {typeof researchReport.overview === "string"
                      ? researchReport.overview
                      : (researchReport.overview as { summary?: string })?.summary || researchReport.company_name}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={generate}
                    loading={streaming}
                    className="w-full mt-1 text-[11px]"
                  >
                    <Sparkles size={11} className="mr-1 text-accent" /> Influence & Regenerate with Intel
                  </Button>
                </div>
              ) : (
                <ResearchPromptButton
                  company={company} onRun={handleResearchRun} onReRun={() => startResearch(true)} checking={checkingCache}
                  cachedAt={researchCacheHit} onViewCache={loadCachedResearch}
                />
              )}
            </section>

            {/* Card 4: Claim Check & Groundedness Audit */}
            {grounded && done && (
              <section className="cll-fade rounded-[16px] border border-border bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-fg">
                    <ShieldCheck size={15} strokeWidth={1.6} className="text-emerald-400" /> Claim Check
                  </div>
                  {claims && claims.length > 0 && (
                    <Button variant="outline" size="xs" onClick={handleFixAllClaims} className="text-[10px] h-6 px-2">
                      <Wand2 size={10} className="mr-1" /> Fix all ({claims.length})
                    </Button>
                  )}
                </div>

                {reviewing ? (
                  <div className="py-3 flex items-center justify-center gap-2 text-[11px] text-fg-mid">
                    <Loader2 size={13} className="animate-spin text-accent" /> Checking claims against profile…
                  </div>
                ) : claims && claims.length > 0 ? (
                  <div className="space-y-2">
                    {claims.map((claim, idx) => (
                      <div key={idx} className="rounded-lg border border-warning/30 bg-warning-weak p-2.5 text-[11.5px] space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-fg font-mono leading-tight">"{claim.text}"</span>
                          <Button variant="outline" size="xs" onClick={() => handleFixClaim(claim, idx)} className="h-6 text-[10px] px-2 shrink-0">
                            Fix
                          </Button>
                        </div>
                        <p className="text-fg-mid text-[11px]">{claim.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11.5px] text-emerald-400 font-medium flex items-center gap-1.5 py-1">
                    <Check size={14} /> All claims verified against your profile!
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      {/* AI Career Advisor Full Chat Drawer Overlay */}
      {aiChatOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="flex w-full max-w-[540px] h-full flex-col border-l border-border bg-surface shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/80 bg-surface-2/70 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30">
                  <Sparkles size={18} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-fg flex items-center gap-2">
                    AI Career Advisor Chat
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Full Context</span>
                  </h3>
                  <p className="text-[11px] text-fg-mid">
                    {company || "General"} {role ? `· ${role}` : ""} ({words} word draft loaded)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {chatMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setChatMessages([])}
                    className="p-1.5 text-fg-low hover:text-fg rounded-lg transition"
                    title="Clear Chat History"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAiChatOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-low hover:bg-surface-2 hover:text-fg"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Chat Messages Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Bot size={24} />
                  </div>
                  <h4 className="text-sm font-bold text-fg">Ask me anything about your application!</h4>
                  <p className="text-xs text-fg-mid max-w-[360px] leading-relaxed">
                    I have full context of your cover letter draft, target role, company research, and profile data. Ask for critique, interview advice, or strategic ideas.
                  </p>

                  <div className="flex flex-col gap-2 w-full pt-2">
                    {[
                      "🎯 Critique this cover letter from a recruiter's perspective",
                      "🚀 How can I stand out more for this specific role?",
                      "❓ What interview questions might they ask based on this letter?",
                      "💡 Suggest 3 high-impact improvements for my intro",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => void handleSendChatMessage(preset)}
                        className="text-left text-xs text-fg hover:text-indigo-300 bg-surface-2/60 hover:bg-indigo-500/10 border border-border/80 hover:border-indigo-500/30 p-3 rounded-xl transition cursor-pointer font-medium"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                        msg.role === "user" ? "bg-accent text-white" : "bg-indigo-600 text-white"
                      }`}
                    >
                      {msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
                    </div>
                    <div
                      className={`flex flex-col max-w-[82%] space-y-1 ${
                        msg.role === "user" ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                          msg.role === "user"
                            ? "bg-accent text-white rounded-tr-xs"
                            : "bg-surface-2 border border-border text-fg rounded-tl-xs whitespace-pre-wrap"
                        }`}
                      >
                        {msg.content}
                      </div>
                      <span className="text-[10px] text-fg-low px-1 font-mono">{msg.timestamp}</span>
                    </div>
                  </div>
                ))
              )}

              {chatWorking && (
                <div className="flex items-start gap-3 animate-pulse">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs font-bold">
                    <Bot size={14} />
                  </div>
                  <div className="rounded-2xl rounded-tl-xs bg-surface-2 border border-border px-4 py-3 text-xs text-fg-mid flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-indigo-400" /> Analyzing application context & formulating advice…
                  </div>
                </div>
              )}
            </div>

            {/* Quick Chips Preset Input Footer */}
            <div className="border-t border-border bg-surface-2/60 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask AI Career Advisor anything..."
                  className="min-h-[44px] max-h-[120px] text-xs resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendChatMessage();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  loading={chatWorking}
                  disabled={!chatInput.trim() || chatWorking}
                  onClick={() => void handleSendChatMessage()}
                  className="h-11 px-4 bg-indigo-600 hover:bg-indigo-500 text-white shrink-0"
                >
                  <Send size={14} />
                </Button>
              </div>

              <div className="flex justify-between items-center text-[10px] text-fg-low font-mono">
                <span>Press Enter to send · Shift+Enter for newline</span>
                <span>Context-Driven Career Mentor</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Application Info Modal Dialog */}
      {editAppModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative flex w-full max-w-[540px] flex-col overflow-hidden rounded-[18px] border border-border bg-surface shadow-2xl space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-weak text-accent-text font-bold">
                  <Pencil size={16} />
                </span>
                <div>
                  <h3 className="text-[15px] font-bold text-fg">Edit Application Info</h3>
                  <p className="text-[11.5px] text-fg-mid">Update target company, role, or job description</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditAppModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-low hover:bg-surface-2 hover:text-fg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Company Name">
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Anthropic" />
                </Field>
                <Field label="Role Title">
                  <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. ML Engineer" />
                </Field>
              </div>

              <Field label={<>Job posting link <span className="text-fg-low">· auto-fill</span></>}>
                <div className="flex items-center gap-2">
                  <Input
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    placeholder="Paste URL (LinkedIn, Greenhouse…)"
                    className="text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={importingUrl}
                    disabled={!jobUrl.trim() || importingUrl}
                    onClick={handleJobUrlImport}
                    className="shrink-0 text-xs"
                  >
                    Import
                  </Button>
                </div>
              </Field>

              <Field label="Job Description">
                <Textarea
                  value={jobPosting}
                  onChange={(e) => setJobPosting(e.target.value)}
                  placeholder="Paste full job description text..."
                  className="min-h-[120px] text-xs"
                />
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/80">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditAppModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="solid"
                size="sm"
                onClick={() => {
                  setEditAppModalOpen(false);
                  toast.success("Application details updated", "Generate or regenerate draft to reflect new info.");
                }}
                className="bg-accent text-white"
              >
                <Check size={14} className="mr-1" /> Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {tailoringModalOpen && (
        <TailoringQuestionsModal
          company={company}
          questions={tailoringQuestions}
          answers={tailoringAnswers}
          loading={loadingQuestions}
          onGenerateQuestions={async (cnt, foc) => {
            setLoadingQuestions(true);
            try {
              const q = await fetchTailoringQuestions(company.trim(), role.trim() || null, jobPosting.trim() || null, cnt, foc);
              setTailoringQuestions(q);
            } catch (err) {
              toast.danger("Failed to generate questions", errorMessage(err));
            } finally {
              setLoadingQuestions(false);
            }
          }}
          onSave={(newAnswers) => setTailoringAnswers(newAnswers)}
          onClear={() => setTailoringAnswers({})}
          onClose={() => setTailoringModalOpen(false)}
        />
      )}
    </Page>
  );
}
