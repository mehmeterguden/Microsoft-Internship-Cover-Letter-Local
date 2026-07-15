import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  RotateCw,
  Search,
} from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Pill, Skeleton, StatDot } from "@/components/ui/feedback";
import { ScoreRing, SourceChip } from "@/components/ui/data";
import { cn } from "@/lib/utils";

/* ── State model ─────────────────────────────────────────────────
   Backend wiring is deferred; the "PREVIEW STATE" switcher (from the
   design) drives local state so every variant is viewable. When we wire
   the multi-agent engine, `state` will be derived from the live run
   (idle → running → done) and the switcher becomes a dev-only affordance. */
type ResearchState = "idle" | "running" | "done";

const STATE_OPTIONS: { value: ResearchState; label: string; desc: string }[] = [
  { value: "idle", label: "New research", desc: "Enter a company to research" },
  { value: "running", label: "Live console", desc: "Agents running, report streaming" },
  { value: "done", label: "Report ready", desc: "Full research complete" },
];

const COMPANY = "Anthropic";

/* Placeholder company directory for the idle-form autocomplete. Local only —
   no network. A real build swaps this for a company-suggest endpoint. */
const COMPANY_SUGGESTIONS: { name: string; domain: string }[] = [
  { name: "Anthropic", domain: "anthropic.com" },
  { name: "OpenAI", domain: "openai.com" },
  { name: "Mistral AI", domain: "mistral.ai" },
  { name: "Hugging Face", domain: "huggingface.co" },
  { name: "Cohere", domain: "cohere.com" },
  { name: "Google DeepMind", domain: "deepmind.google" },
];

/* ── Placeholder data (verbatim from the design) ─────────────────── */
type AgentStatus = "done" | "running" | "queued" | "error";
type Agent = { name: string; status: AgentStatus; note?: string; label?: string; sources?: string[] };

const AGENT_NAMES = [
  "Firmographics",
  "Company overview",
  "Values & mission",
  "Culture",
  "Tech stack",
  "Recent signals",
  "Interview prep",
  "Fit analysis",
] as const;

const DONE_AGENTS: Agent[] = [
  { name: "Firmographics", status: "done", label: "0.9s" },
  { name: "Company overview", status: "done", label: "1.4s" },
  { name: "Values & mission", status: "done", label: "1.1s" },
  { name: "Culture", status: "done", label: "1.7s" },
  { name: "Tech stack", status: "done", label: "0.8s" },
  { name: "Recent signals", status: "done", label: "2.1s" },
  { name: "Interview prep", status: "done", label: "1.3s" },
  { name: "Fit analysis", status: "done", label: "0.6s" },
];

const RUNNING_AGENTS: Agent[] = [
  { name: "Firmographics", status: "done", label: "0.9s" },
  { name: "Company overview", status: "done", label: "1.4s" },
  { name: "Values & mission", status: "done", label: "1.1s" },
  { name: "Culture", status: "error", note: "glassdoor blocked · retried 2×", label: "failed" },
  { name: "Tech stack", status: "queued" },
  { name: "Recent signals", status: "running", note: "streaming…", sources: ["anthropic.com", "techcrunch"] },
  { name: "Interview prep", status: "queued" },
  { name: "Fit analysis", status: "queued" },
];

const IDLE_AGENTS: Agent[] = AGENT_NAMES.map((name) => ({ name, status: "queued" as const }));

const ALL_SOURCES = [
  "anthropic.com/careers",
  "anthropic.com/research",
  "techcrunch · funding",
  "company blog · engineering",
  "linkedin · team growth",
  "glassdoor · culture",
];

const FIRMOGRAPHICS = [
  { k: "INDUSTRY", v: "AI safety & research" },
  { k: "SIZE", v: "~500 · Series C" },
  { k: "HQ", v: "San Francisco" },
  { k: "FOUNDED", v: "2021" },
];

const FIT_BREAKDOWN = [
  { label: "Technical skills", you: 80, need: 90 },
  { label: "Experience", you: 68, need: 70 },
  { label: "Domain knowledge", you: 75, need: 75 },
  { label: "Open-source", you: 56, need: 55 },
];

const TECH_STACK: { name: string; known: boolean }[] = [
  { name: "PyTorch", known: true },
  { name: "Kubernetes", known: true },
  { name: "JAX", known: false },
  { name: "Rust", known: false },
  { name: "Triton", known: false },
];

const VALUES: { t: string; c: number }[] = [
  { t: "Rigor and reproducibility in measurement", c: 2 },
  { t: "Researchers who also ship reliable product surfaces", c: 1 },
  { t: "A safety-first, evidence-driven culture", c: 2 },
  { t: "Long-horizon research over quarterly deadlines", c: 3 },
  { t: "Strong written communication and public documentation", c: 4 },
  { t: "Small, high-trust teams that own problems end to end", c: 5 },
];

const SKILLS_MATCHED = ["Evaluation", "PyTorch", "Distributed training", "Python", "Rust", "Quantization"];
const SKILLS_MISSING = ["RLHF", "Interpretability", "Red-teaming"];

const LETTER_HOOKS: { n: string; t: string }[] = [
  { n: "01", t: "Connect your per-commit eval harness to their emphasis on reproducible measurement." },
  { n: "02", t: "Mention your open-source maintenance as evidence of shipping discipline." },
];

const RECENT_SIGNALS_TEXT =
  "Shipped a major model release and grew the interpretability team last quarter. New reqs repeatedly stress evaluation infrastructure and reproducible measurement — a direct line to your open-source eval work. Fresh Series C funding is accelerating research-team hiring, so a grounded, evidence-first letter should land well.";

/* ── Small primitives ────────────────────────────────────────────── */
function Panel({ className, style, children }: { className?: string; style?: React.CSSProperties; children: ReactNode }) {
  return (
    <div className={cn("rounded-[12px] border border-border bg-surface", className)} style={style}>
      {children}
    </div>
  );
}

/** Inline citation marker, e.g. [1] — points at a source in the SOURCES rail. */
function Cite({ n }: { n: number }) {
  return (
    <button
      type="button"
      className="align-super font-mono text-[10px] text-accent-text transition-opacity hover:opacity-70"
    >
      [{n}]
    </button>
  );
}

/* ── Left rail: agents console ───────────────────────────────────── */
function AgentIcon({ status }: { status: AgentStatus }) {
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
      {status === "done" ? <Check size={12} strokeWidth={2.6} className="text-success" /> : null}
      {status === "running" ? <Loader2 size={12} className="animate-spin text-accent" /> : null}
      {status === "error" ? <AlertTriangle size={12} className="text-danger" /> : null}
      {status === "queued" ? <StatDot tone="neutral" size={6} /> : null}
    </span>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const noteColor = agent.status === "error" ? "text-danger" : "text-accent-text";
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-2 text-left transition-colors hover:bg-surface-2"
    >
      <AgentIcon status={agent.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-fg">{agent.name}</div>
        {agent.note ? <div className={cn("font-mono text-[10px]", noteColor)}>{agent.note}</div> : null}
        {agent.sources ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {agent.sources.map((s) => (
              <SourceChip key={s} label={s} />
            ))}
          </div>
        ) : null}
      </div>
      {agent.label ? (
        <span className={cn("font-mono text-[9px]", agent.status === "error" ? "text-danger" : "text-fg-low")}>
          {agent.label}
        </span>
      ) : null}
      <ChevronRight size={12} className="shrink-0 text-fg-low" />
    </button>
  );
}

function AgentsPanel({ agents, count, pct }: { agents: Agent[]; count: string; pct: number }) {
  return (
    <Panel className="p-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[1px] text-fg-mid">AGENTS</span>
        <span className="font-mono text-[10px] text-accent-text">{count}</span>
      </div>
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-input">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent-grad)" }} />
      </div>
      <div className="flex flex-col gap-2">
        {agents.map((a) => (
          <AgentRow key={a.name} agent={a} />
        ))}
      </div>
    </Panel>
  );
}

function SourcesPanel({ sources }: { sources: string[] }) {
  return (
    <Panel className="p-4">
      <div className="mb-3 font-mono text-[10px] tracking-[1px] text-fg-mid">SOURCES</div>
      {sources.length ? (
        <div className="flex flex-col gap-2.5">
          {sources.map((s, i) => (
            <button
              key={s}
              type="button"
              className="flex w-full items-center gap-2 text-left text-[11.5px] text-fg-mid transition-colors hover:text-fg"
            >
              <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] bg-accent-weak font-mono text-[9px] text-accent-text">
                {i + 1}
              </span>
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[11.5px] leading-relaxed text-fg-low">Sources appear here as agents cite them.</p>
      )}
    </Panel>
  );
}

/* ── Report sections ─────────────────────────────────────────────── */
function FitCard({ state }: { state: ResearchState }) {
  const running = state === "running";
  return (
    <Panel className="cll-fade flex items-center gap-[18px] p-5">
      <ScoreRing
        value={88}
        size={88}
        thickness={8}
        color="var(--accent)"
        track="var(--border)"
        bg="var(--surface)"
        label="/ 100"
        className="shadow-[0_0_30px_-6px_var(--accent-shadow)]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[10px] tracking-[1.2px] text-accent-text">FIT SCORE</span>
          <Pill tone="success" mono className="text-[9px]">
            STRONG MATCH
          </Pill>
          {running ? (
            <Pill tone="accent" mono className="text-[9px]">
              RUNNING · 44%
            </Pill>
          ) : (
            <>
              <Pill tone="accent" mono className="text-[9px]">
                COMPLETE · 100%
              </Pill>
              <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[9px] text-fg-low">
                FROM CACHE · 2h
              </span>
            </>
          )}
        </div>
        <p className="mt-2 text-[15px] leading-[1.55] text-fg">
          {running
            ? "Early read: strong alignment on evaluation & tooling. Still gathering culture and interview data — score may shift "
            : "Strong match on evaluation & alignment tooling. Your open-source eval work directly mirrors the team's stated priorities "}
          <Cite n={1} />.
        </p>
      </div>
    </Panel>
  );
}

function FitBreakdown() {
  return (
    <Panel className="cll-fade p-5">
      <div className="mb-3.5 flex items-center justify-between">
        <div className="text-[14px] font-semibold text-fg">Fit breakdown</div>
        <span className="font-mono text-[9px] text-fg-low">you vs role need</span>
      </div>
      <div className="flex flex-col gap-3.5">
        {FIT_BREAKDOWN.map((b) => (
          <div key={b.label}>
            <div className="mb-1.5 flex justify-between text-[12px]">
              <span className="text-fg">{b.label}</span>
              <span className="font-mono text-accent-text">
                {b.you} / {b.need}
              </span>
            </div>
            <div className="relative h-1.5 rounded-full bg-input">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${b.you}%`, background: "var(--accent-grad)" }}
              />
              <div
                className="absolute -bottom-[3px] -top-[3px] w-0.5 rounded-full"
                style={{ left: `${b.need}%`, background: "var(--text-mid)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Firmographics() {
  return (
    <Panel className="cll-fade grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
      {FIRMOGRAPHICS.map((it) => (
        <div key={it.k}>
          <div className="whitespace-nowrap font-mono text-[9px] tracking-[0.6px] text-fg-low">{it.k}</div>
          <div className="mt-1 text-[12.5px] font-semibold text-fg">{it.v}</div>
        </div>
      ))}
    </Panel>
  );
}

function TechStack() {
  return (
    <Panel className="cll-fade p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[14px] font-semibold text-fg">Tech stack</div>
        <div className="flex gap-3 font-mono text-[9px] text-fg-mid">
          <span className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: "var(--success)" }} /> you know
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: "var(--accent)" }} /> worth learning
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TECH_STACK.map((t) => (
          <span
            key={t.name}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11.5px]",
              t.known ? "bg-success-weak text-fg" : "bg-accent-weak text-accent-text",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-[2px]" style={{ background: t.known ? "var(--success)" : "var(--accent)" }} />
            {t.name}
          </span>
        ))}
      </div>
    </Panel>
  );
}

function ValuesList() {
  return (
    <Panel className="cll-fade p-5">
      <div className="mb-2.5 text-[14px] font-semibold text-fg">What they value</div>
      <div className="flex flex-col gap-2.5 text-[13px] leading-[1.6] text-fg-mid">
        {VALUES.map((v) => (
          <div key={v.t} className="flex gap-2.5">
            <span className="text-accent">—</span>
            <span>
              {v.t} <Cite n={v.c} />
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SkillsVsRole() {
  return (
    <Panel className="cll-fade p-5">
      <div className="mb-3 text-[14px] font-semibold text-fg">Your skills vs the role</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2.5 font-mono text-[9.5px] tracking-[0.8px] text-success">MATCHED · {SKILLS_MATCHED.length}</div>
          <div className="flex flex-wrap gap-1.5">
            {SKILLS_MATCHED.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 rounded-[7px] bg-success-weak px-2.5 py-1 text-[11.5px] text-fg">
                <Check size={11} strokeWidth={2.4} className="text-success" />
                {s}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2.5 font-mono text-[9.5px] tracking-[0.8px] text-warning">MISSING · {SKILLS_MISSING.length}</div>
          <div className="flex flex-wrap gap-1.5">
            {SKILLS_MISSING.map((s) => (
              <span
                key={s}
                className="rounded-[7px] border border-dashed border-border-strong bg-input px-2.5 py-1 text-[11.5px] text-fg-mid"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function LetterHooks() {
  return (
    <Panel className="cll-fade p-5">
      <div className="mb-2.5 text-[14px] font-semibold text-fg">Letter hooks · ammo</div>
      <div className="flex flex-col gap-2.5 text-[13px] leading-[1.6] text-fg-mid">
        {LETTER_HOOKS.map((h) => (
          <div key={h.n} className="flex gap-2.5">
            <span className="font-mono text-accent">{h.n}</span>
            <span>{h.t}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Types out `text` character-by-character while `active`; shows it whole otherwise. */
function useTypewriter(text: string, active: boolean, speed = 16): string {
  const [out, setOut] = useState(active ? "" : text);
  useEffect(() => {
    if (!active) {
      setOut(text);
      return;
    }
    setOut("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 2;
      setOut(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, active, speed]);
  return out;
}

function RecentSignals({ streaming }: { streaming: boolean }) {
  const typed = useTypewriter(RECENT_SIGNALS_TEXT, streaming);
  return (
    <Panel className="cll-fade relative p-5">
      {streaming ? (
        <div className="absolute right-[18px] top-4 flex items-center gap-1.5 font-mono text-[9.5px] text-accent-text">
          <StatDot tone="accent" pulse size={6} /> WRITING
        </div>
      ) : null}
      <div className="mb-2.5 text-[14px] font-semibold text-fg">Recent signals</div>
      <p className="max-w-[560px] text-[13px] leading-[1.7] text-fg-mid">
        {streaming ? typed : RECENT_SIGNALS_TEXT}
        {streaming ? <span className="cll-caret" aria-hidden /> : null}
      </p>
    </Panel>
  );
}

/** A report section still being gathered by its agent. */
function PendingSection({ name }: { name: string }) {
  return (
    <Panel className="cll-fade p-5">
      <div className="mb-3 flex items-center gap-2">
        <Loader2 size={13} className="animate-spin text-accent" />
        <span className="text-[13px] font-semibold text-fg">{name}</span>
        <span className="ml-auto font-mono text-[9px] text-fg-low">pending</span>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[85%]" />
        <Skeleton className="h-3 w-[60%]" />
      </div>
    </Panel>
  );
}

/** A section whose agent failed — surfaced, not hidden (research resilience). */
function FailedSection({ name }: { name: string }) {
  return (
    <Panel className="cll-fade p-5" style={{ borderColor: "rgba(251,113,133,0.35)" }}>
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-danger-weak text-danger">
          <AlertTriangle size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-fg">{name}</span>
            <Pill tone="danger" mono className="text-[9px]">
              FAILED
            </Pill>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-mid">
            Glassdoor was unreachable after 2 retries. The rest of the report continues without it.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0">
          <RefreshCw size={13} /> Retry
        </Button>
      </div>
    </Panel>
  );
}

function WriteCta({ ready }: { ready: boolean }) {
  if (!ready) {
    return (
      <Button variant="primary" size="lg" className="mt-1 w-full rounded-[12px]" loading disabled>
        Assembling research…
      </Button>
    );
  }
  return (
    <Button asChild variant="primary" size="lg" className="mt-1 w-full rounded-[12px]">
      <Link to="/write">
        Write cover letter with this research <ArrowRight size={16} />
      </Link>
    </Button>
  );
}

/* ── Idle entry form ─────────────────────────────────────────────── */
function IdleForm({ onRun }: { onRun: () => void }) {
  const [company, setCompany] = useState("");
  const [companyFocused, setCompanyFocused] = useState(false);
  const [role, setRole] = useState("");
  const [url, setUrl] = useState("");

  const query = company.trim().toLowerCase();
  const matches = query
    ? COMPANY_SUGGESTIONS.filter(
        (c) => c.name.toLowerCase().includes(query) || c.domain.toLowerCase().includes(query),
      )
    : [];
  const showSuggestions = companyFocused && matches.length > 0;

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
              Eight agents gather firmographics, culture, tech and hiring signals in parallel. Only the company name leaves
              your device (via Tavily) — your CV never does.
            </p>
          </div>
        </div>
      </Panel>
      <Panel className="cll-fade p-6">
        <div className="mb-4 font-mono text-[10px] tracking-[1px] text-fg-low">NEW RESEARCH</div>
        <form
          className="flex max-w-[520px] flex-col gap-4"
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
                  setCompany(e.target.value);
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
                  {matches.map((c) => (
                    <button
                      key={c.domain}
                      type="button"
                      role="option"
                      aria-selected={false}
                      // mouseDown fires before the input's blur, so the pick lands before the menu closes.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCompany(c.name);
                        setCompanyFocused(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-left transition-colors hover:bg-accent-weak"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-surface-2 font-mono text-[12px] text-accent-text">
                        {c.name.charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-fg">{c.name}</span>
                        <span className="block truncate font-mono text-[10px] text-fg-low">{c.domain}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </Field>
          <Field label="Role / job title">
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. ML Engineer" />
          </Field>
          <Field label="Job posting URL" hint="Optional — sharpens role-specific matching.">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full rounded-[12px]">
            <Search size={16} /> Run research
          </Button>
        </form>
      </Panel>
    </div>
  );
}

/* ── State bodies ────────────────────────────────────────────────── */
function StateBody({ state, onRun }: { state: ResearchState; onRun: () => void }) {
  const agents = state === "done" ? DONE_AGENTS : state === "running" ? RUNNING_AGENTS : IDLE_AGENTS;
  const count = state === "done" ? "8 / 8" : state === "running" ? "3 / 8" : "0 / 8";
  const pct = state === "done" ? 100 : state === "running" ? 44 : 0;
  const sources = state === "done" ? ALL_SOURCES : state === "running" ? ALL_SOURCES.slice(0, 4) : [];

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[288px_1fr]">
      <section className="cll-fade flex flex-col gap-3.5">
        <AgentsPanel agents={agents} count={count} pct={pct} />
        <SourcesPanel sources={sources} />
      </section>

      <section className="flex min-w-0 flex-col gap-4">
        {state === "idle" ? <IdleForm onRun={onRun} /> : null}

        {state === "running" ? (
          <>
            <FitCard state="running" />
            <Firmographics />
            <ValuesList />
            <FailedSection name="Culture" />
            <RecentSignals streaming />
            <PendingSection name="Tech stack" />
            <PendingSection name="Fit analysis" />
            <WriteCta ready={false} />
          </>
        ) : null}

        {state === "done" ? (
          <>
            <FitCard state="done" />
            <FitBreakdown />
            <Firmographics />
            <TechStack />
            <ValuesList />
            <SkillsVsRole />
            <LetterHooks />
            <RecentSignals streaming={false} />
            <WriteCta ready />
          </>
        ) : null}
      </section>
    </div>
  );
}

/* ── Header pieces ───────────────────────────────────────────────── */
function CompanyChip() {
  return (
    <span className="flex items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3.5 py-2 text-[13px] text-fg">
      {COMPANY}
      <span className="font-mono text-[10px] text-fg-low">· editable</span>
    </span>
  );
}

/* ── Preview-state switcher (mirrors Home.tsx) ───────────────────── */
function StateSwitcher({ state, onPick }: { state: ResearchState; onPick: (s: ResearchState) => void }) {
  const [open, setOpen] = useState(false);
  const current = STATE_OPTIONS.find((o) => o.value === state)!;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-[10px] border border-border-strong bg-surface px-3 py-2 transition-colors hover:border-accent"
      >
        <StatDot tone="accent" glow size={7} />
        <span className="text-left leading-tight">
          <span className="block font-mono text-[8.5px] tracking-[0.7px] text-fg-low">PREVIEW STATE</span>
          <span className="mt-px block text-[12.5px] font-semibold text-fg">{current.label}</span>
        </span>
        <ChevronDown size={15} className="text-fg-mid" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-[calc(100%+8px)] z-40 w-[290px] rounded-[13px] border border-border-strong bg-surface-3 p-1.5 shadow-[0_24px_54px_-20px_rgba(0,0,0,.8)]"
            style={{ animation: "cll-menu .16s ease" }}
          >
            {STATE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onPick(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left transition-colors hover:bg-accent-weak"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold text-fg">{o.label}</div>
                  <div className="mt-px text-[11px] text-fg-mid">{o.desc}</div>
                </div>
                {o.value === state ? <Check size={14} strokeWidth={2.4} className="shrink-0 text-accent-text" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function Research() {
  const [state, setState] = useState<ResearchState>("done");
  return (
    <Page
      eyebrow="GENERATE / RESEARCH"
      title="Company Research"
      actions={
        <>
          {state !== "idle" ? <CompanyChip /> : null}
          {state !== "idle" ? (
            <Button type="button" variant="primary" size="sm" onClick={() => setState("running")}>
              <RotateCw size={14} /> Re-run
            </Button>
          ) : null}
          <StateSwitcher state={state} onPick={setState} />
        </>
      }
      bodyClassName="px-7 py-5"
    >
      <StateBody state={state} onRun={() => setState("running")} />
    </Page>
  );
}
