import { useState, type ReactNode } from "react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Pill, StatDot } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

/* ── State model ─────────────────────────────────────────────────
   Backend wiring is deferred; the segmented switcher (from the design)
   drives local state so every variant is viewable. When the backend is
   wired, `state` is derived from real data (no samples / analyzing /
   fingerprint ready) and the switcher becomes a dev-only affordance. */
type VoiceState = "empty" | "learning" | "done";

const STATE_OPTIONS: { value: VoiceState; label: string }[] = [
  { value: "empty", label: "Empty" },
  { value: "learning", label: "Learning" },
  { value: "done", label: "Learned" },
];

/* ── Placeholder data (verbatim from the design) ─────────────────── */
type Letter = {
  id: string;
  card: string;
  type: "PDF" | "DOCX" | "TXT";
  rating: number;
  title: string;
  meta: string;
  body: string;
};

const LETTERS: Letter[] = [
  {
    id: "anthropic",
    card: "Anthropic · 2024",
    type: "PDF",
    rating: 5,
    title: "Anthropic · ML Engineer",
    meta: "2024 · rated 5/5 · 312 words",
    body: `Dear Anthropic Hiring Team,

When I read that this role owns the evaluation pipelines behind your alignment work, it mapped almost exactly onto the two years I spent building reproducible eval harnesses for on-device models — work I still maintain in the open.

In my last role I cut model regression detection from days to minutes by building a lightweight harness that ran on every commit. The same discipline I'd bring to owning your evaluation pipelines.

I'd welcome the chance to walk your team through the approach.

Best,
Jordan Rivera`,
  },
  {
    id: "stripe",
    card: "Stripe · 2023",
    type: "DOCX",
    rating: 4,
    title: "Stripe · Backend Engineer",
    meta: "2023 · rated 4/5 · 280 words",
    body: `Dear Stripe Team,

Your work making money movement programmable is exactly the kind of infrastructure I like to build behind. Over the past two years I've shipped payment-adjacent services that had to be correct first and fast second.

At my last role I owned the reconciliation pipeline that processed millions of events a day, and I cut its tail latency by 40% without loosening a single correctness guarantee.

I'd love to bring that same care to Stripe.

Best,
Jordan Rivera`,
  },
  {
    id: "figma",
    card: "Figma · 2023",
    type: "TXT",
    rating: 3,
    title: "Figma · Product Engineer",
    meta: "2023 · rated 3/5 · 240 words",
    body: `Dear Figma Team,

I've spent years on the seam between design and engineering, and Figma is where that seam basically disappears. I want to work on tools that make good work feel effortless.

Recently I built an internal component explorer that cut the time designers spent hunting for the right pattern from minutes to seconds.

I'd be thrilled to do that kind of work at Figma.

Best,
Jordan Rivera`,
  },
];

type Sample = { name: string; meta: string; status: "parsed" | "reading" };
const SAMPLES: Sample[] = [
  { name: "Anthropic_2024.pdf", meta: "312 words · parsed", status: "parsed" },
  { name: "Stripe_2023.docx", meta: "280 words · parsed", status: "parsed" },
  { name: "Figma_2023.txt", meta: "reading…", status: "reading" },
];

type AnalysisStep = { label: string; state: "done" | "running" | "queued" };
const ANALYSIS: AnalysisStep[] = [
  { label: "Tone & register", state: "done" },
  { label: "Structure patterns", state: "done" },
  { label: "Signature phrasing", state: "running" },
  { label: "Vocabulary & avoid-list", state: "queued" },
];

/* ── Inline icons (copied from the design for 1:1 fidelity) ──────── */
function IconCheck({ size = 12, color = "var(--success)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10l4 4 8-9" />
    </svg>
  );
}

function IconSpin({ size = 13, color = "var(--accent)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" style={{ animation: "cll-spin 1s linear infinite" }}>
      <path d="M10 2a8 8 0 1 1-5.6 2.3" />
    </svg>
  );
}

function IconSparkle({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3l1.5 4L16 8l-4.5 1L10 13l-1.5-4L4 8l4.5-1z" />
    </svg>
  );
}

function FileTypeIcon({ type }: { type: Letter["type"] }) {
  if (type === "PDF") {
    return (
      <svg width={13} height={13} viewBox="0 0 20 20" fill="none" stroke="var(--danger)" strokeWidth={1.4}>
        <path d="M6 3h6l3 3v11H5V3z" />
      </svg>
    );
  }
  if (type === "DOCX") {
    return (
      <svg width={13} height={13} viewBox="0 0 20 20" fill="none" stroke="#93c5fd" strokeWidth={1.4}>
        <rect x="4" y="4" width="12" height="12" rx="2" />
        <path d="M8 8h4M8 11h4" />
      </svg>
    );
  }
  return (
    <svg width={13} height={13} viewBox="0 0 20 20" fill="none" stroke="var(--text-mid)" strokeWidth={1.4}>
      <path d="M4 5h12M4 10h12M4 15h8" />
    </svg>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <div className="mt-1.5 text-[12px] tracking-[2px] text-accent">
      <span>{"★".repeat(value)}</span>
      {value < 5 ? <span className="text-fg-low">{"★".repeat(5 - value)}</span> : null}
    </div>
  );
}

/* ── Empty state — teach the AI ──────────────────────────────────── */
function EmptyBody() {
  return (
    <div className="flex min-h-full items-center justify-center p-7">
      <div className="cll-fade w-full max-w-[580px] text-center">
        <div className="mx-auto mb-[18px] flex h-[58px] w-[58px] items-center justify-center rounded-[16px] bg-accent-weak">
          <svg width={26} height={26} viewBox="0 0 20 20" fill="none" stroke="var(--accent-text)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10h1.5M8 5v10M12 3v14M16 8v4" />
          </svg>
        </div>
        <div className="text-[21px] font-bold tracking-[-0.4px] text-fg">Teach the AI how you write</div>
        <p className="mt-[11px] text-[13.5px] leading-[1.7] text-fg-mid">
          Add a few cover letters you've written before. The model studies your real tone, structure, and phrasing —
          then drafts new letters that sound like <span className="text-accent-text">you</span>, not like generic AI.
        </p>

        <button
          type="button"
          className="mt-6 block w-full cursor-pointer rounded-[14px] border border-dashed border-border-strong bg-input p-9 text-center transition-colors hover:border-accent"
        >
          <span className="mx-auto mb-[13px] flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-surface-2">
            <svg width={21} height={21} viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13V4M6.5 7.5L10 4l3.5 3.5M4 15h12" />
            </svg>
          </span>
          <span className="block text-[14px] font-semibold text-fg">Drop past cover letters</span>
          <span className="mt-[5px] block text-[12px] text-fg-low">PDF · DOCX · TXT — or paste text</span>
        </button>

        <div className="mt-4 flex justify-center gap-2.5">
          <Button variant="primary" size="md" type="button">Upload files</Button>
          <Button variant="outline" size="md" type="button">Paste text</Button>
        </div>

        <div className="mt-[18px] inline-flex items-center gap-1.5 text-[11px] text-fg-low">
          <StatDot tone="success" glow size={6} />
          Parsed on-device · nothing is uploaded
        </div>
      </div>
    </div>
  );
}

/* ── Learning state — analyzing progress ─────────────────────────── */
function LearningBody() {
  return (
    <div className="grid min-h-full grid-cols-1 gap-5 px-7 py-[22px] lg:grid-cols-[290px_1fr]">
      <section className="cll-fade flex flex-col gap-2.5">
        <div className="font-mono text-[10px] tracking-[1px] text-fg-low">SAMPLES · 3</div>
        {SAMPLES.map((s) => (
          <div key={s.name} className="flex items-center gap-2.5 rounded-[11px] border border-border bg-surface px-3.5 py-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-accent-weak">
              {s.status === "parsed" ? <IconCheck size={11} /> : <IconSpin size={12} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold text-fg">{s.name}</div>
              <div className={cn("font-mono text-[9px]", s.status === "parsed" ? "text-fg-low" : "text-accent-text")}>{s.meta}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="cll-fade">
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-surface px-6 py-[22px]">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-[60px] h-[200px] w-[200px] rounded-full"
            style={{ background: "var(--glow-1)", filter: "blur(60px)", opacity: 0.35 }}
          />
          <div className="relative flex items-center justify-between">
            <div className="text-[15px] text-fg" style={{ fontWeight: 650 }}>Analyzing your voice</div>
            <span className="font-mono text-[10px] text-accent-text">68%</span>
          </div>
          <div className="relative mt-1.5 h-[5px] overflow-hidden rounded-[3px] bg-input">
            <div className="h-full" style={{ width: "68%", background: "var(--accent-grad)" }} />
          </div>

          <div className="relative mt-5 flex flex-col gap-[13px]">
            {ANALYSIS.map((step) => (
              <div key={step.label} className={cn("flex items-center gap-[11px]", step.state === "queued" && "opacity-50")}>
                <span className={cn("flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px]", step.state === "queued" ? "bg-input" : "bg-accent-weak")}>
                  {step.state === "done" ? (
                    <IconCheck size={12} />
                  ) : step.state === "running" ? (
                    <IconSpin size={13} />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--text-low)" }} />
                  )}
                </span>
                <span className={cn("flex-1 text-[12.5px]", step.state === "queued" ? "text-fg-mid" : "text-fg")}>{step.label}</span>
                <span
                  className={cn(
                    "font-mono text-[9px]",
                    step.state === "done" ? "text-success" : step.state === "running" ? "text-accent-text" : "text-fg-low",
                  )}
                >
                  {step.state === "done" ? "DONE" : step.state === "running" ? "RUNNING" : "QUEUED"}
                </span>
              </div>
            ))}
          </div>

          <div className="relative mt-[18px] border-t border-border pt-3.5 text-[12.5px] leading-[1.7] text-fg-mid">
            You tend to open with a concrete result, keep sentences active, and close by tying your work to the reader's problem
            <span
              className="ml-px inline-block h-3.5 w-[7px] translate-y-0.5 bg-accent"
              style={{ animation: "cll-blink 1.05s step-end infinite" }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Voice fingerprint group (label + tags/lines) ────────────────── */
function FpGroup({ title, danger = false, children }: { title: string; danger?: boolean; children: ReactNode }) {
  return (
    <div>
      <div className={cn("mb-[9px] text-[12px]", danger ? "text-danger" : "text-fg")} style={{ fontWeight: 650 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/* ── Done state — letters list + voice fingerprint ───────────────── */
function DoneBody({ onOpen }: { onOpen: (l: Letter) => void }) {
  return (
    <div className="grid min-h-full grid-cols-1 gap-5 px-7 py-[22px] lg:grid-cols-[290px_1fr]">
      {/* Left — the past letters */}
      <section className="cll-fade flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[1px] text-fg-low">YOUR LETTERS · 6</span>
          <Pill tone="accent" mono className="gap-1 px-[9px] py-[3px] text-[9px]">
            <IconSparkle /> DEEP
          </Pill>
        </div>

        {LETTERS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onOpen(l)}
            className="rounded-[11px] border border-border bg-surface px-[15px] py-[13px] text-left transition-colors hover:border-border-strong"
          >
            <div className="flex items-center gap-2">
              <FileTypeIcon type={l.type} />
              <span className="text-[13px] font-semibold text-fg">{l.card}</span>
              <span className="ml-auto font-mono text-[9px] text-fg-low">{l.type}</span>
            </div>
            <Stars value={l.rating} />
          </button>
        ))}

        <button
          type="button"
          className="rounded-[11px] border border-dashed border-border-strong bg-transparent px-3 py-3 text-[12.5px] text-accent-text transition-colors hover:border-accent"
        >
          + Add a past letter
        </button>
      </section>

      {/* Right — the learned fingerprint */}
      <section className="cll-fade">
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-surface px-6 py-[22px]">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-[60px] h-[200px] w-[200px] rounded-full"
            style={{ background: "var(--glow-1)", filter: "blur(60px)", opacity: 0.32 }}
          />

          <div className="relative flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[1px] text-accent-text">VOICE FINGERPRINT</span>
            <Pill tone="accent" mono className="gap-1 px-[9px] py-[3px] text-[9px]">
              <IconSparkle /> DEEP ANALYSIS · 6 letters
            </Pill>
          </div>

          <div className="relative mt-3 max-w-[560px] text-[20px] leading-[1.35] tracking-[-0.3px] text-fg" style={{ fontWeight: 680 }}>
            Evidence-led, quietly confident, reader-first
          </div>
          <p className="relative mt-2 max-w-[560px] text-[13px] leading-[1.65] text-fg-mid">
            You open with a concrete result, connect it to the reader's problem, and close without hedging. You persuade with
            specifics, not adjectives.
          </p>

          {/* tone / structure / pace */}
          <div className="relative mt-5 grid grid-cols-3 gap-2.5">
            {[
              { k: "TONE", v: "Warm · confident" },
              { k: "STRUCTURE", v: "Hook → proof → fit" },
              { k: "PACE", v: "Brisk · varied" },
            ].map((s) => (
              <div key={s.k} className="rounded-[10px] bg-surface-2 p-3">
                <div className="font-mono text-[9px] text-fg-low">{s.k}</div>
                <div className="mt-[5px] text-[13px] font-semibold text-fg">{s.v}</div>
              </div>
            ))}
          </div>

          {/* formality meter */}
          <div className="relative mt-4">
            <div className="mb-1.5 flex justify-between font-mono text-[9px] text-fg-low">
              <span>FORMALITY</span>
              <span>Casual ↔ Formal</span>
            </div>
            <div className="relative h-1.5 rounded-[3px] bg-input">
              <div className="absolute bottom-0 left-0 top-0 rounded-[3px]" style={{ width: "58%", background: "var(--accent-grad)" }} />
              <div
                className="absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                style={{ left: "58%", boxShadow: "0 2px 6px rgba(0,0,0,.5)" }}
              />
            </div>
          </div>

          {/* strengths / themes / phrases / vocabulary / moves / open+close */}
          <div className="relative mt-5 grid grid-cols-1 gap-x-[22px] gap-y-[18px] sm:grid-cols-2">
            <FpGroup title="Strengths">
              <div className="flex flex-wrap gap-1.5">
                {["Specific metrics", "Active voice", "Reader-focused openings"].map((t) => (
                  <span key={t} className="rounded-[7px] bg-accent-weak px-2.5 py-[5px] text-[11px] text-accent-text">{t}</span>
                ))}
              </div>
            </FpGroup>

            <FpGroup title="Recurring themes">
              <div className="flex flex-wrap gap-1.5">
                {["Reliability", "Craft", "Ownership"].map((t) => (
                  <span key={t} className="rounded-[7px] border border-border bg-surface-2 px-2.5 py-[5px] text-[11px] text-fg-mid">{t}</span>
                ))}
              </div>
            </FpGroup>

            <FpGroup title="Signature phrases">
              <div className="flex flex-col gap-[5px] text-[12px] italic leading-[1.5] text-fg-mid">
                <span>"mapped almost exactly onto…"</span>
                <span>"the same discipline I'd bring…"</span>
                <span>"correct first and fast second"</span>
              </div>
            </FpGroup>

            <FpGroup title="Vocabulary">
              <div className="flex flex-wrap gap-1.5">
                {["reproducible", "harness", "discipline", "own"].map((t) => (
                  <span key={t} className="rounded-[6px] bg-surface-2 px-[9px] py-1 font-mono text-[10px] text-fg-mid">{t}</span>
                ))}
              </div>
            </FpGroup>

            <FpGroup title="Rhetorical moves">
              <div className="flex flex-col gap-[5px] text-[12px] leading-[1.5] text-fg-mid">
                <span>· Lead with a measurable outcome</span>
                <span>· Mirror the company's own language</span>
                <span>· Under-claim, over-evidence</span>
              </div>
            </FpGroup>

            <FpGroup title="Opening & closing">
              <div className="flex flex-col gap-[5px] text-[12px] leading-[1.5] text-fg-mid">
                <span>
                  <b className="font-semibold text-fg">Open:</b> reacts to a specific detail of the role
                </span>
                <span>
                  <b className="font-semibold text-fg">Close:</b> short, forward-looking, no filler
                </span>
              </div>
            </FpGroup>
          </div>

          {/* example sentences */}
          <div className="relative mt-5">
            <div className="mb-[9px] text-[12px] text-fg" style={{ fontWeight: 650 }}>Example sentences</div>
            <div className="flex flex-col gap-2">
              {[
                "\"I cut model regression detection from days to minutes by building a harness that ran on every commit.\"",
                "\"Correct first and fast second — I cut tail latency 40% without loosening a guarantee.\"",
              ].map((s) => (
                <div key={s} className="rounded-[10px] border border-border bg-reading px-[13px] py-[11px] text-[12.5px] italic leading-[1.6] text-reading-ink">
                  {s}
                </div>
              ))}
            </div>
          </div>

          {/* avoids + local metrics */}
          <div className="relative mt-5 grid grid-cols-1 gap-x-[22px] gap-y-[18px] sm:grid-cols-2">
            <FpGroup title="Avoids" danger>
              <div className="flex flex-wrap gap-1.5">
                {["\"I am writing to…\"", "\"passionate\"", "\"team player\"", "exclamation marks"].map((t) => (
                  <span key={t} className="rounded-[6px] px-[9px] py-1 text-[11px] text-danger" style={{ background: "rgba(251,113,133,.1)" }}>
                    {t}
                  </span>
                ))}
              </div>
            </FpGroup>

            <FpGroup title="Local metrics">
              <div className="flex flex-col gap-1.5 text-[11.5px] text-fg-mid">
                {[
                  { k: "Avg length", v: "277 words" },
                  { k: "Sentence length", v: "18 words · varied" },
                  { k: "First-person", v: "balanced I / you" },
                ].map((m) => (
                  <div key={m.k} className="flex justify-between">
                    <span>{m.k}</span>
                    <span className="font-mono text-fg">{m.v}</span>
                  </div>
                ))}
              </div>
            </FpGroup>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Letter reader modal ─────────────────────────────────────────── */
function LetterModal({ letter, onClose }: { letter: Letter; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(3,7,14,.62)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", animation: "cll-backdrop .2s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[84%] w-[560px] max-w-[92%] flex-col overflow-hidden rounded-[16px] border border-border-strong bg-surface"
        style={{ boxShadow: "0 40px 100px -30px rgba(0,0,0,.85)", animation: "cll-modal .32s cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="flex items-center justify-between border-b border-border px-[22px] py-[18px]">
          <div>
            <div className="text-[15px] text-fg" style={{ fontWeight: 650 }}>{letter.title}</div>
            <div className="mt-[3px] font-mono text-[10px] text-fg-mid">{letter.meta}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] border border-border bg-transparent text-fg-mid transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <svg width={14} height={14} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <path d="M6 6l8 8M14 6l-8 8" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-reading px-[26px] py-6">
          <div className="max-w-[520px] whitespace-pre-wrap text-[14px] leading-[1.85] text-reading-ink">{letter.body}</div>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-surface-2 px-[22px] py-3.5">
          <span className="text-[11px] text-fg-low">Used as a style reference — never copied verbatim.</span>
          <Button variant="primary" size="sm" type="button" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

/* ── Header actions — state switcher + add ───────────────────────── */
function HeaderActions({ state, onState }: { state: VoiceState; onState: (s: VoiceState) => void }) {
  return (
    <>
      <Segmented options={STATE_OPTIONS} value={state} onChange={onState} />
      <Button variant="primary" size="md" type="button">
        <svg width={14} height={14} viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round">
          <path d="M10 4v12M4 10h12" />
        </svg>
        Add a letter
      </Button>
    </>
  );
}

export function Voice() {
  const [state, setState] = useState<VoiceState>("done");
  const [openLetter, setOpenLetter] = useState<Letter | null>(null);

  return (
    <Page
      eyebrow="SETUP / WRITING VOICE"
      title="Writing Voice"
      actions={<HeaderActions state={state} onState={setState} />}
      bodyClassName="p-0"
    >
      {state === "empty" ? <EmptyBody /> : state === "learning" ? <LearningBody /> : <DoneBody onOpen={setOpenLetter} />}
      {openLetter ? <LetterModal letter={openLetter} onClose={() => setOpenLetter(null)} /> : null}
    </Page>
  );
}
