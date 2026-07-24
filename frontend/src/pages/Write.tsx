import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  HelpCircle,
  Info,
  Link as LinkIcon,
  Loader2,
  RotateCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import { Segmented, Slider, Toggle } from "@/components/ui/controls";
import { Pill, Spinner, StatDot } from "@/components/ui/feedback";
import { ScoreRing, SourceChip } from "@/components/ui/data";
import {
  exportLetter,
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
import type { Tone } from "@/api/types";
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
      <div className="cll-fade mt-3.5 flex items-center gap-3 rounded-[12px] border border-accent/40 bg-surface-2 p-3.5 shadow-sm">
        <StatDot tone="accent" pulse size={7} />
        <div className="min-w-0 flex-1">
          <span className="text-[12px] font-semibold text-fg">Already researched & brainstormed</span>
          <span className="ml-2 font-mono text-[10px] text-fg-low">· cached {formatWhen(cachedAt)}</span>
        </div>
        <Button type="button" variant="solid" size="sm" className="shrink-0 h-7 px-3 text-[11px]" onClick={onViewCache}>View intel</Button>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 h-7 px-2.5 text-[11px]" onClick={onReRun}>Re-run</Button>
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
        "cll-fade mt-3.5 group relative flex w-full items-center gap-3 overflow-hidden rounded-[14px] border p-3.5 text-left transition-all duration-200",
        active
          ? "border-accent/40 bg-gradient-to-r from-accent-weak/40 via-surface to-surface hover:border-accent hover:shadow-[0_8px_24px_-8px_var(--accent-shadow)] cursor-pointer"
          : "border-border/60 bg-surface-2/60 opacity-60 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-all",
          active ? "bg-accent-grad text-white shadow-[0_4px_12px_-3px_var(--accent-shadow)] group-hover:scale-105" : "bg-input text-fg-low",
        )}
      >
        {checking ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="block text-[13px] font-bold text-fg group-hover:text-accent-text transition-colors">
            {checking ? "Checking cache…" : company.trim() ? `AI Brainstorm & Deep Research (${company})` : "AI Brainstorm & Deep Research"}
          </span>
          {active && (
            <Pill tone="accent" mono className="text-[8.5px] py-0 px-1.5 shrink-0">
              Brainstorming
            </Pill>
          )}
        </span>
        <span className="mt-0.5 block font-mono text-[10.5px] text-fg-mid truncate">
          {company.trim() ? "Research culture · tech stack · signals · fit score · hooks" : "Enter company name or import a job link to start"}
        </span>
      </span>
      {active && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-accent/30 bg-accent-weak text-accent-text group-hover:bg-accent group-hover:text-white transition-all">
          <ArrowRight size={13} />
        </span>
      )}
    </button>
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
  const [pii, setPii] = useState<PiiFinding[]>([]);

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

  // Reset research when company changes
  const setCompany = (v: string) => {
    setCompanyRaw(v);
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
      await streamCoverLetter(
        { company_name: company.trim(), role_title: role.trim() || null, job_description: jobPosting.trim() || null, tone, length },
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

  /* Selection AI */
  const handleTextareaSelect = () => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    if (start != null && end != null && end - start >= 3) {
      const sel = letter.substring(start, end);
      if (sel.trim().length >= 3) { setSelectedText(sel); setSelectionRange({ start, end }); setAiMode("menu"); setAiAnswer(null); }
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
        setSelectedText(""); setSelectionRange(null); setAiMode("menu"); setAiInput("");
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

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Left: inputs */}
        <div className="cll-fade flex min-w-0 flex-col gap-4">
          <section className="rounded-[14px] border border-border bg-surface p-5">
            <div className="text-[15px] font-semibold text-fg">What are you applying to?</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-mid">
              Fill in the details and I&apos;ll ground the draft in your profile.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Company">
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Anthropic" />
              </Field>
              <Field label="Role">
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. ML Engineer" />
              </Field>
            </div>

            {/* Job Posting Link Import */}
            <div className="mt-3">
              <Field label={<>Job posting link <span className="text-fg-low">· auto-fill</span></>}>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={jobUrl}
                      onChange={(e) => setJobUrl(e.target.value)}
                      placeholder="Paste job link (LinkedIn, Greenhouse, Lever…)"
                      className="pl-8 text-[12.5px]"
                    />
                    <LinkIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-low" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={importingUrl}
                    disabled={!jobUrl.trim() || importingUrl}
                    onClick={handleJobUrlImport}
                    className="shrink-0 h-9 px-3 text-[12px]"
                  >
                    <Download size={13} /> Import
                  </Button>
                </div>
              </Field>
            </div>

            <div className="mt-3">
              <Field label={<>Job posting <span className="text-fg-low">· optional</span></>}>
                <Textarea value={jobPosting} onChange={(e) => setJobPosting(e.target.value)} placeholder="Paste the full description for a sharper draft…" />
              </Field>
            </div>

            {/* Research section */}
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
          </section>

          <section className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5">
            <Field
              label={
                <div className="flex items-center justify-between w-full">
                  <span>Tone</span>
                  {toneAutoDetected && (
                    <span className="font-mono text-[9.5px] font-semibold text-accent-text flex items-center gap-1">
                      <Sparkles size={10} className="text-accent" /> Auto-set from past letters
                    </span>
                  )}
                </div>
              }
            >
              <Segmented options={TONES} value={tone} onChange={(v) => { setTone(v); setToneAutoDetected(false); }} />
            </Field>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Length</Label>
                <span className="font-mono text-[10px] tracking-[0.02em] text-accent-text">{lenLabel} · ~{words} words</span>
              </div>
              <Slider value={lengthPct} min={0} max={100} onChange={setLengthPct} aria-label="Letter length" />
              <div className="flex justify-between text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">
                <span>Brief</span><span>Detailed</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[11px] border border-border bg-surface-2 px-3.5 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-fg">Check claims before sending</div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-fg-mid">Flag anything the draft states that your profile doesn&apos;t back up.</p>
              </div>
              <Toggle checked={grounded} onChange={setGrounded} aria-label="Check claims before sending" />
            </div>
          </section>
        </div>

        {/* Right: letter + review */}
        <div className="flex min-w-0 flex-col gap-4">
          <section className="cll-fade relative flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-reading">
            {streaming && (
              <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-border bg-input px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.01em] text-accent-text">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" style={{ animation: "cll-pulse 1.3s ease-in-out infinite" }} />
                Streaming
              </div>
            )}

            {/* Research grounding badge */}
            {researchPhase === "done" && researchReport && !streaming && (
              <div className="flex items-center gap-1.5 border-b border-border bg-accent-weak px-4 py-2 text-[10.5px] font-semibold text-accent-text">
                <Sparkles size={11} />
                Grounded in company intel · {researchReport.company_name}
                <button type="button" onClick={() => setModalOpen(true)} className="ml-auto flex items-center gap-1 text-[10px] hover:underline">
                  <Search size={10} /> View report
                </button>
              </div>
            )}

            {/* Selection AI Floating Box */}
            {selectedText && !streaming && (
              <div
                className="cll-fade border-b border-border bg-surface-2 p-3.5 shadow-elevated"
                style={{ background: "radial-gradient(130% 120% at 50% -10%, var(--accent-weak), transparent 60%), var(--surface-2)" }}
              >
                <div className="flex items-center justify-between gap-2 pb-2">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-fg">
                    <span className="flex h-5 w-5 items-center justify-center rounded-[6px] text-white" style={{ background: "var(--accent-grad)" }}>
                      <Sparkles size={11} />
                    </span>
                    <span className="text-accent-text font-mono text-[11px]">AI Selection Helper:</span>
                    <span className="truncate text-fg-mid max-w-[280px]">"{selectedText}"</span>
                  </div>
                  <button type="button" onClick={() => { setSelectedText(""); setSelectionRange(null); }} className="text-fg-mid hover:text-fg">
                    <X size={14} />
                  </button>
                </div>
                {aiMode === "menu" ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button variant="primary" size="xs" loading={aiWorking} onClick={() => handleInlineAction("regenerate")}>
                      <RotateCw size={12} /> Rephrase
                    </Button>
                    <Button variant="outline" size="xs" onClick={() => setAiMode("custom")}><Wand2 size={12} /> Edit with AI</Button>
                    <Button variant="ghost" size="xs" onClick={() => setAiMode("ask")}><HelpCircle size={12} /> Ask AI</Button>
                  </div>
                ) : aiMode === "custom" ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="e.g. Make this sound more confident…" className="h-8 text-[12px]" onKeyDown={(e) => { if (e.key === "Enter") handleInlineAction("custom"); }} />
                    <Button variant="primary" size="xs" loading={aiWorking} onClick={() => handleInlineAction("custom")}>Apply</Button>
                    <Button variant="ghost" size="xs" onClick={() => setAiMode("menu")}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <Input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Ask a question about this selected text…" className="h-8 text-[12px]" onKeyDown={(e) => { if (e.key === "Enter") handleInlineAction("ask"); }} />
                      <Button variant="primary" size="xs" loading={aiWorking} onClick={() => handleInlineAction("ask")}>Ask</Button>
                      <Button variant="ghost" size="xs" onClick={() => setAiMode("menu")}>Cancel</Button>
                    </div>
                    {aiAnswer && (
                      <div className="rounded-[8px] border border-border bg-surface p-2.5 text-[12px] leading-relaxed text-fg">
                        <div className="mb-1 font-semibold text-accent-text">AI Answer:</div>{aiAnswer}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!hasLetter && !streaming ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-[14px] border border-border-strong bg-surface-2 text-accent-text">
                  <Sparkles size={22} />
                </div>
                <div className="text-[15px] font-semibold text-fg">Your letter appears here</div>
                <p className="mt-1 max-w-xs text-[13px] text-fg-mid">
                  Fill in the company and hit <b className="text-fg">Generate</b> — it streams in, grounded in your profile.
                </p>
                {researchPhase === "done" && (
                  <div className="mt-3 flex items-center gap-1.5 rounded-[8px] border border-border bg-surface-2 px-3 py-1.5 text-[11px] text-accent-text">
                    <Sparkles size={11} /> Company intel ready — will be used in generation
                  </div>
                )}
              </div>
            ) : streaming ? (
              <div className="flex-1 overflow-auto p-7 sm:px-8">
                <div className="max-w-[600px] whitespace-pre-wrap text-[15px] leading-[1.85] text-reading-ink">
                  {letter}<span className="cll-caret" aria-hidden />
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col">
                <textarea
                  ref={textareaRef}
                  value={letter}
                  onChange={(e) => setLetter(e.target.value)}
                  onSelect={handleTextareaSelect}
                  onMouseUp={handleTextareaSelect}
                  onKeyUp={handleTextareaSelect}
                  spellCheck
                  className="min-h-[360px] flex-1 resize-none border-0 bg-transparent p-7 text-[15px] leading-[1.85] text-reading-ink outline-none sm:px-8"
                  aria-label="Cover letter (editable)"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
                  <span className="flex items-center gap-1.5 text-[10.5px] text-fg-low">
                    <Info size={12} strokeWidth={1.6} /> Select text to edit or ask AI · edit freely
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="xs" onClick={copyLetter}><Copy size={13} /> Copy</Button>
                    <Button variant="ghost" size="xs" onClick={downloadTxt}><Download size={13} /> .txt</Button>
                    <Button variant="ghost" size="xs" onClick={() => download("pdf")} loading={exporting === "pdf"} disabled={exporting !== null}><FileDown size={13} /> PDF</Button>
                    <Button variant="ghost" size="xs" onClick={() => download("docx")} loading={exporting === "docx"} disabled={exporting !== null}><FileText size={13} /> Word</Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Claim check */}
          {grounded && done && (
            <section className="cll-fade rounded-[14px] border border-border bg-surface p-[18px]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                  <ShieldCheck size={16} strokeWidth={1.6} className="text-success" /> Claim check
                </div>
                <div className="flex items-center gap-3">
                  {claims && claims.length > 0 && (
                    <Button variant="primary" size="xs" onClick={handleFixAllClaims} className="gap-1 rounded-[7px] text-[11px]">
                      <Wand2 size={11} /> Fix All Flagged ({claims.length})
                    </Button>
                  )}
                  {reviewing ? (
                    <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-fg-mid"><Spinner size={12} /> checking…</span>
                  ) : (
                    <button type="button" onClick={() => { void runReview(letter); void runPiiScan(letter); }} className="flex items-center gap-1.5 text-[10.5px] font-semibold text-accent-text hover:brightness-110">
                      <RotateCw size={11} /> re-check
                    </button>
                  )}
                </div>
              </div>
              {reviewing ? (
                <p className="text-[12.5px] text-fg-mid">Looking for anything your profile doesn&apos;t back up…</p>
              ) : claims && claims.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  <p className="text-[12px] text-fg-mid">These claims need double-checking. Click <b className="text-fg">Fix</b> to rephrase:</p>
                  {claims.map((c, i) => (
                    <div key={i} className="flex flex-col gap-2 rounded-[12px] border border-[color:var(--warning)]/30 bg-warning-weak p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 text-[12.5px] text-fg">
                          <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" />
                          <span className="italic font-medium">"{c.text}"</span>
                        </div>
                        <Button variant="outline" size="xs" onClick={() => handleFixClaim(c, i)} className="shrink-0 gap-1.5 rounded-[8px] border-warning/40 bg-surface text-fg hover:border-warning hover:bg-warning-weak">
                          <Wand2 size={12} className="text-warning" /> Fix
                        </Button>
                      </div>
                      {c.reason && <div className="pl-5.5 text-[11.5px] text-fg-mid"><b className="text-fg-low">Note:</b> {c.reason}</div>}
                      {c.suggestion && <div className="pl-5.5 text-[11.5px] text-accent-text"><b className="font-semibold">Suggested fix:</b> "{c.suggestion}"</div>}
                    </div>
                  ))}
                </div>
              ) : claims === null ? (
                <p className="text-[12.5px] text-fg-mid">Not checked yet — hit <b className="text-fg">re-check</b> to scan.</p>
              ) : (
                <div className="flex items-center gap-2.5 rounded-[10px] border border-[color:var(--success)]/25 bg-success-weak px-3 py-3 text-[13px] text-fg">
                  <Check size={16} strokeWidth={2.4} className="shrink-0 text-success" />
                  Every claim is backed by your profile. Nothing to double-check.
                </div>
              )}
            </section>
          )}

          {/* PII shield */}
          {done && pii.length > 0 && (
            <section className="cll-fade rounded-[14px] border border-[color:var(--warning)]/30 bg-warning-weak p-[18px]">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg">
                <ShieldAlert size={16} strokeWidth={1.7} className="text-warning" /> Personal data detected
              </div>
              <p className="mb-3 text-[12px] leading-relaxed text-fg-mid">
                This letter contains what looks like personal or sensitive information. Detected locally, nothing left your device.
              </p>
              <div className="flex flex-col gap-2">
                {pii.map((f) => {
                  const dot = f.severity === "high" ? "bg-danger" : f.severity === "medium" ? "bg-warning" : "bg-fg-low";
                  return (
                    <div key={f.type} className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface px-3 py-2.5">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[12.5px] text-fg">
                          <span className="font-semibold">{f.label}</span>
                          {f.count > 1 && <span className="font-mono text-[10px] text-fg-low">×{f.count}</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {f.samples.map((s, i) => (
                            <span key={i} className="rounded-[6px] bg-input px-2 py-[2px] font-mono text-[10px] text-fg-mid">{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </Page>
  );
}
