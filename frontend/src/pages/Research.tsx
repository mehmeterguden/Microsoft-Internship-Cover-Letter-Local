import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Pill, Skeleton, StatDot } from "@/components/ui/feedback";
import { ScoreRing, SourceChip } from "@/components/ui/data";
import { cn } from "@/lib/utils";
import {
  autofillFromJobUrl,
  getCachedReport,
  streamResearch,
  type CachedReport,
  type ResearchEvent,
  type ResearchInput,
} from "@/api/research";
import { companyLogoUrl, suggestCompanies } from "@/api/companies";
import type { CompanySuggestion } from "@/api/types";
import { errorMessage } from "@/api/client";
import { toast } from "@/store/toast";

/* ── Wire types ──────────────────────────────────────────────────
   The `done`/cached payload matches the backend report schema
   (core/research/schema.py): field-based sections, not the stale
   sections[]/MatchBreakdown shape currently exported from api/types.ts.
   `api/` is off-limits for this task, so we mirror the real wire shape
   here and narrow the incoming report through `unknown` (no `any`). */
interface WireSource {
  label: string;
  url?: string | null;
}
interface WireEvidence {
  text: string;
  source: WireSource;
}
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
  division_context?: string | null;
}
interface WireValueSignal {
  name: string;
  weight: number;
  evidence: WireEvidence[];
}
interface WireCulture {
  ways_of_working: string[];
  notes: WireEvidence[];
}
interface WireTechItem {
  name: string;
  you_know: boolean;
  worth_learning: boolean;
  source?: WireSource | null;
}
interface WireNewsSignal {
  headline: string;
  date?: string | null;
  url?: string | null;
  why_it_matters?: string | null;
}
interface WireInterviewFocus {
  order: number;
  area: string;
  note?: string | null;
}
interface WireRoleAnalysis {
  title?: string | null;
  responsibilities: string[];
  must_haves: string[];
  nice_to_haves: string[];
  keywords: string[];
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
interface WireReportMeta {
  sources: WireSource[];
  section_sources: Record<string, WireSource[]>;
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
  interview: WireInterviewFocus[];
  role: WireRoleAnalysis;
  fit: WireFit;
  ammo: WireLetterHook[];
  meta: WireReportMeta;
}

/* ── Local UI model ──────────────────────────────────────────────── */
type RunPhase = "idle" | "running" | "done" | "error";
type AgentUiStatus = "queued" | "running" | "done" | "error";
interface AgentUi {
  id: string; // backend agent name
  label: string; // friendly console label
  status: AgentUiStatus;
  note?: string;
  durationLabel?: string;
  sources: string[];
}
interface UiSource {
  label: string;
  url?: string | null;
}

/* ── Section presence predicates ─────────────────────────────────── */
function firmoHasData(f: WireFirmographics): boolean {
  return Boolean(f.industry || f.size || f.employees || f.hq || f.founded || f.website);
}
function overviewHasData(o: WireOverview): boolean {
  return Boolean(o.summary || o.mission || o.division_context);
}
function roleHasData(r: WireRoleAnalysis): boolean {
  return Boolean(
    r.title || r.responsibilities.length || r.must_haves.length || r.nice_to_haves.length || r.keywords.length,
  );
}
function fitHasData(f: WireFit): boolean {
  return Boolean(
    f.score || f.verdict || f.recommendation || f.dimensions.length || f.matched_skills.length || f.gaps.length,
  );
}

/* ── Console agent catalogue (fleet order + local analysis steps) ── */
type ConsoleAgent = { id: string; section: string; label: string; has: (r: WireReport) => boolean };
const CONSOLE_AGENTS: ConsoleAgent[] = [
  { id: "firmographics", section: "firmographics", label: "Firmographics", has: (r) => firmoHasData(r.firmographics) },
  { id: "overview", section: "overview", label: "Company overview", has: (r) => overviewHasData(r.overview) },
  { id: "values", section: "values", label: "Values & mission", has: (r) => r.values.length > 0 },
  {
    id: "culture",
    section: "culture",
    label: "Culture",
    has: (r) => r.culture.ways_of_working.length > 0 || r.culture.notes.length > 0,
  },
  { id: "tech_stack", section: "tech_stack", label: "Tech stack", has: (r) => r.tech_stack.length > 0 },
  { id: "signals", section: "signals", label: "Recent signals", has: (r) => r.signals.length > 0 },
  { id: "interview", section: "interview", label: "Interview prep", has: (r) => r.interview.length > 0 },
  { id: "jd_analyst", section: "role", label: "Role analysis", has: (r) => roleHasData(r.role) },
  { id: "fit", section: "fit", label: "Fit analysis", has: (r) => fitHasData(r.fit) },
  { id: "ammo", section: "ammo", label: "Letter hooks", has: (r) => r.ammo.length > 0 },
];

const IDLE_AGENTS: AgentUi[] = CONSOLE_AGENTS.map((c) => ({ id: c.id, label: c.label, status: "queued", sources: [] }));

const SECTION_LABELS: Record<string, string> = {
  firmographics: "Firmographics",
  overview: "Company overview",
  values: "Values",
  culture: "Culture",
  tech_stack: "Tech stack",
  signals: "Recent signals",
  interview: "Interview prep",
  role: "Role analysis",
  fit: "Fit",
  ammo: "Letter hooks",
};

function agentLabel(id: string): string {
  const found = CONSOLE_AGENTS.find((c) => c.id === id);
  if (found) return found.label;
  return id.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
}
function prettySection(key: string): string {
  return SECTION_LABELS[key] ?? key.replace(/_/g, " ");
}

function synthAgents(r: WireReport): AgentUi[] {
  return CONSOLE_AGENTS.map((c) => {
    const has = c.has(r);
    return {
      id: c.id,
      label: c.label,
      status: has ? "done" : "error",
      sources: (r.meta.section_sources[c.section] ?? []).map((s) => s.label),
      note: has ? undefined : "No data returned for this section.",
    };
  });
}
function reconcileAgents(prev: AgentUi[], r: WireReport): AgentUi[] {
  if (prev.length === 0) return synthAgents(r);
  return prev.map((a) => {
    if (a.status === "error") return a;
    const cfg = CONSOLE_AGENTS.find((c) => c.id === a.id);
    const has = cfg ? cfg.has(r) : true;
    return { ...a, status: has ? "done" : "error", note: has ? a.note : (a.note ?? "No data for this section.") };
  });
}

/* ── Small helpers ───────────────────────────────────────────────── */
const clampPct = (n: number): number => Math.max(0, Math.min(100, n));
const uniq = (arr: string[]): string[] => Array.from(new Set(arr));
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
function truncate(s: string, n = 90): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
function fitTone(score: number): "success" | "warning" | "accent" {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "accent";
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
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}

/* ── Primitives ──────────────────────────────────────────────────── */
function Panel({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={cn("rounded-[12px] border border-border bg-surface", className)} style={style}>
      {children}
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Panel className="cll-fade p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[14px] font-semibold text-fg">{title}</div>
        {aside}
      </div>
      {children}
    </Panel>
  );
}

/* ── Left rail: agents console ───────────────────────────────────── */
function AgentIcon({ status }: { status: AgentUiStatus }) {
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
      {status === "done" ? <Check size={12} strokeWidth={2.6} className="text-success" /> : null}
      {status === "running" ? <Loader2 size={12} className="animate-spin text-accent" /> : null}
      {status === "error" ? <AlertTriangle size={12} className="text-danger" /> : null}
      {status === "queued" ? <StatDot tone="neutral" size={6} /> : null}
    </span>
  );
}

function AgentRow({ agent }: { agent: AgentUi }) {
  const noteColor = agent.status === "error" ? "text-danger" : "text-accent-text";
  return (
    <div className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-2 text-left">
      <AgentIcon status={agent.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-fg">{agent.label}</div>
        {agent.note ? <div className={cn("font-mono text-[10px]", noteColor)}>{truncate(agent.note)}</div> : null}
        {agent.sources.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {agent.sources.slice(0, 4).map((s) => (
              <SourceChip key={s} label={s} />
            ))}
          </div>
        ) : null}
      </div>
      {agent.durationLabel ? (
        <span className={cn("font-mono text-[9px]", agent.status === "error" ? "text-danger" : "text-fg-low")}>
          {agent.durationLabel}
        </span>
      ) : null}
      <ChevronRight size={12} className="shrink-0 text-fg-low" />
    </div>
  );
}

function AgentsPanel({ agents, count, pct }: { agents: AgentUi[]; count: string; pct: number }) {
  return (
    <Panel className="p-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-mid">Agents</span>
        <span className="font-mono text-[10px] text-accent-text">{count}</span>
      </div>
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-input">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent-grad)" }} />
      </div>
      <div className="flex flex-col gap-2">
        {agents.map((a) => (
          <AgentRow key={a.id} agent={a} />
        ))}
      </div>
    </Panel>
  );
}

function SourcesPanel({ sources }: { sources: UiSource[] }) {
  return (
    <Panel className="p-4">
      <div className="mb-3 text-[10.5px] font-semibold tracking-[0.01em] text-fg-mid">Sources</div>
      {sources.length ? (
        <div className="flex flex-col gap-2.5">
          {sources.map((s, i) => {
            const inner = (
              <>
                <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] bg-accent-weak font-mono text-[9px] text-accent-text">
                  {i + 1}
                </span>
                <span className="truncate">{s.label}</span>
                {s.url ? <ExternalLink size={11} className="ml-auto shrink-0 text-fg-low" /> : null}
              </>
            );
            const cls = "flex w-full items-center gap-2 text-left text-[11.5px] text-fg-mid transition-colors hover:text-fg";
            return s.url ? (
              <a key={`${s.label}-${i}`} href={s.url} target="_blank" rel="noopener noreferrer" className={cls}>
                {inner}
              </a>
            ) : (
              <div key={`${s.label}-${i}`} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11.5px] leading-relaxed text-fg-low">Sources appear here as agents cite them.</p>
      )}
    </Panel>
  );
}

/* ── Running-state section cards ─────────────────────────────────── */
function PendingSection({ name }: { name: string }) {
  return (
    <Panel className="cll-fade p-5">
      <div className="mb-3 flex items-center gap-2">
        <StatDot tone="neutral" size={6} />
        <span className="text-[13px] font-semibold text-fg-mid">{name}</span>
        <span className="ml-auto font-mono text-[9px] text-fg-low">queued</span>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[85%]" />
        <Skeleton className="h-3 w-[60%]" />
      </div>
    </Panel>
  );
}

function StreamingSectionCard({ label, text }: { label: string; text?: string }) {
  return (
    <Panel className="cll-fade relative p-5">
      <div className="absolute right-[18px] top-4 flex items-center gap-1.5 font-mono text-[9.5px] text-accent-text">
        <StatDot tone="accent" pulse size={6} /> Writing
      </div>
      <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-fg">
        <Loader2 size={13} className="animate-spin text-accent" /> {label}
      </div>
      {text ? (
        <pre className="max-h-[140px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-fg-low">
          {text}
          <span className="cll-caret" aria-hidden />
        </pre>
      ) : (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[85%]" />
          <Skeleton className="h-3 w-[60%]" />
        </div>
      )}
    </Panel>
  );
}

function ReadySectionCard({ label, sources }: { label: string; sources: string[] }) {
  return (
    <Panel className="cll-fade p-5">
      <div className="flex items-center gap-2">
        <Check size={13} strokeWidth={2.6} className="text-success" />
        <span className="text-[13px] font-semibold text-fg">{label}</span>
        <span className="ml-auto font-mono text-[9px] text-fg-low">gathered</span>
      </div>
      {sources.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {sources.slice(0, 5).map((s) => (
            <SourceChip key={s} label={s} />
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

/** A section whose agent failed — surfaced, not hidden (research resilience). */
function FailedSection({ label, note, onRetry }: { label: string; note?: string; onRetry: () => void }) {
  return (
    <Panel className="cll-fade p-5" style={{ borderColor: "rgba(251,113,133,0.35)" }}>
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-danger-weak text-danger">
          <AlertTriangle size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-fg">{label}</span>
            <Pill tone="danger" mono className="text-[9px]">
              Failed
            </Pill>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-mid">
            {note ?? "This agent could not complete. The rest of the report continues without it."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onRetry} title="Re-run the research">
          <RefreshCw size={13} /> Retry
        </Button>
      </div>
    </Panel>
  );
}

/* ── Report sections (done state) ────────────────────────────────── */
function ReportMetaBar({ report, cachedAt }: { report: WireReport; cachedAt: string | null }) {
  const m = report.meta;
  return (
    <div className="cll-fade flex flex-wrap items-center gap-2">
      <span className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Report</span>
      <Pill tone="success" mono className="text-[9px]">
        Complete
      </Pill>
      {m.completeness > 0 ? (
        <Pill tone="accent" mono className="text-[9px]">
          {Math.round(m.completeness * 100)}% Filled
        </Pill>
      ) : null}
      {m.from_cache ? (
        <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[9px] text-fg-low">
          From cache{cachedAt ? ` · ${formatWhen(cachedAt)}` : ""}
        </span>
      ) : null}
      {m.duration_s != null ? <span className="font-mono text-[9px] text-fg-low">· {m.duration_s}s</span> : null}
      {m.agents.length ? <span className="font-mono text-[9px] text-fg-low">· {m.agents.length} agents</span> : null}
    </div>
  );
}

function FitCard({ fit }: { fit: WireFit }) {
  const tone = fitTone(fit.score);
  const color = tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : "var(--accent)";
  return (
    <Panel className="cll-fade flex items-center gap-[18px] p-5">
      <ScoreRing
        value={fit.score}
        size={88}
        thickness={8}
        color={color}
        track="var(--border)"
        bg="var(--surface)"
        label="/ 100"
        className="shadow-[0_0_30px_-6px_var(--accent-shadow)]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[10.5px] font-semibold tracking-[0.01em] text-accent-text">Your fit to this posting</span>
          {fit.verdict ? (
            <Pill tone={tone} mono className="text-[9px]">
              {fit.verdict}
            </Pill>
          ) : null}
        </div>
        <p className="mt-2 text-[15px] leading-[1.55] text-fg">
          {fit.recommendation ??
            "Your profile was scored against this posting on-device — your CV never left the machine."}
        </p>
        <p className="mt-1.5 font-mono text-[9.5px] text-fg-low">
          Computed locally · lives in research, never printed on the cover letter itself.
        </p>
      </div>
    </Panel>
  );
}

function FitBreakdown({ dims }: { dims: WireFitDimension[] }) {
  return (
    <Section title="Fit breakdown" aside={<span className="font-mono text-[9px] text-fg-low">you vs role need</span>}>
      <div className="flex flex-col gap-3.5">
        {dims.map((b) => (
          <div key={b.name}>
            <div className="mb-1.5 flex justify-between text-[12px]">
              <span className="text-fg">{b.name}</span>
              <span className="font-mono text-accent-text">
                {b.you} / {b.role_need}
              </span>
            </div>
            <div className="relative h-1.5 rounded-full bg-input">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${clampPct(b.you)}%`, background: "var(--accent-grad)" }}
              />
              <div
                className="absolute -bottom-[3px] -top-[3px] w-0.5 rounded-full"
                style={{ left: `${clampPct(b.role_need)}%`, background: "var(--text-mid)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FirmographicsCard({ f }: { f: WireFirmographics }) {
  const items: { k: string; v: ReactNode }[] = [];
  if (f.industry) items.push({ k: "Industry", v: f.industry });
  const size = f.size ?? (f.employees ? `${f.employees.toLocaleString()} employees` : null);
  if (size) items.push({ k: "Size", v: size });
  if (f.hq) items.push({ k: "HQ", v: f.hq });
  if (f.founded) items.push({ k: "Founded", v: f.founded });
  if (f.website)
    items.push({
      k: "Website",
      v: (
        <a href={f.website} target="_blank" rel="noopener noreferrer" className="text-accent-text hover:underline">
          {domainOf(f.website)}
        </a>
      ),
    });
  return (
    <Panel className="cll-fade grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.k}>
          <div className="whitespace-nowrap text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">{it.k}</div>
          <div className="mt-1 text-[12.5px] font-semibold text-fg">{it.v}</div>
        </div>
      ))}
    </Panel>
  );
}

function OverviewCard({ o }: { o: WireOverview }) {
  return (
    <Section title="Company overview">
      <div className="flex flex-col gap-3 text-[13px] leading-[1.7] text-fg-mid">
        {o.summary ? <p>{o.summary}</p> : null}
        {o.mission ? (
          <div>
            <div className="mb-1 text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Mission</div>
            <p>{o.mission}</p>
          </div>
        ) : null}
        {o.division_context ? (
          <div>
            <div className="mb-1 text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Your team / division</div>
            <p>{o.division_context}</p>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function RoleCard({ r }: { r: WireRoleAnalysis }) {
  const cols: { label: string; list: string[] }[] = [
    { label: "Responsibilities", list: r.responsibilities },
    { label: "Must-haves", list: r.must_haves },
    { label: "Nice to have", list: r.nice_to_haves },
  ];
  return (
    <Section
      title="Role analysis"
      aside={r.title ? <span className="max-w-[45%] truncate font-mono text-[9px] text-fg-low">{r.title}</span> : undefined}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cols
          .filter((c) => c.list.length)
          .map((c) => (
            <div key={c.label}>
              <div className="mb-2 text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">{c.label}</div>
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
      {r.keywords.length ? (
        <div className="mt-4">
          <div className="mb-2 text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Keywords</div>
          <div className="flex flex-wrap gap-1.5">
            {r.keywords.map((k) => (
              <span key={k} className="rounded-[7px] bg-surface-2 px-2.5 py-1 text-[11.5px] text-fg-mid">
                {k}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Section>
  );
}

function ValuesCard({ values }: { values: WireValueSignal[] }) {
  return (
    <Section title="What they value">
      <div className="flex flex-col gap-3.5">
        {values.map((v) => {
          const srcs = uniq(v.evidence.map((e) => e.source.label));
          return (
            <div key={v.name}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-fg">{v.name}</span>
                {v.weight ? <span className="font-mono text-[9px] text-fg-low">{clampPct(v.weight)}</span> : null}
              </div>
              {v.weight ? (
                <div className="mt-1.5 h-1 rounded-full bg-input">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${clampPct(v.weight)}%`, background: "var(--accent-grad)" }}
                  />
                </div>
              ) : null}
              {srcs.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {srcs.slice(0, 4).map((s) => (
                    <SourceChip key={s} label={s} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function CultureCard({ c }: { c: WireCulture }) {
  return (
    <Section title="Culture">
      {c.ways_of_working.length ? (
        <div className="flex flex-col gap-2.5 text-[13px] leading-[1.6] text-fg-mid">
          {c.ways_of_working.map((w) => (
            <div key={w} className="flex gap-2.5">
              <span className="text-accent">—</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      ) : null}
      {c.notes.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {c.notes.map((n) => (
            <div key={n.text} className="rounded-[9px] bg-surface-2 p-2.5">
              <p className="text-[12px] leading-[1.6] text-fg-mid">{n.text}</p>
              {n.source?.label ? (
                <div className="mt-1.5">
                  <SourceChip label={n.source.label} href={n.source.url ?? undefined} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Section>
  );
}

function TechStackCard({ tech }: { tech: WireTechItem[] }) {
  return (
    <Section
      title="Tech stack"
      aside={
        <div className="flex gap-3 font-mono text-[9px] text-fg-mid">
          <span className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: "var(--success)" }} /> you know
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: "var(--accent)" }} /> worth learning
          </span>
        </div>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {tech.map((t) => (
          <span
            key={t.name}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11.5px]",
              t.you_know ? "bg-success-weak text-fg" : "bg-accent-weak text-accent-text",
            )}
          >
            <span
              className="h-1.5 w-1.5 rounded-[2px]"
              style={{ background: t.you_know ? "var(--success)" : "var(--accent)" }}
            />
            {t.name}
          </span>
        ))}
      </div>
    </Section>
  );
}

function SkillsCard({ matched, gaps }: { matched: string[]; gaps: string[] }) {
  return (
    <Section title="Your skills vs the role">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2.5 text-[10.5px] font-semibold tracking-[0.01em] text-success">Matched · {matched.length}</div>
          <div className="flex flex-wrap gap-1.5">
            {matched.length ? (
              matched.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 rounded-[7px] bg-success-weak px-2.5 py-1 text-[11.5px] text-fg"
                >
                  <Check size={11} strokeWidth={2.4} className="text-success" />
                  {s}
                </span>
              ))
            ) : (
              <span className="text-[12px] text-fg-low">None detected.</span>
            )}
          </div>
        </div>
        <div>
          <div className="mb-2.5 text-[10.5px] font-semibold tracking-[0.01em] text-warning">Gaps · {gaps.length}</div>
          <div className="flex flex-wrap gap-1.5">
            {gaps.length ? (
              gaps.map((s) => (
                <span
                  key={s}
                  className="rounded-[7px] border border-dashed border-border-strong bg-input px-2.5 py-1 text-[11.5px] text-fg-mid"
                >
                  {s}
                </span>
              ))
            ) : (
              <span className="text-[12px] text-fg-low">No major gaps.</span>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function SignalsCard({ signals }: { signals: WireNewsSignal[] }) {
  return (
    <Section title="Recent signals">
      <div className="flex flex-col gap-3">
        {signals.map((s) => (
          <div key={s.headline} className="border-l-2 border-border-strong pl-3">
            <div className="flex items-start justify-between gap-3">
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-medium text-fg transition-colors hover:text-accent-text"
                >
                  {s.headline}
                </a>
              ) : (
                <span className="text-[13px] font-medium text-fg">{s.headline}</span>
              )}
              {s.date ? <span className="shrink-0 font-mono text-[9px] text-fg-low">{s.date}</span> : null}
            </div>
            {s.why_it_matters ? <p className="mt-1 text-[12px] leading-[1.6] text-fg-mid">{s.why_it_matters}</p> : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

function InterviewCard({ items }: { items: WireInterviewFocus[] }) {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  return (
    <Section title="Interview prep">
      <div className="flex flex-col gap-2.5 text-[13px] leading-[1.6] text-fg-mid">
        {sorted.map((it) => (
          <div key={`${it.order}-${it.area}`} className="flex gap-2.5">
            <span className="font-mono text-accent">{String(it.order).padStart(2, "0")}</span>
            <span>
              <span className="text-fg">{it.area}</span>
              {it.note ? <span> — {it.note}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AmmoCard({ ammo }: { ammo: WireLetterHook[] }) {
  return (
    <Section title="Letter hooks · ammo">
      <div className="flex flex-col gap-2.5 text-[13px] leading-[1.6] text-fg-mid">
        {ammo.map((h, i) => (
          <div key={h.hook} className="flex gap-2.5">
            <span className="font-mono text-accent">{String(i + 1).padStart(2, "0")}</span>
            <span>
              <span className="text-fg">{h.hook}</span>
              {h.use_in_letter ? <span className="mt-0.5 block text-[12px] text-fg-low">{h.use_in_letter}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function WriteCta({ ready, company, role }: { ready: boolean; company?: string; role?: string }) {
  if (!ready) {
    return (
      <Button variant="primary" size="lg" className="mt-1 w-full rounded-[12px]" loading disabled>
        Assembling research…
      </Button>
    );
  }
  const params = new URLSearchParams();
  if (company) params.set("company", company);
  if (role) params.set("role", role);
  const href = params.toString() ? `/write?${params.toString()}` : "/write";
  return (
    <Button asChild variant="primary" size="lg" className="mt-1 w-full rounded-[12px]">
      <Link to={href}>
        Write cover letter with this research <ArrowRight size={16} />
      </Link>
    </Button>
  );
}

/* ── Bodies ──────────────────────────────────────────────────────── */
function DoneBody({ report, cachedAt }: { report: WireReport; cachedAt: string | null }) {
  const f = report.fit;
  return (
    <>
      <ReportMetaBar report={report} cachedAt={cachedAt} />
      {fitHasData(f) ? <FitCard fit={f} /> : null}
      {f.dimensions.length ? <FitBreakdown dims={f.dimensions} /> : null}
      {firmoHasData(report.firmographics) ? <FirmographicsCard f={report.firmographics} /> : null}
      {overviewHasData(report.overview) ? <OverviewCard o={report.overview} /> : null}
      {roleHasData(report.role) ? <RoleCard r={report.role} /> : null}
      {report.values.length ? <ValuesCard values={report.values} /> : null}
      {report.culture.ways_of_working.length || report.culture.notes.length ? <CultureCard c={report.culture} /> : null}
      {report.tech_stack.length ? <TechStackCard tech={report.tech_stack} /> : null}
      {f.matched_skills.length || f.gaps.length ? <SkillsCard matched={f.matched_skills} gaps={f.gaps} /> : null}
      {report.signals.length ? <SignalsCard signals={report.signals} /> : null}
      {report.interview.length ? <InterviewCard items={report.interview} /> : null}
      {report.ammo.length ? <AmmoCard ammo={report.ammo} /> : null}
      {report.meta.missing.length ? (
        <p className="px-1 text-[11px] leading-relaxed text-fg-low">
          Sections with no data: {report.meta.missing.map(prettySection).join(", ")}.
        </p>
      ) : null}
      <WriteCta ready company={report.company_name} role={report.role_title ?? undefined} />
    </>
  );
}

function RunningBody({
  agents,
  partials,
  company,
  doneCount,
  total,
  onRetry,
}: {
  agents: AgentUi[];
  partials: Record<string, string>;
  company: string;
  doneCount: number;
  total: number;
  onRetry: () => void;
}) {
  const fleet = agents.filter((a) => a.id !== "fit" && a.id !== "ammo");
  return (
    <>
      <Panel className="cll-fade flex items-center gap-3 p-4">
        <StatDot tone="accent" pulse glow size={8} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-fg">Researching {company || "company"}…</div>
          <div className="font-mono text-[10px] text-fg-mid">
            {doneCount} / {total || fleet.length + 2} agents complete · your CV never leaves the device
          </div>
        </div>
      </Panel>
      {fleet.map((a) =>
        a.status === "error" ? (
          <FailedSection key={a.id} label={a.label} note={a.note} onRetry={onRetry} />
        ) : a.status === "done" ? (
          <ReadySectionCard key={a.id} label={a.label} sources={a.sources} />
        ) : a.status === "running" ? (
          <StreamingSectionCard key={a.id} label={a.label} text={partials[a.id]} />
        ) : (
          <PendingSection key={a.id} name={a.label} />
        ),
      )}
      <WriteCta ready={false} />
    </>
  );
}

function ErrorBody({ message, onRetry, onReset }: { message: string | null; onRetry: () => void; onReset: () => void }) {
  return (
    <Panel className="cll-fade p-8" style={{ borderColor: "rgba(251,113,133,0.35)" }}>
      <div className="flex flex-col items-center text-center">
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-[16px] border border-border-strong bg-danger-weak text-danger">
          <AlertTriangle size={22} />
        </span>
        <h3 className="text-[16px] font-bold text-fg">Research could not complete</h3>
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-fg-mid">
          {message ??
            "Something went wrong while researching. Check that the backend and your LLM provider are reachable, then try again."}
        </p>
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="primary" size="md" onClick={onRetry}>
            <RotateCw size={14} /> Try again
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={onReset}>
            New research
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/* ── Idle entry form ─────────────────────────────────────────────── */
function useCompanySuggest(query: string): CompanySuggestion[] {
  const [items, setItems] = useState<CompanySuggestion[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const id = window.setTimeout(() => {
      suggestCompanies(q, ctrl.signal)
        .then(setItems)
        .catch(() => {
          /* aborted or offline — keep the last suggestions empty */
        });
    }, 200);
    return () => {
      window.clearTimeout(id);
      ctrl.abort();
    };
  }, [query]);
  return items;
}

function SuggestAvatar({ name, logo }: { name: string; logo?: string | null }) {
  const src = companyLogoUrl(logo);
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img src={src} alt="" className="h-7 w-7 shrink-0 rounded-[7px] object-cover" onError={() => setBroken(true)} />
    );
  }
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-surface-2 font-mono text-[12px] text-accent-text">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function IdleForm({
  company,
  role,
  url,
  onCompany,
  onRole,
  onUrl,
  onAutofill,
  autofilling,
  onRun,
  busy,
  cacheHit,
  onView,
  onRerun,
  onDismissCache,
}: {
  company: string;
  role: string;
  url: string;
  onCompany: (v: string) => void;
  onRole: (v: string) => void;
  onUrl: (v: string) => void;
  onAutofill: () => void;
  autofilling: boolean;
  onRun: () => void;
  busy: boolean;
  cacheHit: { cached_at: string } | null;
  onView: () => void;
  onRerun: () => void;
  onDismissCache: () => void;
}) {
  const [companyFocused, setCompanyFocused] = useState(false);
  const suggestions = useCompanySuggest(company);
  const showSuggestions = companyFocused && suggestions.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <Panel className="cll-fade p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-border-strong bg-accent-weak text-accent-text">
            <Search size={16} />
          </span>
          <div>
            <div className="text-[13px] font-semibold text-fg">Local multi-agent research</div>
            <p className="mt-1 text-[12px] leading-relaxed text-fg-mid">
              Eight agents gather firmographics, culture, tech and hiring signals in parallel, then a local fit analysis
              scores you against the posting. Only the company name and the job text leave your device — your CV never
              does.
            </p>
          </div>
        </div>
      </Panel>
      <Panel className="cll-fade p-6">
        <div className="mb-4 text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">New research</div>
        <form
          className="flex max-w-[540px] flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onRun();
          }}
        >
          <Field label="Company">
            <div className="relative">
              <Input
                value={company}
                onChange={(e) => {
                  onCompany(e.target.value);
                  setCompanyFocused(true);
                }}
                onFocus={() => setCompanyFocused(true)}
                onBlur={() => setCompanyFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setCompanyFocused(false);
                }}
                placeholder="e.g. Anthropic"
                role="combobox"
                aria-expanded={showSuggestions}
                aria-autocomplete="list"
                autoComplete="off"
              />
              {showSuggestions ? (
                <div
                  role="listbox"
                  aria-label="Company suggestions"
                  className="absolute inset-x-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-[12px] border border-border-strong bg-surface-3 p-1.5 shadow-[0_24px_54px_-20px_rgba(0,0,0,.8)]"
                  style={{ animation: "cll-menu .16s ease" }}
                >
                  {suggestions.slice(0, 6).map((c) => (
                    <button
                      key={`${c.name}-${c.domain ?? ""}`}
                      type="button"
                      role="option"
                      aria-selected={false}
                      // mouseDown fires before the input's blur, so the pick lands before the menu closes.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onCompany(c.name);
                        setCompanyFocused(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-left transition-colors hover:bg-accent-weak"
                    >
                      <SuggestAvatar name={c.name} logo={c.logo} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-fg">{c.name}</span>
                        {c.domain ? (
                          <span className="block truncate font-mono text-[10px] text-fg-low">{c.domain}</span>
                        ) : c.description ? (
                          <span className="block truncate text-[10px] text-fg-low">{c.description}</span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </Field>

          <Field label="Role / job title" hint="Optional — sharpens role-specific fit and interview prep.">
            <Input value={role} onChange={(e) => onRole(e.target.value)} placeholder="e.g. ML Engineer" />
          </Field>

          <Field label="Or paste a job posting URL" hint="We read the public page and fill company, role and the job description.">
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => onUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAutofill();
                  }
                }}
                placeholder="https://…"
                className="flex-1"
                inputMode="url"
              />
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={onAutofill}
                loading={autofilling}
                disabled={!url.trim() || autofilling}
              >
                <Link2 size={15} /> Autofill
              </Button>
            </div>
          </Field>

          {cacheHit ? (
            <div className="rounded-[10px] border border-border-strong bg-surface-2 p-3.5">
              <div className="flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.01em] text-fg-mid">
                <StatDot tone="accent" size={6} /> Already researched · cached {formatWhen(cacheHit.cached_at)}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-fg-mid">
                Open the saved report instantly, or re-run for fresh results.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="solid" size="sm" onClick={onView}>
                  View report
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={onRerun}>
                  <RotateCw size={13} /> Re-run
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onDismissCache}>
                  Dismiss
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full rounded-[12px]"
              loading={busy}
              disabled={busy || !company.trim()}
            >
              <Search size={16} /> Run research
            </Button>
          )}
        </form>
      </Panel>
    </div>
  );
}

/* ── Header pieces ───────────────────────────────────────────────── */
function CompanyChip({ company }: { company: string }) {
  return (
    <span className="flex items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3.5 py-2 text-[13px] text-fg">
      {company}
      <span className="font-mono text-[10px] text-fg-low">· editable</span>
    </span>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */
export function Research() {
  const params = useParams<{ companySlug?: string }>();
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<RunPhase>("idle");

  // Idle-form inputs (lifted so cache-check + autofill can drive them).
  const [company, setCompanyRaw] = useState("");
  const [role, setRole] = useState("");
  const [url, setUrl] = useState("");
  const [jobDescription, setJobDescription] = useState<string | null>(null);

  // Run state.
  const [report, setReport] = useState<WireReport | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentUi[]>(IDLE_AGENTS);
  const [total, setTotal] = useState(0);
  const [sources, setSources] = useState<UiSource[]>([]);
  const [partials, setPartials] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cache-check / autofill affordances.
  const [cacheHit, setCacheHit] = useState<CachedReport | null>(null);
  const [checkingCache, setCheckingCache] = useState(false);
  const [autofilling, setAutofilling] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const agentStartRef = useRef<Record<string, number>>({});
  const bootRef = useRef(false);

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Boot from URL param / slug
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const targetComp = params.companySlug || searchParams.get("company");
    const targetRole = searchParams.get("role");
    if (targetRole) setRole(targetRole);
    if (targetComp) {
      setCompanyRaw(targetComp);
      void getCachedReport(targetComp, targetRole || undefined).then((hit) => {
        if (hit && hit.report) {
          const r = hit.report as unknown as WireReport;
          setReport(r);
          setCachedAt(hit.cached_at);
          setAgents(synthAgents(r));
          setTotal(CONSOLE_AGENTS.length);
          setSources(r.meta.sources.map((s) => ({ label: s.label, url: s.url ?? null })));
          setPhase("done");
        }
      });
    }
  }, [params, searchParams]);

  // Editing the target invalidates a pending cache choice (key = company + role).
  const setCompany = (v: string) => {
    setCompanyRaw(v);
    setCacheHit(null);
  };
  const setRoleInput = (v: string) => {
    setRole(v);
    setCacheHit(null);
  };

  const onEvent = useCallback((event: ResearchEvent) => {
    switch (event.type) {
      case "phase": {
        if (event.phase === "gather") {
          setTotal(event.total);
          setAgents(event.agents.map((id): AgentUi => ({ id, label: agentLabel(id), status: "queued", sources: [] })));
        }
        break;
      }
      case "agent_started": {
        agentStartRef.current[event.agent] = performance.now();
        setAgents((prev) =>
          prev.map((a) =>
            a.id === event.agent ? { ...a, status: a.status === "error" ? "error" : "running", note: undefined } : a,
          ),
        );
        break;
      }
      case "source": {
        setSources((prev) =>
          prev.some((s) => s.label === event.source) ? prev : [...prev, { label: event.source, url: null }],
        );
        setAgents((prev) =>
          prev.map((a) =>
            a.id === event.agent && !a.sources.includes(event.source)
              ? { ...a, sources: [...a.sources, event.source] }
              : a,
          ),
        );
        break;
      }
      case "agent_progress": {
        setPartials((prev) => ({ ...prev, [event.agent]: event.text }));
        setAgents((prev) =>
          prev.map((a) =>
            a.id === event.agent && a.status !== "done" && a.status !== "error" ? { ...a, status: "running" } : a,
          ),
        );
        break;
      }
      case "agent_done": {
        const start = agentStartRef.current[event.agent];
        const dur = start ? `${((performance.now() - start) / 1000).toFixed(1)}s` : undefined;
        const labels = event.sources.map((s) => s.label ?? s.source ?? "source");
        setSources((prev) => {
          const next = [...prev];
          for (const s of event.sources) {
            const label = s.label ?? s.source ?? "source";
            if (!next.some((x) => x.label === label)) next.push({ label, url: s.url ?? null });
          }
          return next;
        });
        setPartials((prev) => {
          const next = { ...prev };
          delete next[event.agent];
          return next;
        });
        setAgents((prev) =>
          prev.map((a) =>
            a.id === event.agent
              ? { ...a, status: "done", durationLabel: dur, sources: labels.length ? labels : a.sources }
              : a,
          ),
        );
        break;
      }
      case "agent_error": {
        setAgents((prev) => prev.map((a) => (a.id === event.agent ? { ...a, status: "error", note: event.error } : a)));
        setPartials((prev) => {
          const next = { ...prev };
          delete next[event.agent];
          return next;
        });
        break;
      }
      case "cached": {
        setCachedAt(event.cached_at);
        break;
      }
      case "done": {
        const r = event.report as unknown as WireReport;
        setReport(r);
        setSources(r.meta.sources.map((s) => ({ label: s.label, url: s.url ?? null })));
        setAgents((prev) => reconcileAgents(prev, r));
        if (!r.meta.from_cache) setCachedAt(null);
        setPhase("done");
        break;
      }
      case "fatal": {
        setErrorMsg(event.error);
        setPhase("error");
        toast.danger("Research failed", event.error);
        break;
      }
    }
  }, []);

  function startStream(refresh: boolean) {
    const c = company.trim();
    if (!c) {
      toast.warning("Company required", "Enter a company name to research.");
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    agentStartRef.current = {};

    setCacheHit(null);
    setReport(null);
    setCachedAt(null);
    setErrorMsg(null);
    setAgents(IDLE_AGENTS);
    setSources([]);
    setPartials({});
    setTotal(0);
    setPhase("running");

    const input: ResearchInput = {
      company_name: c,
      role_title: role.trim() || null,
      job_description: jobDescription,
      refresh,
    };
    streamResearch(input, onEvent, ctrl.signal).catch((err: unknown) => {
      if (ctrl.signal.aborted) return;
      const msg = errorMessage(err);
      setErrorMsg(msg);
      setPhase("error");
      toast.danger("Research failed", msg);
    });
  }

  async function handleRun() {
    const c = company.trim();
    if (!c) {
      toast.warning("Company required", "Enter a company name to research.");
      return;
    }
    setCheckingCache(true);
    const hit = await getCachedReport(c, role.trim() || undefined);
    setCheckingCache(false);
    if (hit) {
      setCacheHit(hit);
      return;
    }
    startStream(false);
  }

  function loadCachedReport() {
    if (!cacheHit) return;
    const r = cacheHit.report as unknown as WireReport;
    setReport(r);
    setCachedAt(cacheHit.cached_at);
    setAgents(synthAgents(r));
    setTotal(CONSOLE_AGENTS.length);
    setSources(r.meta.sources.map((s) => ({ label: s.label, url: s.url ?? null })));
    setCacheHit(null);
    setErrorMsg(null);
    setPhase("done");
  }

  async function handleAutofill() {
    const raw = url.trim();
    if (!raw) return;
    setAutofilling(true);
    try {
      const res = await autofillFromJobUrl(raw);
      setCompanyRaw(res.company);
      setRole(res.role);
      setJobDescription(res.job_description || null);
      setCacheHit(null);
      toast.success("Autofilled from posting", res.company ? `Detected ${res.company}${res.role ? ` · ${res.role}` : ""}.` : "Filled the form from the job posting.");
    } catch (err) {
      toast.danger("Could not read that link", errorMessage(err));
    } finally {
      setAutofilling(false);
    }
  }

  function resetIdle() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setReport(null);
    setCachedAt(null);
    setErrorMsg(null);
    setAgents(IDLE_AGENTS);
    setSources([]);
    setPartials({});
    setTotal(0);
    setCacheHit(null);
  }

  const displayAgents = phase === "idle" ? IDLE_AGENTS : agents;
  const doneCount = displayAgents.filter((a) => a.status === "done").length;
  const totalAgents = phase === "idle" ? CONSOLE_AGENTS.length : total || displayAgents.length;
  const countLabel = `${doneCount} / ${totalAgents}`;
  const pct = totalAgents ? (doneCount / totalAgents) * 100 : 0;
  const displaySources = phase === "idle" ? [] : sources;

  const actions =
    phase === "idle" ? null : (
      <>
        {company.trim() ? <CompanyChip company={company.trim()} /> : null}
        {phase === "running" ? (
          <Button type="button" variant="outline" size="sm" onClick={resetIdle}>
            <X size={14} /> Stop
          </Button>
        ) : (
          <>
            <Button type="button" variant="primary" size="sm" onClick={() => startStream(true)}>
              <RotateCw size={14} /> Re-run
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetIdle}>
              New
            </Button>
          </>
        )}
      </>
    );

  return (
    <Page eyebrow="Generate / Research" title="Company Research" actions={actions} bodyClassName="px-7 py-5">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[288px_1fr]">
        <section className="cll-fade flex flex-col gap-3.5">
          <AgentsPanel agents={displayAgents} count={countLabel} pct={pct} />
          <SourcesPanel sources={displaySources} />
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          {phase === "idle" ? (
            <IdleForm
              company={company}
              role={role}
              url={url}
              onCompany={setCompany}
              onRole={setRoleInput}
              onUrl={setUrl}
              onAutofill={handleAutofill}
              autofilling={autofilling}
              onRun={handleRun}
              busy={checkingCache}
              cacheHit={cacheHit ? { cached_at: cacheHit.cached_at } : null}
              onView={loadCachedReport}
              onRerun={() => startStream(true)}
              onDismissCache={() => setCacheHit(null)}
            />
          ) : null}

          {phase === "running" ? (
            <RunningBody
              agents={agents}
              partials={partials}
              company={company.trim()}
              doneCount={doneCount}
              total={total}
              onRetry={() => startStream(true)}
            />
          ) : null}

          {phase === "done" && report ? <DoneBody report={report} cachedAt={cachedAt} /> : null}

          {phase === "error" ? (
            <ErrorBody message={errorMsg} onRetry={() => startStream(true)} onReset={resetIdle} />
          ) : null}
        </section>
      </div>
    </Page>
  );
}
