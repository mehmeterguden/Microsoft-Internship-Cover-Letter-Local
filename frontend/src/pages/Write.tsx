import { useState } from "react";
import { Check, CircleDot, Info, ShieldCheck, Sparkles, X } from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import { Segmented, Slider, Toggle } from "@/components/ui/controls";
import { ScoreRing, SourceChip } from "@/components/ui/data";

/* ── Tone options (from the design's tone cards) ─────────────────── */
type Tone = "professional" | "warm" | "confident" | "concise";

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "warm", label: "Warm" },
  { value: "confident", label: "Confident" },
  { value: "concise", label: "Concise" },
];

/* Map the length slider (0–100) onto an approximate target word count. */
function wordsFor(pct: number): number {
  return Math.round(180 + (pct / 100) * 280);
}

export function Write() {
  // Backend wiring is deferred — everything here is local UI state.
  const [company, setCompany] = useState("Anthropic");
  const [role, setRole] = useState("ML Engineer");
  const [jobPosting, setJobPosting] = useState("");
  const [tone, setTone] = useState<Tone>("warm");
  const [lengthPct, setLengthPct] = useState(50);
  const [grounded, setGrounded] = useState(true);

  const words = wordsFor(lengthPct);
  const lengthLabel = lengthPct < 34 ? "Brief" : lengthPct > 66 ? "Detailed" : "Standard";

  return (
    <Page
      eyebrow="GENERATE / WRITE LETTER"
      title="Write letter"
      subtitle="A grounded first draft in your voice — every claim traced back to a source."
      actions={
        <>
          <Button variant="outline" size="md">Save draft</Button>
          <Button variant="primary" size="md">Regenerate</Button>
        </>
      }
      bodyClassName="px-7 py-5"
    >
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ── Left column: inputs ──────────────────────────────── */}
        <div className="cll-fade flex min-w-0 flex-col gap-4">
          <section className="rounded-[14px] border border-border bg-surface p-5">
            <div className="text-[15px] font-semibold text-fg">What are you applying to?</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-mid">
              Fill in the details and I&apos;ll ground the draft in your profile.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Company">
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
              </Field>
              <Field label="Role">
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="ML Engineer" />
              </Field>
            </div>

            <div className="mt-3">
              <Field
                label={
                  <>
                    Job posting <span className="text-fg-low">· optional</span>
                  </>
                }
              >
                <Textarea
                  value={jobPosting}
                  onChange={(e) => setJobPosting(e.target.value)}
                  placeholder="Paste the full description for a sharper draft…"
                  className="min-h-[92px]"
                />
              </Field>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5">
            <Field label="Tone">
              <Segmented options={TONES} value={tone} onChange={setTone} />
            </Field>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Length</Label>
                <span className="font-mono text-[10px] tracking-[0.3px] text-accent-text">
                  {lengthLabel} · ~{words} words
                </span>
              </div>
              <Slider value={lengthPct} min={0} max={100} onChange={setLengthPct} aria-label="Letter length" />
              <div className="flex justify-between font-mono text-[9.5px] uppercase tracking-[0.6px] text-fg-low">
                <span>Brief</span>
                <span>Detailed</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-[11px] border border-border bg-surface-2 px-3.5 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-fg">Ground every claim in my profile</div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-fg-mid">
                  Only write claims traceable to your CV, GitHub or research.
                </p>
              </div>
              <Toggle checked={grounded} onChange={setGrounded} aria-label="Ground every claim in my profile" />
            </div>
          </section>
        </div>

        {/* ── Right column: streaming letter (top) + groundedness (below) ── */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Streaming reading pane */}
          <section className="cll-fade relative flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-reading">
            <div className="relative flex-1 overflow-auto p-7 sm:px-8">
              {/* STREAMING pill */}
              <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-border bg-input px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.8px] text-accent-text">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                  style={{ animation: "cll-pulse 1.3s ease-in-out infinite" }}
                />
                Streaming
              </div>

              <div className="max-w-[600px] text-[15px] leading-[1.85] text-reading-ink">
                <p className="mb-3.5">Dear {company || "Anthropic"} Hiring Team,</p>
                <p className="mb-3.5">
                  When I read that this role owns the evaluation pipelines behind your alignment work, it mapped
                  almost exactly onto the two years I spent building reproducible eval harnesses for on-device
                  models — work I still maintain in the open.
                </p>
                <p className="mb-0">
                  That instinct for making evaluation legible and repeatable is exactly what I&apos;d bring to
                  <span className="cll-caret" aria-hidden />
                </p>
              </div>

              <div className="mt-[18px] flex items-center gap-1.5 border-t border-border pt-3.5 text-[10.5px] text-fg-low">
                <Info size={12} strokeWidth={1.6} />
                AI-generated — review before sending
              </div>
            </div>
          </section>

          {/* Groundedness check */}
          <section className="cll-fade rounded-[14px] border border-border bg-surface p-[18px]">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                <ShieldCheck size={16} strokeWidth={1.6} className="text-success" />
                Groundedness
              </div>
              <ScoreRing value={78} size={44} thickness={5} />
            </div>

            <div className="flex flex-col gap-2">
              {/* Supported claim */}
              <div className="flex items-center gap-2.5 text-[12px]">
                <Check size={14} strokeWidth={2.4} className="shrink-0 text-success" />
                <span className="flex-1 text-fg">Reproducible eval harnesses</span>
                <SourceChip label="CV · L12" tone="accent" />
              </div>

              {/* Partially supported claim */}
              <div className="flex items-center gap-2.5 text-[12px]">
                <CircleDot size={14} strokeWidth={2} className="shrink-0 text-warning" />
                <span className="flex-1 text-fg">Regression to minutes</span>
                <SourceChip label="GH" tone="accent" />
              </div>

              {/* Unsupported claim — needs a source */}
              <div
                className="-mx-2 flex items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-[12px]"
                style={{ background: "rgba(251,113,133,0.08)", boxShadow: "inset 2px 0 0 var(--danger)" }}
              >
                <X size={14} strokeWidth={2.4} className="shrink-0 text-danger" />
                <span className="flex-1 text-fg-mid">Led a team of five</span>
                <SourceChip label="none" tone="warning" />
              </div>
            </div>

            <button
              type="button"
              className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[9px] border border-accent bg-accent-weak px-3 py-2.5 text-[12px] font-semibold text-accent-text transition-[filter] hover:brightness-110"
            >
              <Sparkles size={13} strokeWidth={1.6} />
              Fix unsupported with AI
            </button>
          </section>
        </div>
      </div>
    </Page>
  );
}
