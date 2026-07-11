import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, Check, CheckCircle2, Code2, Compass, Globe, Heart, Link2, Loader2, MessageSquare,
  Newspaper, PenLine, Target, TrendingUp, TriangleAlert, Users, Wand2, XCircle, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreRing } from "@/components/common/ScoreRing";
import { SourceChip } from "@/components/common/SourceChip";
import { CompanyAutocomplete } from "@/components/common/CompanyAutocomplete";
import { DevInspector } from "@/components/common/DevInspector";
import { Reveal, Stagger } from "@/lib/motion";
import type { CompanyIntelReport } from "@/api/types";
import { autofillFromJobUrl, streamResearch } from "@/api/research";
import { errorMessage } from "@/api/client";
import { toast } from "@/store/toast";

type AgentState = "pending" | "running" | "done" | "error";

/** Friendly label + icon for each agent/local step, shown in the live console. */
const AGENT_META: Record<string, { label: string; icon: LucideIcon }> = {
  firmographics: { label: "Firmographics", icon: Building2 },
  overview: { label: "Overview", icon: Compass },
  values: { label: "Values", icon: Heart },
  culture: { label: "Culture", icon: Users },
  tech_stack: { label: "Tech stack", icon: Code2 },
  signals: { label: "Recent signals", icon: Newspaper },
  interview: { label: "Interview prep", icon: MessageSquare },
  jd_analyst: { label: "Role fit", icon: Target },
  fit: { label: "Fit scoring", icon: Target },
  ammo: { label: "Talking points", icon: Zap },
};
const agentMeta = (name: string) => AGENT_META[name] ?? { label: name, icon: Compass };

const DIMENSIONS: { icon: LucideIcon; title: string; body: string; tone: string }[] = [
  { icon: Building2, title: "Firmographics", body: "Size, industry, HQ, founding — the factual basics.", tone: "text-accent-ink bg-accent-soft" },
  { icon: Compass, title: "Overview", body: "What the company does and where it's headed.", tone: "text-blue bg-blue-soft" },
  { icon: Heart, title: "Values & culture", body: "How they describe themselves and what they prize.", tone: "text-danger bg-danger-soft" },
  { icon: Code2, title: "Tech stack", body: "Languages, frameworks, and tooling they use.", tone: "text-violet bg-violet-soft" },
  { icon: Newspaper, title: "Recent signals", body: "News, launches, and momentum worth citing.", tone: "text-gold bg-gold-soft" },
  { icon: Target, title: "Role fit", body: "How your profile maps to the job — matched & missing.", tone: "text-accent-ink bg-accent-soft" },
  { icon: MessageSquare, title: "Interview prep", body: "Likely questions and angles to prepare for.", tone: "text-blue bg-blue-soft" },
  { icon: Users, title: "Talking points", body: "Specific hooks to weave into your letter.", tone: "text-violet bg-violet-soft" },
];

export function Research() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jd, setJd] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [running, setRunning] = useState(false);
  const [states, setStates] = useState<Record<string, AgentState>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<Record<string, string>>({}); // live/final text per agent
  const [srcs, setSrcs] = useState<Record<string, { source: string; ok: boolean }[]>>({}); // consulted sources
  const [phase, setPhase] = useState<"gather" | "analyze" | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<CompanyIntelReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  const pinnedRef = useRef(false); // true once the user manually picks an agent
  const navigate = useNavigate();

  function stopTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  useEffect(() => () => {
    abortRef.current?.abort();
    stopTimer();
  }, []);

  // Hand off to the cover-letter writer: prefill company/role/JD and auto-start.
  // The backend re-uses the cached research (keyed by company+role) automatically.
  function writeLetter() {
    const qs = new URLSearchParams({ company: report?.company ?? company, auto: "1" });
    const r = roleLabel(report?.role) || role;
    if (r) qs.set("role", r);
    if (jd.trim()) qs.set("jd", jd);
    navigate(`/write?${qs.toString()}`);
  }

  // Read a pasted job posting link and let the AI fill company/role/JD.
  async function autofill() {
    const url = jobUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      const res = await autofillFromJobUrl(url);
      if (res.company) setCompany(res.company);
      if (res.role) setRole(res.role);
      if (res.job_description) setJd(res.job_description);
      const filled = [res.company && "company", res.role && "role", res.job_description && "description"].filter(Boolean);
      toast.success("Filled from the posting", filled.length ? `Got the ${filled.join(", ")}. Review, then research.` : "Review the fields, then research.");
    } catch (err) {
      toast.danger("Couldn't read that link", errorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  async function run() {
    if (!company.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setReport(null);
    setStates({});
    setOrder([]);
    setOutputs({});
    setSrcs({});
    setPhase(null);
    setElapsed(0);
    setSelected(null);
    pinnedRef.current = false;
    setRunning(true);

    const t0 = performance.now();
    stopTimer();
    timerRef.current = window.setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);

    try {
      await streamResearch(
        { company_name: company, role_title: role || null, job_description: jd || null },
        (event) => {
          switch (event.type) {
            case "phase":
              setPhase(event.phase);
              setOrder((prev) => [...new Set([...prev, ...event.agents])]);
              setStates((s) => {
                const next = { ...s };
                for (const a of event.agents) next[a] ??= "pending";
                return next;
              });
              break;
            case "agent_started":
              setStates((s) => ({ ...s, [event.agent]: "running" }));
              setOutputs((o) => ({ ...o, [event.agent]: "" }));
              // Auto-follow the agent that just started, unless the user pinned one.
              if (!pinnedRef.current) setSelected(event.agent);
              break;
            case "source":
              setSrcs((s) => ({ ...s, [event.agent]: [...(s[event.agent] ?? []), { source: event.source, ok: event.ok }] }));
              break;
            case "agent_progress":
              setOutputs((o) => ({ ...o, [event.agent]: event.text }));
              break;
            case "agent_done":
              setStates((s) => ({ ...s, [event.agent]: "done" }));
              setOutputs((o) => ({ ...o, [event.agent]: JSON.stringify(event.data, null, 2) }));
              break;
            case "agent_error":
              setStates((s) => ({ ...s, [event.agent]: "error" }));
              setOutputs((o) => ({ ...o, [event.agent]: `// Error\n${event.error}` }));
              break;
            case "cached":
              toast.info("Loaded from cache", "This company was researched recently.");
              break;
            case "done":
              stopTimer();
              setReport(event.report);
              setRunning(false);
              break;
            case "fatal":
              stopTimer();
              toast.danger("Research failed", event.error);
              setRunning(false);
              break;
          }
        },
        controller.signal,
      );
    } catch (err) {
      stopTimer();
      if (!controller.signal.aborted) {
        toast.danger("Research failed", err instanceof Error ? err.message : "Stream error");
      }
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Apply"
        title="Company research"
        icon={Building2}
        description="Parallel agents research the company and role, streaming a detailed, source-cited report. Only the company name leaves your device."
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 pt-5">
          {/* Autofill from a job posting link — we scrape the page and let AI fill the fields. */}
          <div className="grid gap-2.5 rounded-[13px] border border-accent/25 bg-accent-soft/40 p-3.5">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-text">
              <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-accent text-on-accent"><Wand2 size={13} /></span>
              Autofill from a job posting link
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
                <Input
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !importing) autofill(); }}
                  placeholder="https://company.com/careers/software-engineer"
                  className="pl-9"
                  type="url"
                  inputMode="url"
                />
              </div>
              <Button variant="secondary" onClick={autofill} loading={importing} disabled={!jobUrl.trim()}>
                <Wand2 size={15} /> Autofill
              </Button>
            </div>
            <p className="text-[12px] leading-snug text-text-3">
              Paste the posting URL — we read the page and fill in the company, role, and job description below with AI.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-3">or enter manually</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" htmlFor="co" required>
              <CompanyAutocomplete
                id="co"
                value={company}
                onChange={setCompany}
                onSelect={(s) => {
                  // If the picked company names a role-agnostic domain, prefill nothing else,
                  // but keep the clean canonical name for better research.
                  if (s.name) setCompany(s.name);
                }}
              />
            </Field>
            <Field label="Role" htmlFor="ro">
              <Input id="ro" value={role} placeholder="e.g. Software Engineer" onChange={(e) => setRole(e.target.value)} />
            </Field>
          </div>
          <Field label="Job description" htmlFor="jd" hint="Optional — improves the fit analysis">
            <Textarea id="jd" value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the posting…" />
          </Field>
          <div>
            <Button onClick={run} loading={running} disabled={!company.trim()}>
              <Building2 size={16} /> Research company
            </Button>
          </div>
        </CardContent>
      </Card>

      {running && (
        <AgentConsole
          order={order}
          states={states}
          outputs={outputs}
          srcs={srcs}
          phase={phase}
          elapsed={elapsed}
          selected={selected}
          onSelect={(a) => {
            pinnedRef.current = true;
            setSelected(a);
          }}
        />
      )}

      {!running && !report && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-3">What we uncover</p>
            <span className="h-px flex-1 bg-line" />
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-3">
              <TrendingUp size={14} className="text-accent-ink" /> 8 parallel agents
            </span>
          </div>
          <Stagger stagger={0.05} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DIMENSIONS.map(({ icon: Icon, title, body, tone }) => (
              <Reveal key={title}>
                <div className="h-full rounded-[16px] border border-border bg-surface p-4 shadow-soft">
                  <span className={`mb-3 inline-grid h-10 w-10 place-items-center rounded-[11px] ${tone}`}>
                    <Icon size={19} />
                  </span>
                  <p className="text-[14px] font-bold">{title}</p>
                  <p className="mt-1 text-[12.5px] leading-snug text-text-2">{body}</p>
                </div>
              </Reveal>
            ))}
          </Stagger>
        </section>
      )}

      {/* Partial run: some agents failed/timed out — the report is still shown, just
          missing those sections. Derived from the agent_error events already tracked. */}
      {report && order.some((a) => states[a] === "error" && a !== "fit" && a !== "ammo") && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-[12px] border border-gold/25 bg-gold-soft px-4 py-3">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-gold" />
          <div className="text-[13.5px] leading-snug text-text">
            <p className="font-semibold">Some sections couldn't be researched</p>
            <p className="mt-0.5 text-text-2">
              {order
                .filter((a) => states[a] === "error" && a !== "fit" && a !== "ammo")
                .map((a) => agentMeta(a).label)
                .join(", ")}{" "}
              came back empty this run — the rest of the report is complete. Re-run to try again.
            </p>
          </div>
        </div>
      )}

      {report && <Report report={report} onWrite={writeLetter} />}
    </>
  );
}

// ── Live agent console ────────────────────────────────────────────

type Stage = "queued" | "starting" | "gathering" | "writing" | "done" | "error";

/** Where an agent is in its lifecycle, derived from its state + what it has produced. */
function stageOf(state: AgentState, hasText: boolean, sourceCount: number): Stage {
  if (state === "done") return "done";
  if (state === "error") return "error";
  if (state === "pending") return "queued";
  if (hasText) return "writing";
  if (sourceCount > 0) return "gathering";
  return "starting";
}

const STAGE_LABEL: Record<Stage, string> = {
  queued: "Queued",
  starting: "Starting up…",
  gathering: "Gathering sources",
  writing: "Writing JSON…",
  done: "Done",
  error: "Failed",
};

const STAGE_BADGE: Record<Stage, "neutral" | "accent" | "gold" | "success" | "danger"> = {
  queued: "neutral",
  starting: "accent",
  gathering: "gold",
  writing: "accent",
  done: "success",
  error: "danger",
};

const PHASE_LABEL: Record<string, string> = {
  gather: "Gathering intelligence from the web",
  analyze: "Analyzing fit & letter angles (on-device)",
};

const STEPS = ["Start", "Gather", "Write JSON", "Validate"];

function stepStatus(i: number, stage: Stage): "done" | "active" | "todo" | "error" {
  if (stage === "done") return "done";
  if (stage === "queued") return "todo";
  if (stage === "error") return i < 2 ? "done" : i === 2 ? "error" : "todo";
  const active = stage === "starting" ? 0 : stage === "gathering" ? 1 : 2; // writing
  if (i < active) return "done";
  if (i === active) return "active";
  return "todo";
}

function fmtSecs(s: number): string {
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

/** Turn a raw source string (URL or label) into a SourceChip's props. */
function srcChip(s: { source: string; ok: boolean }) {
  const isUrl = /^https?:\/\//i.test(s.source);
  let label = s.source;
  if (isUrl) {
    try {
      label = new URL(s.source).hostname.replace(/^www\./, "");
    } catch {
      /* keep the raw string */
    }
  }
  return { label, url: isUrl ? s.source : undefined, ok: s.ok };
}

/** Four-step tracker showing exactly where the selected agent is right now. */
function StepTracker({ stage }: { stage: Stage }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-border px-3.5 py-3">
      {STEPS.map((label, i) => {
        const st = stepStatus(i, stage);
        return (
          <Fragment key={label}>
            {i > 0 && <span className={cn("h-px flex-1 transition-colors", st === "todo" ? "bg-border" : "bg-accent")} />}
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors",
                  st === "done"
                    ? "bg-accent text-on-accent"
                    : st === "active"
                      ? "bg-accent/15 text-accent-ink ring-2 ring-accent/45"
                      : st === "error"
                        ? "bg-danger text-white"
                        : "border border-border bg-surface-2 text-text-3",
                )}
              >
                {st === "done" ? <Check size={13} /> : st === "active" ? <Loader2 size={12} className="animate-spin" /> : st === "error" ? <XCircle size={13} /> : i + 1}
              </span>
              <span className={cn("hidden text-[12px] font-medium sm:inline", st === "todo" ? "text-text-3" : st === "error" ? "text-danger" : "text-text")}>{label}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Auto-scrolling code block that shows an agent's JSON as it streams in. */
function LiveCode({ text, live }: { text: string; live: boolean }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current && live) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text, live]);
  return (
    <pre ref={ref} className="max-h-[48vh] min-h-[220px] flex-1 overflow-auto bg-navy p-4 font-mono text-[12px] leading-relaxed text-white/90">
      <code>
        {text ? text : <span className="text-white/40">{live ? "Waiting for the model…" : "Nothing yet."}</span>}
        {live && (
          <span
            className="ml-0.5 inline-block h-[1.05em] w-[7px] translate-y-[0.15em] bg-accent"
            style={{ animation: "cll-caret 1s step-end infinite" }}
          />
        )}
      </code>
    </pre>
  );
}

/**
 * Live view of the agent fleet while research runs. A phase banner + progress bar
 * up top, a clickable status list on the left (each row shows its live sub-stage),
 * and on the right a step tracker, the sources it consulted, and its JSON being
 * streamed token by token — so it's always clear what's happening right now.
 */
function AgentConsole({
  order,
  states,
  outputs,
  srcs,
  phase,
  elapsed,
  selected,
  onSelect,
}: {
  order: string[];
  states: Record<string, AgentState>;
  outputs: Record<string, string>;
  srcs: Record<string, { source: string; ok: boolean }[]>;
  phase: "gather" | "analyze" | null;
  elapsed: number;
  selected: string | null;
  onSelect: (agent: string) => void;
}) {
  const doneCount = order.filter((a) => states[a] === "done").length;
  const active = selected ?? order.find((a) => states[a] === "running") ?? order[0] ?? null;
  const activeState = active ? states[active] ?? "pending" : "pending";
  const activeText = active ? outputs[active] ?? "" : "";
  const activeSrcs = active ? srcs[active] ?? [] : [];
  const activeStage = stageOf(activeState, activeText.length > 0, activeSrcs.length);
  const pct = order.length ? Math.round((doneCount / order.length) * 100) : 0;

  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-[14px]">
          <Loader2 size={15} className="animate-spin text-accent-ink" /> Agents working live
        </CardTitle>
        <span className="flex items-center gap-1.5 font-mono text-[12px] font-medium text-text-3">
          {fmtSecs(elapsed)}
        </span>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Phase banner + overall progress */}
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
            <span className="flex items-center gap-1.5 font-semibold text-text">
              <Globe size={13} className="text-accent-ink" /> {phase ? PHASE_LABEL[phase] : "Starting the fleet…"}
            </span>
            <span className="text-text-3">{doneCount} / {order.length} agents done</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[252px_1fr]">
          {/* Agent list */}
          <ul className="grid content-start gap-1.5">
            {order.map((a) => {
              const st = states[a] ?? "pending";
              const { label, icon: Icon } = agentMeta(a);
              const chars = outputs[a]?.length ?? 0;
              const nSrc = srcs[a]?.length ?? 0;
              const stage = stageOf(st, chars > 0, nSrc);
              const isActive = a === active;
              const metric = stage === "writing" && chars > 0 ? ` · ${chars} chars` : stage === "gathering" && nSrc > 0 ? ` · ${nSrc} sources` : "";
              return (
                <li key={a}>
                  <button
                    type="button"
                    onClick={() => onSelect(a)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors",
                      isActive ? "border-accent bg-accent-soft" : "border-border bg-surface-2 hover:border-border-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "relative grid h-7 w-7 shrink-0 place-items-center rounded-[8px] transition-colors",
                        st === "done"
                          ? "bg-good-soft text-good"
                          : st === "running"
                            ? "bg-accent text-on-accent"
                            : st === "error"
                              ? "bg-danger-soft text-danger"
                              : "bg-surface text-text-3",
                      )}
                    >
                      <Icon size={14} />
                      {st === "running" && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-accent ring-2 ring-surface" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[13px] font-semibold", st === "pending" ? "text-text-3" : "text-text")}>{label}</span>
                      <span className={cn("block truncate text-[11px]", st === "error" ? "text-danger" : "text-text-3")}>{STAGE_LABEL[stage]}{metric}</span>
                    </span>
                    {st === "done" ? (
                      <CheckCircle2 size={15} className="shrink-0 text-good" />
                    ) : st === "running" ? (
                      <Loader2 size={15} className="shrink-0 animate-spin text-accent-ink" />
                    ) : st === "error" ? (
                      <XCircle size={15} className="shrink-0 text-danger" />
                    ) : (
                      <span className="h-[13px] w-[13px] shrink-0 rounded-full border-2 border-border-strong" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Selected agent detail */}
          <div className="flex min-h-[300px] min-w-0 flex-col overflow-hidden rounded-[12px] border border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2 px-3.5 py-2">
              <span className="flex items-center gap-2 text-[12.5px] font-semibold text-text">
                {active ? agentMeta(active).label : "Agent output"}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-text-3">
                  {activeSrcs.length} src · {activeText.length} chars
                </span>
                <Badge tone={STAGE_BADGE[activeStage]}>{STAGE_LABEL[activeStage]}</Badge>
              </div>
            </div>

            {active && <StepTracker stage={activeStage} />}

            {activeSrcs.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3.5 py-2.5">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-text-3">Consulted</span>
                {activeSrcs.map((s, i) => {
                  const c = srcChip(s);
                  return <SourceChip key={`${c.label}-${i}`} label={c.label} url={c.url} ok={c.ok} />;
                })}
              </div>
            )}

            <LiveCode text={activeText} live={activeState === "running"} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** The report's `role` may arrive as a plain string or a structured analysis
 *  object ({title, ...}); render only its text so it never crashes as a child. */
function roleLabel(role: unknown): string {
  if (typeof role === "string") return role;
  if (role && typeof role === "object" && "title" in role) return String((role as { title?: unknown }).title ?? "");
  return "";
}

function Report({ report, onWrite }: { report: CompanyIntelReport; onWrite: () => void }) {
  const sections = report.sections ?? [];
  const roleText = roleLabel(report.role);
  return (
    <div className="grid gap-6" style={{ animation: "cll-rise 0.4s both" }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-bold">{report.company}</h2>
          {roleText && <p className="text-[14px] text-text-2">{roleText}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {report.from_cache && <Badge tone="neutral">From cache</Badge>}
          <Badge tone="accent">{report.completeness}% complete</Badge>
          <Button onClick={onWrite}>
            <PenLine size={16} /> Write cover letter
          </Button>
        </div>
      </div>

      {report.fit && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-5 pt-5">
            <ScoreRing value={report.fit.overall_score ?? 0} size={82} label="Fit" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
                <Target size={14} className="text-accent-ink" /> Fit for this role
              </p>
              <p className="mt-1 text-[14px] text-text-2">{report.fit.recommendation}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(report.fit.technical_skills?.matched ?? []).map((s) => (
                  <Badge key={s} tone="success">{s}</Badge>
                ))}
                {(report.fit.technical_skills?.missing ?? []).map((s) => (
                  <Badge key={s} tone="danger">missing: {s}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(report.ammo?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <Zap size={16} className="text-gold" /> Talking points
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {report.ammo?.map((a, i) => (
              <div key={i} className="flex gap-2.5 text-[14px] text-text-2">
                <span className="font-mono text-[12px] text-accent-ink">{i + 1}</span>
                {a}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={sections[0]?.key}>
        <TabsList className="flex-wrap">
          {sections.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>{s.title}</TabsTrigger>
          ))}
        </TabsList>
        {sections.map((s) => (
          <TabsContent key={s.key} value={s.key}>
            <Card>
              <CardContent className="grid gap-3 pt-5">
                <p className="text-[14.5px] leading-relaxed text-text-2">{s.body}</p>
                {(s.bullets?.length ?? 0) > 0 && (
                  <ul className="grid gap-1.5">
                    {s.bullets?.map((b) => (
                      <li key={b} className="flex items-center gap-2 text-[13.5px] text-text-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" /> {b}
                      </li>
                    ))}
                  </ul>
                )}
                {(s.sources?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
                    <span className="font-mono text-[10.5px] uppercase tracking-wide text-text-3">Sources:</span>
                    {s.sources.map((src, i) => (
                      <SourceChip key={`${src.label}-${i}`} label={src.label} url={src.url} ok={src.ok} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <DevInspector json={report} title="Developer · view research report (JSON)" />
    </div>
  );
}
