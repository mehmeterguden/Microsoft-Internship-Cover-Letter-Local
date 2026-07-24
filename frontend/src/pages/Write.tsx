import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
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
import { SourceChip } from "@/components/ui/data";
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
  getCachedReport,
  streamResearch,
  type ResearchEvent,
  type ResearchInput,
} from "@/api/research";
import { errorMessage } from "@/api/client";
import { createJob, getJob, updateJob } from "@/api/jobs";
import type { Tone } from "@/api/types";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";

/* ── Wire types (mirror of Research.tsx — local to Write scope) ──── */
interface WireFirmographics {
  industry?: string | null;
  size?: string | null;
  employees?: number | null;
  hq?: string | null;
  founded?: string | null;
  website?: string | null;
}
interface WireOverview {
  summary?: string | null;
  mission?: string | null;
}
interface WireValueSignal {
  name: string;
  weight: number;
}
interface WireCulture {
  ways_of_working: string[];
}
interface WireTechItem {
  name: string;
  you_know: boolean;
  worth_learning: boolean;
}
interface WireNewsSignal {
  headline: string;
  date?: string | null;
  url?: string | null;
}
interface WireFitDimension {
  name: string;
  you: number;
  role_need: number;
}
interface WireFit {
  score: number;
  verdict?: string | null;
  recommendation?: string | null;
  dimensions: WireFitDimension[];
  matched_skills: string[];
  gaps: string[];
  experience_fit_pct: number;
}
interface WireLetterHook {
  hook: string;
  use_in_letter?: string | null;
}
interface WireRoleAnalysis {
  title?: string | null;
  responsibilities: string[];
  must_haves: string[];
  nice_to_haves: string[];
  keywords: string[];
}
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

/* ── Research agent UI model ─────────────────────────────────────── */
type ResearchPhase = "idle" | "running" | "done" | "error";
type AgentStatus = "queued" | "running" | "done" | "error";
interface AgentUi {
  id: string;
  label: string;
  status: AgentStatus;
  note?: string;
  sources: string[];
}

const AGENT_LABELS: Record<string, string> = {
  firmographics: "Firmographics",
  overview: "Company overview",
  values: "Values & mission",
  culture: "Culture",
  tech_stack: "Tech stack",
  signals: "Recent signals",
  interview: "Interview prep",
  jd_analyst: "Role analysis",
  fit: "Fit analysis",
  ammo: "Letter hooks",
};

function agentLabel(id: string): string {
  return AGENT_LABELS[id] ?? id.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
}

/* ── Write page constants ────────────────────────────────────────── */
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
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

/* ── Mini research UI components ────────────────────────────────── */
function MiniAgentIcon({ status }: { status: AgentStatus }) {
  if (status === "done") return <Check size={11} strokeWidth={2.8} className="text-success" />;
  if (status === "running") return <Loader2 size={11} className="animate-spin text-accent" />;
  if (status === "error") return <AlertTriangle size={11} className="text-danger" />;
  return <span className="block h-1.5 w-1.5 rounded-full bg-fg-low" />;
}

function MiniAgentRow({ agent }: { agent: AgentUi }) {
  return (
    <div className="flex items-center gap-2 rounded-[7px] px-2 py-1.5">
      <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center">
        <MiniAgentIcon status={agent.status} />
      </span>
      <span
        className={cn(
          "flex-1 truncate text-[11.5px]",
          agent.status === "done" ? "text-fg" : agent.status === "error" ? "text-danger" : "text-fg-mid",
        )}
      >
        {agent.label}
      </span>
      {agent.sources.length > 0 && agent.status === "done" ? (
        <span className="font-mono text-[9px] text-fg-low">{agent.sources.length} src</span>
      ) : null}
    </div>
  );
}

/* ── Compact Intel Summary card (shown after research done) ─────── */
function fitTone(score: number): "success" | "warning" | "accent" {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "accent";
}

function CompactIntelCard({
  report,
  cachedAt,
  expanded,
  onToggle,
  onRerun,
}: {
  report: WireReport;
  cachedAt: string | null;
  expanded: boolean;
  onToggle: () => void;
  onRerun: () => void;
}) {
  const f = report.firmographics;
  const fit = report.fit;
  const tone = fitTone(fit.score);
  const fitColor =
    tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : "var(--accent)";

  const knowTech = report.tech_stack.filter((t) => t.you_know).slice(0, 4);
  const learnTech = report.tech_stack.filter((t) => !t.you_know && t.worth_learning).slice(0, 3);
  const hooks = report.ammo.slice(0, 3);
  const cultureLines = report.culture.ways_of_working.slice(0, 2);

  return (
    <div
      className="cll-fade mt-3 overflow-hidden rounded-[12px] border border-border bg-surface-2"
      style={{
        background:
          "radial-gradient(160% 100% at 50% -10%, var(--accent-weak), transparent 55%), var(--surface-2)",
      }}
    >
      {/* Header */}
      <div
        className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5 select-none"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onToggle();
        }}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-white"
          style={{ background: "var(--accent-grad)", boxShadow: "0 4px 12px -4px var(--accent-shadow)" }}
        >
          <Sparkles size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-fg">Company Intel</span>
            <Pill tone="success" mono className="py-0 px-1.5 text-[9px]">
              Ready
            </Pill>
            {report.meta.from_cache && cachedAt ? (
              <span className="font-mono text-[9px] text-fg-low">{formatWhen(cachedAt)}</span>
            ) : null}
          </div>
          <div className="truncate font-mono text-[10px] text-fg-mid">
            {report.meta.agents.length || "8"} agents · {Math.round(report.meta.completeness * 100)}% filled
            {fit.score > 0 ? ` · Fit: ${fit.score}/100` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRerun();
            }}
            className="flex items-center gap-1 rounded-[6px] border border-border bg-surface px-2 py-1 text-[10px] font-semibold text-fg-mid hover:text-fg transition-colors"
          >
            <RotateCw size={10} /> Re-run
          </button>
          {expanded ? (
            <ChevronUp size={14} className="text-fg-low" />
          ) : (
            <ChevronDown size={14} className="text-fg-low" />
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded ? (
        <div className="border-t border-border px-3.5 pb-3.5 pt-3 flex flex-col gap-3">
          {/* Firmographics row */}
          {(f.industry || f.size || f.hq) ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {f.industry ? (
                <span className="text-[11.5px] text-fg-mid">
                  <span className="font-semibold text-fg-low text-[10px] uppercase tracking-[0.04em] mr-1">Industry</span>
                  {f.industry}
                </span>
              ) : null}
              {(f.size || f.employees) ? (
                <span className="text-[11.5px] text-fg-mid">
                  <span className="font-semibold text-fg-low text-[10px] uppercase tracking-[0.04em] mr-1">Size</span>
                  {f.size ?? `${f.employees?.toLocaleString()} employees`}
                </span>
              ) : null}
              {f.hq ? (
                <span className="text-[11.5px] text-fg-mid">
                  <span className="font-semibold text-fg-low text-[10px] uppercase tracking-[0.04em] mr-1">HQ</span>
                  {f.hq}
                </span>
              ) : null}
              {f.website ? (
                <a
                  href={f.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11.5px] text-accent-text hover:underline"
                >
                  <ExternalLink size={10} />
                  {f.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                </a>
              ) : null}
            </div>
          ) : null}

          {/* Overview */}
          {report.overview.summary ? (
            <p className="text-[11.5px] leading-[1.65] text-fg-mid line-clamp-3">{report.overview.summary}</p>
          ) : null}

          {/* Fit score */}
          {fit.score > 0 ? (
            <div className="flex items-center gap-2.5 rounded-[9px] border border-border bg-surface px-3 py-2">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[14px] font-bold"
                style={{ background: `${fitColor}20`, color: fitColor }}
              >
                {fit.score}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] font-semibold text-fg">Fit score</span>
                  {fit.verdict ? (
                    <Pill tone={tone} mono className="py-0 px-1.5 text-[9px]">
                      {fit.verdict}
                    </Pill>
                  ) : null}
                </div>
                {fit.recommendation ? (
                  <p className="mt-0.5 text-[10.5px] leading-snug text-fg-mid line-clamp-2">{fit.recommendation}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Tech stack */}
          {(knowTech.length > 0 || learnTech.length > 0) ? (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">Tech stack</div>
              <div className="flex flex-wrap gap-1">
                {knowTech.map((t) => (
                  <span
                    key={t.name}
                    className="inline-flex items-center gap-1 rounded-[6px] bg-success-weak px-2 py-0.5 text-[11px] text-fg"
                  >
                    <span className="h-1 w-1 rounded-[2px] bg-success" />
                    {t.name}
                  </span>
                ))}
                {learnTech.map((t) => (
                  <span
                    key={t.name}
                    className="inline-flex items-center gap-1 rounded-[6px] bg-accent-weak px-2 py-0.5 text-[11px] text-accent-text"
                  >
                    <span className="h-1 w-1 rounded-[2px] bg-accent" />
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Culture */}
          {cultureLines.length > 0 ? (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">Culture</div>
              <div className="flex flex-col gap-1">
                {cultureLines.map((w) => (
                  <div key={w} className="flex gap-2 text-[11.5px] text-fg-mid">
                    <span className="text-accent shrink-0">—</span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Matched skills & gaps */}
          {(fit.matched_skills.length > 0 || fit.gaps.length > 0) ? (
            <div className="grid grid-cols-2 gap-3">
              {fit.matched_skills.length > 0 ? (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-success">
                    You have · {fit.matched_skills.length}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {fit.matched_skills.slice(0, 5).map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 rounded-[6px] bg-success-weak px-1.5 py-0.5 text-[10.5px] text-fg"
                      >
                        <Check size={9} strokeWidth={2.5} className="text-success" />
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {fit.gaps.length > 0 ? (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-warning">
                    Gaps · {fit.gaps.length}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {fit.gaps.slice(0, 4).map((s) => (
                      <span
                        key={s}
                        className="rounded-[6px] border border-dashed border-border-strong bg-input px-1.5 py-0.5 text-[10.5px] text-fg-mid"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Recent signals */}
          {report.signals.length > 0 ? (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">Recent signals</div>
              <div className="flex flex-col gap-1.5">
                {report.signals.slice(0, 2).map((s) => (
                  <div key={s.headline} className="flex items-start gap-2 border-l-2 border-border-strong pl-2.5">
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-[11px] text-fg-mid hover:text-fg transition-colors"
                      >
                        {s.headline}
                      </a>
                    ) : (
                      <span className="flex-1 text-[11px] text-fg-mid">{s.headline}</span>
                    )}
                    {s.date ? (
                      <span className="shrink-0 font-mono text-[9px] text-fg-low">{s.date}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Letter hooks */}
          {hooks.length > 0 ? (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-low">
                <Zap size={10} className="text-accent" /> Letter hooks
              </div>
              <div className="flex flex-col gap-1.5">
                {hooks.map((h, i) => (
                  <div key={h.hook} className="flex gap-2 text-[11.5px]">
                    <span className="font-mono text-[9.5px] text-accent shrink-0 mt-0.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-fg-mid">{h.hook}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Sources footer */}
          {report.meta.sources.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-0.5 border-t border-border">
              {report.meta.sources.slice(0, 5).map((s) => (
                <SourceChip key={s.label} label={s.label} href={s.url ?? undefined} />
              ))}
              {report.meta.sources.length > 5 ? (
                <span className="font-mono text-[9px] text-fg-low self-center">
                  +{report.meta.sources.length - 5} more
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Intel grounding note */}
          <p className="text-[10px] leading-snug text-fg-low">
            ✦ This intel is automatically used when generating your cover letter below.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ── Running research container ──────────────────────────────────── */
function ResearchRunningPanel({
  agents,
  company,
  doneCount,
  total,
  onStop,
}: {
  agents: AgentUi[];
  company: string;
  doneCount: number;
  total: number;
  onStop: () => void;
}) {
  const pct = total > 0 ? (doneCount / total) * 100 : 0;
  return (
    <div
      className="cll-fade mt-3 overflow-hidden rounded-[12px] border border-border bg-surface-2"
      style={{
        background:
          "radial-gradient(160% 100% at 50% -10%, var(--accent-weak), transparent 55%), var(--surface-2)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-white"
          style={{ background: "var(--accent-grad)", boxShadow: "0 4px 12px -4px var(--accent-shadow)" }}
        >
          <Search size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-fg truncate">
              Researching {company || "company"}…
            </span>
            <StatDot tone="accent" pulse glow size={6} />
          </div>
          <div className="font-mono text-[10px] text-fg-mid">
            {doneCount} / {total || agents.length} agents complete
          </div>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-1 rounded-[6px] border border-border bg-surface px-2 py-1 text-[10px] font-semibold text-fg-mid hover:text-fg transition-colors shrink-0"
        >
          <X size={10} /> Stop
        </button>
      </div>

      {/* Progress bar */}
      <div className="mx-3.5 mb-3 h-1 overflow-hidden rounded-full bg-input">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: "var(--accent-grad)" }}
        />
      </div>

      {/* Agent list */}
      <div className="px-2 pb-3 flex flex-col gap-0.5">
        {agents.map((a) => (
          <MiniAgentRow key={a.id} agent={a} />
        ))}
      </div>
    </div>
  );
}

/* ── Research trigger button ─────────────────────────────────────── */
function ResearchPromptButton({
  company,
  onRun,
  checking,
  cachedAt,
  onViewCache,
}: {
  company: string;
  onRun: () => void;
  checking: boolean;
  cachedAt: string | null;
  onViewCache: () => void;
}) {
  if (cachedAt) {
    return (
      <div className="cll-fade mt-3 flex items-center gap-2.5 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
        <StatDot tone="accent" size={6} />
        <div className="min-w-0 flex-1">
          <span className="text-[11.5px] font-semibold text-fg">Already researched</span>
          <span className="ml-2 font-mono text-[10px] text-fg-low">· cached {formatWhen(cachedAt)}</span>
        </div>
        <Button type="button" variant="solid" size="sm" className="shrink-0 h-7 px-2.5 text-[11px]" onClick={onViewCache}>
          View intel
        </Button>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 h-7 px-2.5 text-[11px]" onClick={onRun}>
          Re-run
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRun}
      disabled={!company.trim() || checking}
      className={cn(
        "cll-fade mt-3 group flex w-full items-center gap-2.5 rounded-[10px] border border-dashed border-border px-3 py-2.5 text-left transition-all",
        company.trim() && !checking
          ? "cursor-pointer hover:border-accent hover:bg-accent-weak"
          : "opacity-50 cursor-not-allowed",
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-border-strong bg-input text-accent-text group-hover:border-accent group-hover:bg-accent-weak transition-colors">
        {checking ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-semibold text-fg-mid group-hover:text-fg transition-colors">
          {checking ? "Checking cache…" : company.trim() ? `Analyze ${company} with AI agents` : "Enter a company name first"}
        </span>
        <span className="block font-mono text-[10px] text-fg-low">
          Culture · tech stack · fit score · letter hooks
        </span>
      </span>
      {company.trim() && !checking ? (
        <Sparkles size={13} className="shrink-0 text-fg-low group-hover:text-accent-text transition-colors" />
      ) : null}
    </button>
  );
}

/* ── Main Write component ────────────────────────────────────────── */
export function Write() {
  /* ── Letter inputs ─────────────────────────────────────────────── */
  const [company, setCompanyRaw] = useState("");
  const [role, setRole] = useState("");
  const [jobPosting, setJobPosting] = useState("");
  const [tone, setTone] = useState<Tone>("warm");
  const [lengthPct, setLengthPct] = useState(50);
  const [grounded, setGrounded] = useState(true);

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

  // Selection AI Toolbar state
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [aiMode, setAiMode] = useState<"menu" | "custom" | "ask">("menu");
  const [aiInput, setAiInput] = useState("");
  const [aiWorking, setAiWorking] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);

  const { length, label: lenLabel, words } = useMemo(() => lengthFor(lengthPct), [lengthPct]);

  /* ── Research state ─────────────────────────────────────────────── */
  const [researchPhase, setResearchPhase] = useState<ResearchPhase>("idle");
  const [researchReport, setResearchReport] = useState<WireReport | null>(null);
  const [researchCachedAt, setResearchCachedAt] = useState<string | null>(null);
  const [researchAgents, setResearchAgents] = useState<AgentUi[]>([]);
  const researchPartialsRef = useRef<Record<string, string>>({});
  const [researchTotal, setResearchTotal] = useState(0);
  const [researchExpanded, setResearchExpanded] = useState(true);
  const [checkingCache, setCheckingCache] = useState(false);
  const [researchCacheHit, setResearchCacheHit] = useState<string | null>(null);
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
      researchPartialsRef.current = {};
      setResearchTotal(0);
      setResearchCacheHit(null);
    }
    setResearchCacheHit(null);
  };

  // Abort research on unmount
  useEffect(() => () => researchAbortRef.current?.abort(), []);

  /* ── Draft / URL boot ────────────────────────────────────────────── */
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
          if (text) {
            setLetter(text);
            setDone(true);
          }
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

  /* ── Research event handler ──────────────────────────────────────── */
  const onResearchEvent = useCallback((event: ResearchEvent) => {
    switch (event.type) {
      case "phase": {
        if (event.phase === "gather") {
          setResearchTotal(event.total);
          setResearchAgents(
            event.agents.map(
              (id): AgentUi => ({ id, label: agentLabel(id), status: "queued", sources: [] }),
            ),
          );
        }
        break;
      }
      case "agent_started": {
        agentStartRef.current[event.agent] = performance.now();
        setResearchAgents((prev) =>
          prev.map((a) =>
            a.id === event.agent
              ? { ...a, status: a.status === "error" ? "error" : "running", note: undefined }
              : a,
          ),
        );
        break;
      }
      case "source": {
        setResearchAgents((prev) =>
          prev.map((a) =>
            a.id === event.agent && !a.sources.includes(event.source)
              ? { ...a, sources: [...a.sources, event.source] }
              : a,
          ),
        );
        break;
      }
      case "agent_progress": {
        researchPartialsRef.current = { ...researchPartialsRef.current, [event.agent]: event.text };
        setResearchAgents((prev) =>
          prev.map((a) =>
            a.id === event.agent && a.status !== "done" && a.status !== "error"
              ? { ...a, status: "running" }
              : a,
          ),
        );
        break;
      }
      case "agent_done": {
        const labels = event.sources.map((s) => s.label ?? s.source ?? "source");
        const _p = { ...researchPartialsRef.current };
        delete _p[event.agent];
        researchPartialsRef.current = _p;
        setResearchAgents((prev) =>
          prev.map((a) =>
            a.id === event.agent
              ? { ...a, status: "done", sources: labels.length ? labels : a.sources }
              : a,
          ),
        );
        break;
      }
      case "agent_error": {
        setResearchAgents((prev) =>
          prev.map((a) => (a.id === event.agent ? { ...a, status: "error", note: event.error } : a)),
        );
        break;
      }
      case "cached": {
        setResearchCachedAt(event.cached_at);
        break;
      }
      case "done": {
        const r = event.report as unknown as WireReport;
        setResearchReport(r);
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
    researchPartialsRef.current = {};
    setResearchTotal(0);
    setResearchPhase("running");
    setResearchCacheHit(null);

    const input: ResearchInput = {
      company_name: c,
      role_title: role.trim() || null,
      job_description: jobPosting.trim() || null,
      refresh,
    };
    streamResearch(input, onResearchEvent, ctrl.signal).catch((err: unknown) => {
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
      if (hit) {
        setResearchCacheHit(hit.cached_at);
        return;
      }
    } catch {
      // no cache — proceed
    } finally {
      setCheckingCache(false);
    }
    startResearch(false);
  }

  function loadCachedResearch() {
    // Show existing cached report by running with refresh=false which
    // immediately returns the cached event via SSE
    startResearch(false);
    setResearchCacheHit(null);
  }

  /* ── Letter actions ────────────────────────────────────────────── */
  async function runReview(text: string) {
    if (!grounded || !text.trim()) {
      setClaims(null);
      return;
    }
    setReviewing(true);
    try {
      setClaims(await reviewCoverLetter(text));
    } catch {
      setClaims(null);
    } finally {
      setReviewing(false);
    }
  }

  async function runPiiScan(text: string) {
    if (!text.trim()) {
      setPii([]);
      return;
    }
    try {
      setPii((await scanPii(text)).findings);
    } catch {
      setPii([]);
    }
  }

  async function generate() {
    if (!company.trim()) {
      toast.warning("Add a company first", "Tell me who you're applying to.");
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLetter("");
    setClaims(null);
    setPii([]);
    setDone(false);
    setStreaming(true);
    setSelectedText("");
    setSelectionRange(null);
    let acc = "";
    try {
      await streamCoverLetter(
        {
          company_name: company.trim(),
          role_title: role.trim() || null,
          job_description: jobPosting.trim() || null,
          tone,
          length,
        },
        (ev) => {
          if (ev.type === "token") {
            acc += ev.text;
            setLetter(acc);
          } else if (ev.type === "fatal") {
            toast.danger("Generation failed", ev.error);
          }
        },
        ac.signal,
      );
      setStreaming(false);
      if (acc.trim()) {
        setDone(true);
        void runReview(acc);
        void runPiiScan(acc);
      }
    } catch (e) {
      setStreaming(false);
      if (!ac.signal.aborted)
        toast.danger("Generation failed", e instanceof Error ? e.message : String(e));
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
    } catch (err) {
      toast.danger("Couldn't export", errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  async function saveDraft() {
    if (!letter.trim()) {
      toast.warning("Nothing to save yet", "Generate a letter first.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        company: company.trim() || "Untitled",
        role: role.trim() || "",
        job_description: jobPosting.trim() || null,
        status: "draft" as const,
        letter: { text: letter, completed: false },
      };
      if (jobIdRef.current != null) {
        await updateJob(jobIdRef.current, { ...payload, id: jobIdRef.current });
      } else {
        const created = await createJob(payload);
        jobIdRef.current = created.id ?? null;
      }
      toast.success("Draft saved", "Find it under Cover Letters.");
    } catch (e) {
      toast.danger("Couldn't save", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  /* ── Selection Listener for Inline AI Box ────────────────────── */
  const handleTextareaSelect = () => {
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
      }
    }
  };

  const handleInlineAction = async (action: "regenerate" | "custom" | "ask", customPrompt?: string) => {
    if (!selectedText || !selectionRange) return;
    setAiWorking(true);
    setAiAnswer(null);
    try {
      const res = await inlineEditCvLetter({
        selected_text: selectedText,
        action,
        instruction: customPrompt || aiInput,
        full_letter: letter,
        company_name: company,
        role_title: role,
      });

      if (action === "ask") {
        setAiAnswer(res.result);
      } else {
        const updated =
          letter.substring(0, selectionRange.start) + res.result + letter.substring(selectionRange.end);
        setLetter(updated);
        toast.success("Text updated by AI", "The selected snippet has been rewritten.");
        setSelectedText("");
        setSelectionRange(null);
        setAiMode("menu");
        setAiInput("");
        if (grounded) void runReview(updated);
      }
    } catch (err) {
      toast.danger("AI action failed", errorMessage(err));
    } finally {
      setAiWorking(false);
    }
  };

  /* ── Claim Fix Handlers ─────────────────────────────────────── */
  const handleFixClaim = (claim: ReviewClaim, index: number) => {
    const replacement = claim.suggestion || claim.reason;
    if (!replacement || !letter.includes(claim.text)) {
      toast.warning("Could not auto-replace", "Edit the letter text directly to adjust this claim.");
      return;
    }
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
      const replacement = c.suggestion;
      if (replacement && updated.includes(c.text)) {
        updated = updated.replace(c.text, replacement);
        fixedCount++;
      }
    });

    if (fixedCount > 0) {
      setLetter(updated);
      setClaims([]);
      toast.success(
        "All claims fixed",
        `Rephrased ${fixedCount} claim${fixedCount === 1 ? "" : "s"} to match your profile.`,
      );
    } else {
      toast.warning("Manual edit required", "Please edit the flagged lines directly in the editor.");
    }
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
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ── Left: inputs ─────────────────────────────── */}
        <div className="cll-fade flex min-w-0 flex-col gap-4">
          <section className="rounded-[14px] border border-border bg-surface p-5">
            <div className="text-[15px] font-semibold text-fg">What are you applying to?</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-mid">
              Fill in the details and I&apos;ll ground the draft in your profile.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Company">
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Anthropic"
                />
              </Field>
              <Field label="Role">
                <Input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. ML Engineer"
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label={<>Job posting <span className="text-fg-low">· optional</span></>}>
                <Textarea
                  value={jobPosting}
                  onChange={(e) => setJobPosting(e.target.value)}
                  placeholder="Paste the full description for a sharper draft…"
                />
              </Field>
            </div>

            {/* ── Research section ─────────────────────── */}
            {researchPhase === "idle" ? (
              <ResearchPromptButton
                company={company}
                onRun={handleResearchRun}
                checking={checkingCache}
                cachedAt={researchCacheHit}
                onViewCache={loadCachedResearch}
              />
            ) : researchPhase === "running" ? (
              <ResearchRunningPanel
                agents={researchAgents}
                company={company}
                doneCount={researchDoneCount}
                total={researchTotal}
                onStop={() => {
                  researchAbortRef.current?.abort();
                  setResearchPhase("idle");
                  setResearchReport(null);
                  setResearchAgents([]);
                }}
              />
            ) : researchPhase === "done" && researchReport ? (
              <CompactIntelCard
                report={researchReport}
                cachedAt={researchCachedAt}
                expanded={researchExpanded}
                onToggle={() => setResearchExpanded((v) => !v)}
                onRerun={() => startResearch(true)}
              />
            ) : researchPhase === "error" ? (
              <div className="cll-fade mt-3 flex items-center gap-2.5 rounded-[10px] border border-danger/30 bg-danger-weak px-3 py-2.5">
                <AlertTriangle size={14} className="shrink-0 text-danger" />
                <span className="flex-1 text-[11.5px] text-fg-mid">Research failed</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-7 px-2.5 text-[11px]"
                  onClick={() => startResearch(true)}
                >
                  <RotateCw size={10} /> Retry
                </Button>
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5">
            <Field label="Tone">
              <Segmented options={TONES} value={tone} onChange={setTone} />
            </Field>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Length</Label>
                <span className="font-mono text-[10px] tracking-[0.02em] text-accent-text">
                  {lenLabel} · ~{words} words
                </span>
              </div>
              <Slider value={lengthPct} min={0} max={100} onChange={setLengthPct} aria-label="Letter length" />
              <div className="flex justify-between text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">
                <span>Brief</span>
                <span>Detailed</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[11px] border border-border bg-surface-2 px-3.5 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-fg">Check claims before sending</div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-fg-mid">
                  Flag anything the draft states that your profile doesn&apos;t back up.
                </p>
              </div>
              <Toggle checked={grounded} onChange={setGrounded} aria-label="Check claims before sending" />
            </div>
          </section>
        </div>

        {/* ── Right: letter (top) + review (below) ─────── */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Letter pane */}
          <section className="cll-fade relative flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-reading">
            {streaming ? (
              <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-border bg-input px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.01em] text-accent-text">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                  style={{ animation: "cll-pulse 1.3s ease-in-out infinite" }}
                />
                Streaming
              </div>
            ) : null}

            {/* Research grounding badge */}
            {researchPhase === "done" && researchReport && !streaming ? (
              <div className="flex items-center gap-1.5 border-b border-border bg-accent-weak px-4 py-2 text-[10.5px] font-semibold text-accent-text">
                <Sparkles size={11} />
                Grounded in company intel · {researchReport.company_name}
                {researchReport.meta.from_cache ? (
                  <span className="ml-1 font-normal text-fg-low">· from cache</span>
                ) : null}
              </div>
            ) : null}

            {/* Selection AI Floating Box */}
            {selectedText && !streaming ? (
              <div
                className="cll-fade border-b border-border bg-surface-2 p-3.5 shadow-elevated"
                style={{
                  background:
                    "radial-gradient(130% 120% at 50% -10%, var(--accent-weak), transparent 60%), var(--surface-2)",
                }}
              >
                <div className="flex items-center justify-between gap-2 pb-2">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-fg">
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-[6px] text-white"
                      style={{ background: "var(--accent-grad)" }}
                    >
                      <Sparkles size={11} />
                    </span>
                    <span className="text-accent-text font-mono text-[11px]">AI Selection Helper:</span>
                    <span className="truncate text-fg-mid max-w-[280px]">"{selectedText}"</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedText("");
                      setSelectionRange(null);
                    }}
                    className="text-fg-mid hover:text-fg"
                  >
                    <X size={14} />
                  </button>
                </div>

                {aiMode === "menu" ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      variant="primary"
                      size="xs"
                      loading={aiWorking}
                      onClick={() => handleInlineAction("regenerate")}
                    >
                      <RotateCw size={12} /> Rephrase
                    </Button>
                    <Button variant="outline" size="xs" onClick={() => setAiMode("custom")}>
                      <Wand2 size={12} /> Edit with AI
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setAiMode("ask")}>
                      <HelpCircle size={12} /> Ask AI
                    </Button>
                  </div>
                ) : aiMode === "custom" ? (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <Input
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        placeholder="e.g. Make this sound more confident or concise..."
                        className="h-8 text-[12px]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleInlineAction("custom");
                        }}
                      />
                      <Button
                        variant="primary"
                        size="xs"
                        loading={aiWorking}
                        onClick={() => handleInlineAction("custom")}
                      >
                        Apply
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setAiMode("menu")}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <Input
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        placeholder="Ask a question about this selected text..."
                        className="h-8 text-[12px]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleInlineAction("ask");
                        }}
                      />
                      <Button
                        variant="primary"
                        size="xs"
                        loading={aiWorking}
                        onClick={() => handleInlineAction("ask")}
                      >
                        Ask
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setAiMode("menu")}>
                        Cancel
                      </Button>
                    </div>
                    {aiAnswer ? (
                      <div className="mt-2 rounded-[8px] border border-border bg-surface p-2.5 text-[12px] leading-relaxed text-fg">
                        <div className="font-semibold text-accent-text mb-1">AI Answer:</div>
                        {aiAnswer}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {!hasLetter && !streaming ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-[14px] border border-border-strong bg-surface-2 text-accent-text">
                  <Sparkles size={22} />
                </div>
                <div className="text-[15px] font-semibold text-fg">Your letter appears here</div>
                <p className="mt-1 max-w-xs text-[13px] text-fg-mid">
                  Fill in the company and hit <b className="text-fg">Generate</b> — it streams in, grounded in your profile.
                </p>
                {researchPhase === "done" ? (
                  <div className="mt-3 flex items-center gap-1.5 rounded-[8px] border border-border bg-surface-2 px-3 py-1.5 text-[11px] text-accent-text">
                    <Sparkles size={11} />
                    Company intel ready — will be used in generation
                  </div>
                ) : null}
              </div>
            ) : streaming ? (
              <div className="flex-1 overflow-auto p-7 sm:px-8">
                <div className="max-w-[600px] whitespace-pre-wrap text-[15px] leading-[1.85] text-reading-ink">
                  {letter}
                  <span className="cll-caret" aria-hidden />
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
                    <Button variant="ghost" size="xs" onClick={copyLetter}>
                      <Copy size={13} /> Copy
                    </Button>
                    <Button variant="ghost" size="xs" onClick={downloadTxt}>
                      <Download size={13} /> .txt
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => download("pdf")}
                      loading={exporting === "pdf"}
                      disabled={exporting !== null}
                    >
                      <FileDown size={13} /> PDF
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => download("docx")}
                      loading={exporting === "docx"}
                      disabled={exporting !== null}
                    >
                      <FileText size={13} /> Word
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Review panel — with Suggestions & Fix buttons */}
          {grounded && done ? (
            <section className="cll-fade rounded-[14px] border border-border bg-surface p-[18px]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                  <ShieldCheck size={16} strokeWidth={1.6} className="text-success" /> Claim check
                </div>
                <div className="flex items-center gap-3">
                  {claims && claims.length > 0 ? (
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={handleFixAllClaims}
                      className="gap-1 rounded-[7px] text-[11px]"
                    >
                      <Wand2 size={11} /> Fix All Flagged ({claims.length})
                    </Button>
                  ) : null}
                  {reviewing ? (
                    <span className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.01em] text-fg-mid">
                      <Spinner size={12} /> checking…
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void runReview(letter);
                        void runPiiScan(letter);
                      }}
                      className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.01em] text-accent-text hover:brightness-110"
                    >
                      <RotateCw size={11} /> re-check
                    </button>
                  )}
                </div>
              </div>

              {reviewing ? (
                <p className="text-[12.5px] text-fg-mid">
                  Looking for anything your profile doesn&apos;t back up…
                </p>
              ) : claims && claims.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  <p className="text-[12px] text-fg-mid">
                    These claims need double-checking against your profile. Click{" "}
                    <b className="text-fg">Fix</b> to automatically rephrase them with backed facts:
                  </p>
                  {claims.map((c, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-2 rounded-[12px] border border-[color:var(--warning)]/30 bg-warning-weak p-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 text-[12.5px] text-fg">
                          <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" />
                          <span className="italic font-medium">"{c.text}"</span>
                        </div>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleFixClaim(c, i)}
                          className="shrink-0 gap-1.5 rounded-[8px] border-warning/40 bg-surface text-fg hover:border-warning hover:bg-warning-weak"
                        >
                          <Wand2 size={12} className="text-warning" /> Fix
                        </Button>
                      </div>

                      {c.reason ? (
                        <div className="pl-5.5 text-[11.5px] text-fg-mid">
                          <b className="text-fg-low">Note:</b> {c.reason}
                        </div>
                      ) : null}

                      {c.suggestion ? (
                        <div className="pl-5.5 text-[11.5px] text-accent-text">
                          <b className="font-semibold">Suggested fix:</b> "{c.suggestion}"
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : claims === null ? (
                <p className="text-[12.5px] text-fg-mid">
                  Not checked yet — hit <b className="text-fg">re-check</b> to scan this letter against your profile.
                </p>
              ) : (
                <div className="flex items-center gap-2.5 rounded-[10px] border border-[color:var(--success)]/25 bg-success-weak px-3 py-3 text-[13px] text-fg">
                  <Check size={16} strokeWidth={2.4} className="shrink-0 text-success" />
                  Every claim is backed by your profile. Nothing to double-check.
                </div>
              )}
            </section>
          ) : null}

          {/* PII shield */}
          {done && pii.length > 0 ? (
            <section className="cll-fade rounded-[14px] border border-[color:var(--warning)]/30 bg-warning-weak p-[18px]">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg">
                <ShieldAlert size={16} strokeWidth={1.7} className="text-warning" /> Personal data detected
              </div>
              <p className="mb-3 text-[12px] leading-relaxed text-fg-mid">
                This letter contains what looks like personal or sensitive information. Remove anything you
                didn&apos;t mean to send — detected locally, nothing left your device.
              </p>
              <div className="flex flex-col gap-2">
                {pii.map((f) => {
                  const dot =
                    f.severity === "high" ? "bg-danger" : f.severity === "medium" ? "bg-warning" : "bg-fg-low";
                  return (
                    <div
                      key={f.type}
                      className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface px-3 py-2.5"
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[12.5px] text-fg">
                          <span className="font-semibold">{f.label}</span>
                          {f.count > 1 ? (
                            <span className="font-mono text-[10px] text-fg-low">×{f.count}</span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {f.samples.map((s, i) => (
                            <span
                              key={i}
                              className="rounded-[6px] bg-input px-2 py-[2px] font-mono text-[10px] text-fg-mid"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
