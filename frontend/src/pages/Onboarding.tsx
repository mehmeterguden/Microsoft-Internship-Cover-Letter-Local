import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown } from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/data";
import { StatDot } from "@/components/ui/feedback";

/* ── State model ─────────────────────────────────────────────────
   "Add CV" is a four-step flow. Backend wiring is deferred, so the flow
   is driven entirely by local state: the in-content CTAs advance it, and a
   "PREVIEW STATE" switcher (in the page header, like Home.tsx) lets every
   variant be inspected on its own. The design's placeholder data is used
   verbatim. When wired up, `state` derives from the real parse pipeline. */
type OnbState = "upload" | "parse" | "review" | "ready";

const STATE_OPTIONS: { value: OnbState; label: string; desc: string }[] = [
  { value: "upload", label: "Upload", desc: "Drop a CV to begin" },
  { value: "parse", label: "Parsing", desc: "Reading it on-device" },
  { value: "review", label: "Review", desc: "Check parsed sections" },
  { value: "ready", label: "Done", desc: "Profile saved" },
];

const RAIL_STEPS = [{ label: "Upload" }, { label: "Parse" }, { label: "Review" }, { label: "Done" }];
const STEP_INDEX: Record<OnbState, number> = { upload: 0, parse: 1, review: 2, ready: 3 };

/* ── Page ────────────────────────────────────────────────────────── */
export function Onboarding() {
  const [state, setState] = useState<OnbState>("upload");

  return (
    <Page
      eyebrow="SETUP / ADD CV"
      title="Add your CV"
      actions={
        <>
          <StateSwitcher state={state} onPick={setState} />
          <Link
            to="/"
            className="rounded-[9px] border border-border-strong bg-transparent px-4 py-[9px] text-[13px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
          >
            Skip for now
          </Link>
        </>
      }
      bodyClassName="px-7 py-7"
    >
      <div className="mx-auto flex w-full max-w-[860px] flex-col">
        <Stepper steps={RAIL_STEPS} current={STEP_INDEX[state]} className="mb-7" />

        {state === "upload" ? <UploadState onChoose={() => setState("parse")} /> : null}
        {state === "parse" ? <ParseState onContinue={() => setState("review")} /> : null}
        {state === "review" ? (
          <ReviewState onReset={() => setState("upload")} onSave={() => setState("ready")} />
        ) : null}
        {state === "ready" ? <ReadyState /> : null}
      </div>
    </Page>
  );
}

/* ── State 1 · Upload ────────────────────────────────────────────── */
function UploadState({ onChoose }: { onChoose: () => void }) {
  return (
    <div className="cll-fade flex flex-col items-center py-[18px] text-center">
      <div
        onClick={onChoose}
        className="w-full max-w-[560px] cursor-pointer rounded-[18px] border-[1.5px] border-dashed border-border-strong px-10 py-11 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent"
        style={{
          background:
            "radial-gradient(130% 120% at 50% -10%, var(--accent-weak), transparent 58%), var(--input)",
        }}
      >
        <div
          className="mx-auto mb-[18px] flex h-[62px] w-[62px] items-center justify-center rounded-[17px]"
          style={{ background: "var(--accent-grad)", boxShadow: "0 14px 32px -8px var(--accent-shadow)" }}
        >
          <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 4h7l4 4v12H7z" />
            <path d="M14 4v4h4" />
            <path d="M12 11v6M9 14l3-3 3 3" />
          </svg>
        </div>
        <div className="text-[18px] font-bold tracking-[-0.3px] text-fg">Drop your CV to get started</div>
        <div className="mt-2 text-[13px] leading-[1.55] text-fg-mid">
          or click to browse — it's read right here on your device,
          <br />
          then turned into a profile you can edit.
        </div>
        <div className="mt-[18px] flex flex-wrap justify-center gap-[7px]">
          {["PDF", "DOCX", "TXT", "Scanned image · OCR"].map((f) => (
            <span
              key={f}
              className="whitespace-nowrap rounded-[8px] border border-border bg-surface-2 px-[11px] py-[5px] font-mono text-[10px] text-fg-mid"
            >
              {f}
            </span>
          ))}
        </div>
        <Button variant="primary" size="lg" className="mt-[22px] rounded-[11px]" onClick={onChoose}>
          Choose file
        </Button>
      </div>

      <div className="mt-[22px] flex flex-wrap justify-center gap-x-[22px] gap-y-2.5">
        <TrustItem label="Parsed on-device">
          <rect x="5" y="9" width="10" height="7" rx="1.5" />
          <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
        </TrustItem>
        <TrustItem label="Nothing is uploaded">
          <path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z" />
          <circle cx="10" cy="10" r="2" />
          <path d="M3 3l14 14" />
        </TrustItem>
        <TrustItem label="Everything stays editable">
          <path d="M4 16l1-4 8.5-8.5 3 3L8 15l-4 1z" />
        </TrustItem>
      </div>
    </div>
  );
}

function TrustItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[7px] text-[11.5px] text-fg-mid">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--accent-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
      {label}
    </span>
  );
}

/* ── State 2 · Parse (live) ──────────────────────────────────────── */
function ParseState({ onContinue }: { onContinue: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="cll-fade">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* File + extracted counters */}
        <div className="rounded-[12px] border border-border bg-surface p-5">
          <div className="rounded-[11px] border border-dashed border-border-strong bg-input p-[22px] text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[12px] bg-accent-weak">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13V4M6.5 7.5L10 4l3.5 3.5M4 15h12" />
              </svg>
            </div>
            <div className="flex items-center justify-center gap-2 text-[13px] font-semibold text-fg">
              Resume_2025.pdf
              <SuccessCheck />
            </div>
            <div className="mt-[5px] font-mono text-[10px] text-fg-low">214 KB · uploaded</div>
            <div className="mt-3.5 h-1 overflow-hidden rounded-[2px] bg-surface-2">
              <div className="h-full w-full" style={{ background: "var(--accent-grad)" }} />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="font-mono text-[10px] tracking-[0.6px] text-fg-mid">EXTRACTED SO FAR</div>
            <div className="flex flex-wrap gap-2">
              {[
                { n: "4", label: "roles" },
                { n: "12", label: "skills" },
                { n: "3", label: "projects" },
                { n: "2", label: "degrees" },
              ].map((c) => (
                <span
                  key={c.label}
                  className="rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[11.5px] text-fg"
                >
                  <b className="text-accent-text">{c.n}</b> {c.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Streaming JSON */}
        <div className="relative overflow-hidden rounded-[12px] border border-border bg-reading px-5 py-[18px]">
          <div className="absolute right-4 top-3.5 flex items-center gap-1.5 font-mono text-[9.5px] text-accent-text">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--accent)", animation: "cll-pulse 1.3s ease-in-out infinite" }}
            />
            PARSING · {elapsed.toFixed(1)}s
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[12px] leading-[1.75] text-fg-mid">
{`{
  `}
            <span className="text-accent-text">"name"</span>: <span className="text-success">"Jordan Rivera"</span>,{`
  `}
            <span className="text-accent-text">"title"</span>: <span className="text-success">"ML Engineer"</span>,{`
  `}
            <span className="text-accent-text">"skills"</span>: [<span className="text-success">"PyTorch"</span>, <span className="text-success">"Rust"</span>,{`
    `}
            <span className="text-success">"Evaluation"</span>
            <span className="cll-caret" />
          </pre>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={onContinue}>
          Continue to review
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

/* ── State 3 · Review ────────────────────────────────────────────── */
type ReviewCard = {
  title: string;
  status: "ok" | "warn";
  text?: string;
  chips?: string[];
};

const REVIEW_CARDS: ReviewCard[] = [
  { title: "Identity", status: "ok", text: "Jordan Rivera · ML Engineer · SF" },
  { title: "Skills · 12", status: "ok", chips: ["PyTorch", "Rust", "+10"] },
  { title: "Experience · 4", status: "ok", text: "Latent Labs, Corevance, +2" },
  { title: "Education · 2", status: "ok", text: "B.S. CS · UC Berkeley" },
  { title: "Projects · 3", status: "warn", text: "eval-kit, stream-parse · review URLs" },
  { title: "Languages · 5", status: "ok", text: "English, Spanish, +3" },
];

function ReviewState({ onReset, onSave }: { onReset: () => void; onSave: () => void }) {
  return (
    <div className="cll-fade">
      <div className="mb-3.5 text-[13px] text-fg-mid">
        Click any section to review the parsed content and edit it before saving.
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3">
        {REVIEW_CARDS.map((c) => (
          <button
            key={c.title}
            type="button"
            className="rounded-[12px] border border-border bg-surface p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong"
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-fg">{c.title}</span>
              {c.status === "ok" ? <SuccessCheck /> : <WarnMark />}
            </div>
            {c.chips ? (
              <div className="mt-[9px] flex flex-wrap gap-[5px]">
                {c.chips.map((chip) => (
                  <span key={chip} className="rounded-[6px] bg-surface-2 px-2 py-[3px] text-[10.5px] text-fg-mid">
                    {chip}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-[12px] leading-[1.5] text-fg-mid">{c.text}</div>
            )}
          </button>
        ))}
      </div>
      <div className="mt-[18px] flex items-center justify-between">
        <button
          type="button"
          onClick={onReset}
          className="rounded-[10px] border border-border-strong bg-transparent px-[18px] py-[11px] text-[13px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
        >
          Try another file
        </button>
        <Button variant="primary" onClick={onSave}>
          Save to profile
          <SuccessCheckLight />
        </Button>
      </div>
    </div>
  );
}

/* ── State 4 · Ready ─────────────────────────────────────────────── */
function ReadyState() {
  return (
    <div className="cll-fade flex flex-col items-center py-[30px] text-center">
      <div
        className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full"
        style={{
          background: "conic-gradient(var(--accent) 0 100%, var(--border) 0)",
          boxShadow: "0 0 30px -6px var(--accent-shadow)",
        }}
      >
        <div className="absolute inset-[6px] rounded-full bg-bg" />
        <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative" aria-hidden="true">
          <path d="M4 10l4 4 8-9" />
        </svg>
      </div>
      <div className="mt-[18px] text-[21px] font-bold tracking-[-0.4px] text-fg">Your profile is ready</div>
      <div className="mt-2.5 max-w-[460px] text-[13.5px] leading-[1.65] text-fg-mid">
        Imported 4 roles, 12 skills, 3 projects and 2 degrees. You can refine anything from your profile, or
        jump straight into writing.
      </div>
      <div className="mt-[22px] flex gap-2.5">
        <Button asChild variant="outline">
          <Link to="/profile">Go to profile</Link>
        </Button>
        <Button asChild variant="primary">
          <Link to="/write">Write a letter</Link>
        </Button>
      </div>
    </div>
  );
}

/* ── Preview-state switcher (mirrors Home.tsx) ───────────────────── */
function StateSwitcher({ state, onPick }: { state: OnbState; onPick: (s: OnbState) => void }) {
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

/* ── Local glyphs (inline SVG for 1:1 fidelity with the design) ──── */
function SuccessCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10l4 4 8-9" />
    </svg>
  );
}

function WarnMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 4v7M10 15v.5" />
    </svg>
  );
}

function SuccessCheckLight() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10l4 4 8-9" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}
