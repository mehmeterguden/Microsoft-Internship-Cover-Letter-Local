import { useCallback, useRef, useState, type ReactNode } from "react";
import { Plus, RotateCw, Trash2, Upload } from "lucide-react";
import { Page } from "@/components/common/Page";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Pill, ProgressBar, StatDot } from "@/components/ui/feedback";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAsync } from "@/lib/useAsync";
import { toast } from "@/store/toast";
import { errorMessage } from "@/api/client";
import {
  createPastLetter,
  deletePastLetter,
  getStyle,
  learnVoice,
  listPastLetters,
  updatePastLetter,
  type StyleState,
} from "@/api/style";
import type { PastCoverLetter, VoiceProfile } from "@/api/types";
import { SetupIntro } from "@/components/setup/SetupScaffold";
import { cn } from "@/lib/utils";

const EYEBROW = "Setup / Writing Voice";
const TITLE = "Writing Voice";

/* ── Small text helpers over raw letter content ──────────────────── */
function wordCount(text: string): number {
  return (text.match(/\b[\w']+\b/g) ?? []).length;
}

/** First non-empty line, truncated — used as a human label for a sample. */
function previewLabel(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.length > 34 ? `${line.slice(0, 34).trimEnd()}…` : line;
}

/** Map a free-text formality descriptor onto the 0–100 meter position. */
function formalityPercent(f: string): number {
  const s = f.toLowerCase();
  if (s.includes("very formal")) return 88;
  if (s.includes("formal")) return 78;
  if (s.includes("professional")) return 66;
  if (s.includes("semi") || s.includes("balanced") || s.includes("neutral") || s.includes("moderate")) return 54;
  if (s.includes("conversational") || s.includes("warm") || s.includes("friendly")) return 40;
  if (s.includes("casual") || s.includes("informal") || s.includes("relaxed")) return 26;
  return 52;
}

/* ── Inline icons (kept from the original design for 1:1 fidelity) ── */
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

function DocIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 20 20" fill="none" stroke="var(--text-mid)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M6 3h6l3 3v11H5V3z" />
      <path d="M8 10h4M8 13h3" />
    </svg>
  );
}

/* ── Editable star rating ────────────────────────────────────────── */
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5 tracking-[1px]" role="group" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} of 5`}
          aria-pressed={n <= value}
          onClick={(e) => {
            e.stopPropagation();
            onChange(n);
          }}
          className={cn(
            "text-[13px] leading-none outline-none transition-colors focus-visible:text-accent",
            n <= value ? "text-accent" : "text-fg-low hover:text-fg-mid",
          )}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/* ── One sample in the left list (open / rate / delete) ──────────── */
function LetterCard({
  letter,
  index,
  onOpen,
  onRate,
  onDelete,
}: {
  letter: PastCoverLetter;
  index: number;
  onOpen: (l: PastCoverLetter) => void;
  onRate: (l: PastCoverLetter, rating: number) => void;
  onDelete: (l: PastCoverLetter) => void;
}) {
  const words = wordCount(letter.content);
  const label = previewLabel(letter.content) || `Letter ${index + 1}`;
  return (
    <div className="group rounded-[11px] border border-border bg-surface px-[15px] py-[13px] transition-colors hover:border-border-strong">
      <button
        type="button"
        onClick={() => onOpen(letter)}
        className="flex w-full items-center gap-2 text-left outline-none focus-visible:text-accent-text"
      >
        <DocIcon />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{label}</span>
        <span className="shrink-0 font-mono text-[9px] text-fg-low">{words}w</span>
      </button>
      <div className="mt-2 flex items-center justify-between">
        <StarRating value={letter.user_rating ?? 0} onChange={(v) => onRate(letter, v)} />
        <button
          type="button"
          aria-label="Remove letter"
          onClick={() => onDelete(letter)}
          className="rounded-[6px] p-1 text-fg-low opacity-0 outline-none transition-[opacity,color] hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/* ── Fingerprint group (label + tags/lines) ──────────────────────── */
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

/* ── The learned voice fingerprint (real VoiceProfile) ───────────── */
function Fingerprint({ profile, letterCount }: { profile: VoiceProfile; letterCount: number }) {
  const deep = !!profile.llm_analyzed;

  const stats: { k: string; v: string }[] = [
    profile.tone ? { k: "Tone", v: profile.tone } : null,
    profile.structure ? { k: "Structure", v: profile.structure } : null,
    profile.sentence_patterns ? { k: "Sentences", v: profile.sentence_patterns } : null,
  ].filter((s): s is { k: string; v: string } => s !== null);

  const metrics: { k: string; v: string }[] = [
    profile.word_count != null ? { k: "Avg length", v: `${profile.word_count} words` } : null,
    profile.sentence_style ? { k: "Sentence style", v: profile.sentence_style } : null,
    profile.pronoun_style ? { k: "First-person", v: profile.pronoun_style } : null,
  ].filter((m): m is { k: string; v: string } => m !== null);

  const heading = profile.tagline || (deep ? "Your writing voice" : "Quick voice snapshot");

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-surface px-6 py-[22px]">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-[60px] h-[200px] w-[200px] rounded-full"
        style={{ background: "var(--glow-1)", filter: "blur(60px)", opacity: 0.32 }}
      />

      <div className="relative flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-semibold tracking-[0.01em] text-accent-text">Voice fingerprint</span>
        <Pill tone={deep ? "accent" : "neutral"} className="gap-1 whitespace-nowrap px-[9px] py-[3px] text-[10.5px] font-semibold">
          <IconSparkle /> {deep ? `Deep analysis · ${letterCount} letter${letterCount === 1 ? "" : "s"}` : "Local metrics"}
        </Pill>
      </div>

      {profile.enough_signal === false ? (
        <div className="relative mt-3 rounded-[10px] border border-warning-weak bg-warning-weak px-3.5 py-2.5 text-[12px] leading-[1.55] text-warning">
          Not enough signal yet — add another letter or two so the analysis has more of your writing to learn from.
        </div>
      ) : null}

      <div className="relative mt-3 max-w-[560px] text-[20px] leading-[1.35] tracking-[-0.3px] text-fg" style={{ fontWeight: 680 }}>
        {heading}
      </div>
      {profile.summary ? (
        <p className="relative mt-2 max-w-[560px] text-[13px] leading-[1.65] text-fg-mid">{profile.summary}</p>
      ) : null}
      {profile.self_presentation ? (
        <p className="relative mt-2 max-w-[560px] text-[12.5px] leading-[1.6] text-fg-low">{profile.self_presentation}</p>
      ) : null}

      {/* tone / structure / sentences */}
      {stats.length > 0 ? (
        <div
          className="relative mt-5 grid gap-2.5"
          style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
        >
          {stats.map((s) => (
            <div key={s.k} className="rounded-[10px] bg-surface-2 p-3">
              <div className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">{s.k}</div>
              <div className="mt-[5px] text-[13px] font-semibold text-fg first-letter:uppercase">{s.v}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* formality meter */}
      {profile.formality ? (
        <div className="relative mt-4">
          <div className="mb-1.5 flex justify-between text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">
            <span>Formality · {profile.formality}</span>
            <span>Casual ↔ Formal</span>
          </div>
          <div className="relative h-1.5 rounded-[3px] bg-input">
            <div
              className="absolute bottom-0 left-0 top-0 rounded-[3px]"
              style={{ width: `${formalityPercent(profile.formality)}%`, background: "var(--accent-grad)" }}
            />
            <div
              className="absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
              style={{ left: `${formalityPercent(profile.formality)}%`, boxShadow: "0 2px 6px rgba(0,0,0,.5)" }}
            />
          </div>
        </div>
      ) : null}

      {/* strengths / themes / phrases / vocabulary / moves / open+close / emphasis */}
      <div className="relative mt-5 grid grid-cols-1 gap-x-[22px] gap-y-[18px] sm:grid-cols-2">
        {profile.strengths?.length ? (
          <FpGroup title="Strengths">
            <div className="flex flex-wrap gap-1.5">
              {profile.strengths.map((t) => (
                <span key={t} className="rounded-[7px] bg-accent-weak px-2.5 py-[5px] text-[11px] text-accent-text">{t}</span>
              ))}
            </div>
          </FpGroup>
        ) : null}

        {profile.themes?.length ? (
          <FpGroup title="Recurring themes">
            <div className="flex flex-wrap gap-1.5">
              {profile.themes.map((t) => (
                <span key={t} className="rounded-[7px] border border-border bg-surface-2 px-2.5 py-[5px] text-[11px] text-fg-mid">{t}</span>
              ))}
            </div>
          </FpGroup>
        ) : null}

        {profile.signature_phrases?.length ? (
          <FpGroup title="Signature phrases">
            <div className="flex flex-col gap-[5px] text-[12px] italic leading-[1.5] text-fg-mid">
              {profile.signature_phrases.map((p) => (
                <span key={p}>&ldquo;{p}&rdquo;</span>
              ))}
            </div>
          </FpGroup>
        ) : null}

        {profile.vocabulary?.length ? (
          <FpGroup title="Vocabulary">
            <div className="flex flex-wrap gap-1.5">
              {profile.vocabulary.map((t) => (
                <span key={t} className="rounded-[6px] bg-surface-2 px-[9px] py-1 font-mono text-[10px] text-fg-mid">{t}</span>
              ))}
            </div>
          </FpGroup>
        ) : null}

        {profile.rhetorical_moves ? (
          <FpGroup title="Rhetorical moves">
            <p className="text-[12px] leading-[1.55] text-fg-mid">{profile.rhetorical_moves}</p>
          </FpGroup>
        ) : null}

        {profile.opening_habits || profile.closing_habits ? (
          <FpGroup title="Opening & closing">
            <div className="flex flex-col gap-[5px] text-[12px] leading-[1.5] text-fg-mid">
              {profile.opening_habits ? (
                <span>
                  <b className="font-semibold text-fg">Open:</b> {profile.opening_habits}
                </span>
              ) : null}
              {profile.closing_habits ? (
                <span>
                  <b className="font-semibold text-fg">Close:</b> {profile.closing_habits}
                </span>
              ) : null}
            </div>
          </FpGroup>
        ) : null}

        {profile.emphasis?.length ? (
          <FpGroup title="Emphasizes">
            <div className="flex flex-wrap gap-1.5">
              {profile.emphasis.map((t) => (
                <span key={t} className="rounded-[7px] border border-border bg-surface-2 px-2.5 py-[5px] text-[11px] text-fg-mid">{t}</span>
              ))}
            </div>
          </FpGroup>
        ) : null}
      </div>

      {/* example sentences */}
      {profile.example_sentences?.length ? (
        <div className="relative mt-5">
          <div className="mb-[9px] text-[12px] text-fg" style={{ fontWeight: 650 }}>Example sentences</div>
          <div className="flex flex-col gap-2">
            {profile.example_sentences.map((s) => (
              <div key={s} className="rounded-[10px] border border-border bg-reading px-[13px] py-[11px] text-[12.5px] italic leading-[1.6] text-reading-ink">
                &ldquo;{s}&rdquo;
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* avoids + local metrics */}
      {(profile.avoid?.length || metrics.length) ? (
        <div className="relative mt-5 grid grid-cols-1 gap-x-[22px] gap-y-[18px] sm:grid-cols-2">
          {profile.avoid?.length ? (
            <FpGroup title="Avoids" danger>
              <div className="flex flex-wrap gap-1.5">
                {profile.avoid.map((t) => (
                  <span key={t} className="rounded-[6px] bg-danger-weak px-[9px] py-1 text-[11px] text-danger">{t}</span>
                ))}
              </div>
            </FpGroup>
          ) : null}

          {metrics.length ? (
            <FpGroup title="Local metrics">
              <div className="flex flex-col gap-1.5 text-[11.5px] text-fg-mid">
                {metrics.map((m) => (
                  <div key={m.k} className="flex justify-between gap-3">
                    <span>{m.k}</span>
                    <span className="font-mono text-right text-fg">{m.v}</span>
                  </div>
                ))}
              </div>
            </FpGroup>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── Right panel when there are samples but no learned profile ───── */
function NotLearnedPanel({ count, analyzing, onLearn }: { count: number; analyzing: boolean; onLearn: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-surface px-6 py-[22px]">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-[60px] h-[200px] w-[200px] rounded-full"
        style={{ background: "var(--glow-1)", filter: "blur(60px)", opacity: 0.28 }}
      />
      <span className="relative text-[10.5px] font-semibold tracking-[0.01em] text-accent-text">Voice fingerprint</span>
      <div className="relative mt-3 text-[19px] tracking-[-0.3px] text-fg" style={{ fontWeight: 680 }}>Not learned yet</div>
      <p className="relative mt-2 max-w-[440px] text-[13px] leading-[1.65] text-fg-mid">
        You&rsquo;ve added {count} letter{count === 1 ? "" : "s"}. Analyze them to build your voice fingerprint — the model
        studies your tone, structure, and phrasing.
      </p>
      <div className="relative mt-5">
        <Button variant="primary" size="md" onClick={onLearn} loading={analyzing}>
          <IconSparkle /> Learn my voice
        </Button>
      </div>
    </div>
  );
}

/* ── Learned/loaded state — letters list + fingerprint ───────────── */
function DoneBody({
  letters,
  profile,
  analyzing,
  onOpen,
  onRate,
  onDelete,
  onAdd,
  onLearn,
}: {
  letters: PastCoverLetter[];
  profile: VoiceProfile | null;
  analyzing: boolean;
  onOpen: (l: PastCoverLetter) => void;
  onRate: (l: PastCoverLetter, rating: number) => void;
  onDelete: (l: PastCoverLetter) => void;
  onAdd: () => void;
  onLearn: () => void;
}) {
  return (
    <div className="grid min-h-full grid-cols-1 gap-5 px-7 py-[22px] lg:grid-cols-[290px_1fr]">
      {/* Left — the past letters */}
      <section className="cll-fade flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Your letters · {letters.length}</span>
          {profile?.llm_analyzed ? (
            <Pill tone="accent" className="gap-1 px-[9px] py-[3px] text-[10.5px] font-semibold">
              <IconSparkle /> Deep
            </Pill>
          ) : null}
        </div>

        {letters.map((l, i) => (
          <LetterCard key={l.id ?? i} letter={l} index={i} onOpen={onOpen} onRate={onRate} onDelete={onDelete} />
        ))}

        <button
          type="button"
          onClick={onAdd}
          className="rounded-[11px] border border-dashed border-border-strong bg-transparent px-3 py-3 text-[12.5px] text-accent-text outline-none transition-colors hover:border-accent focus-visible:border-accent"
        >
          + Add a past letter
        </button>
      </section>

      {/* Right — the learned fingerprint (or a prompt to learn) */}
      <section className="cll-fade">
        {profile ? (
          <Fingerprint profile={profile} letterCount={letters.length} />
        ) : (
          <NotLearnedPanel count={letters.length} analyzing={analyzing} onLearn={onLearn} />
        )}
      </section>
    </div>
  );
}

/* ── Empty state — teach the AI ──────────────────────────────────── */
function EmptyBody({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="p-7">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
        <SetupIntro
          icon={
            <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10h1.5M8 5v10M12 3v14M16 8v4" />
            </svg>
          }
          title="Teach the AI how you write"
          subtitle="Add cover letters you've written before — the model studies your real tone, structure, and phrasing, then drafts new letters that sound like you, not like generic AI."
          privacyNote="Parsed on-device · nothing is uploaded"
        />

        <button
          type="button"
          onClick={onAdd}
          className="block w-full cursor-pointer rounded-[16px] border border-dashed border-border-strong p-10 text-center outline-none transition-colors hover:border-accent focus-visible:border-accent"
          style={{ background: "radial-gradient(130% 120% at 50% -10%, var(--accent-weak), transparent 58%), var(--input)" }}
        >
          <span
            className="mx-auto mb-3.5 flex h-[52px] w-[52px] items-center justify-center rounded-[15px] text-white"
            style={{ background: "var(--accent-grad)", boxShadow: "0 14px 32px -8px var(--accent-shadow)" }}
          >
            <svg width={22} height={22} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13V4M6.5 7.5L10 4l3.5 3.5M4 15h12" />
            </svg>
          </span>
          <span className="block text-[15px] font-bold text-fg">Add a past letter</span>
          <span className="mt-1 block text-[12.5px] text-fg-mid">Choose a .txt file or paste the text — it stays on your machine</span>
        </button>

        <div className="flex justify-center">
          <Button variant="primary" size="md" type="button" onClick={onAdd}>
            <Plus size={15} /> Add a letter
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Learning state — analysis in progress ───────────────────────── */
function LearningBody({ letters, progress, label }: { letters: PastCoverLetter[]; progress: number; label: string }) {
  const facets = ["Tone & register", "Structure & rhetoric", "Signature phrasing", "Vocabulary & avoid-list"];
  return (
    <div className="grid min-h-full grid-cols-1 gap-5 px-7 py-[22px] lg:grid-cols-[290px_1fr]">
      <section className="cll-fade flex flex-col gap-2.5">
        <div className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Samples · {letters.length}</div>
        {letters.map((l, i) => (
          <div key={l.id ?? i} className="flex items-center gap-2.5 rounded-[11px] border border-border bg-surface px-3.5 py-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-accent-weak">
              <IconCheck size={11} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-fg">{previewLabel(l.content) || `Letter ${i + 1}`}</div>
              <div className="font-mono text-[9px] text-fg-low">{wordCount(l.content)} words</div>
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
          <div className="relative flex items-center gap-2">
            <div className="text-[15px] text-fg" style={{ fontWeight: 650 }}>Analyzing your voice</div>
            <StatDot tone="accent" pulse size={7} />
            <span className="ml-auto font-mono text-[11px] text-accent-text">{Math.round(progress)}%</span>
          </div>
          <div className="relative mt-1.5 text-[12px] text-fg-mid">{label || "Working…"}</div>
          <div className="relative mt-2">
            <ProgressBar value={progress} />
          </div>

          <div className="relative mt-5 flex flex-col gap-[13px]">
            {facets.map((label) => (
              <div key={label} className="flex items-center gap-[11px]">
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-accent-weak">
                  <IconSpin size={13} />
                </span>
                <span className="flex-1 text-[12.5px] text-fg">{label}</span>
                <span className="text-[10.5px] font-semibold tracking-[0.01em] text-accent-text">Working</span>
              </div>
            ))}
          </div>

          <div className="relative mt-[18px] border-t border-border pt-3.5 text-[12.5px] leading-[1.7] text-fg-mid">
            Reading your letters and reverse-engineering how you open, build an argument, and close — so new drafts sound like you
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

/* ── Letter reader modal (shared Dialog primitive) ───────────────── */
function LetterModal({ letter, onClose }: { letter: PastCoverLetter; onClose: () => void }) {
  const words = wordCount(letter.content);
  const meta = [`${words} words`, letter.user_rating ? `rated ${letter.user_rating}/5` : null].filter(Boolean).join(" · ");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[84vh] w-[min(92vw,560px)] flex-col overflow-hidden p-0"
      >
        <div className="border-b border-border px-[22px] py-[18px] pr-12">
          <DialogTitle className="text-[15px]">{previewLabel(letter.content) || "Past letter"}</DialogTitle>
          <div className="mt-[3px] font-mono text-[10px] text-fg-mid">{meta}</div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-reading px-[26px] py-6">
          <div className="whitespace-pre-wrap text-[14px] leading-[1.85] text-reading-ink">{letter.content}</div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-2 px-[22px] py-3.5">
          <span className="text-[11px] text-fg-low">Used as a style reference — never copied verbatim.</span>
          <Button variant="primary" size="sm" type="button" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Add-a-letter dialog (paste text) ────────────────────────────── */
function AddLetterDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (content: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const trimmed = text.trim();

  async function readFile(file: File) {
    try {
      const content = await file.text();
      setText(content);
    } catch (e) {
      toast.danger("Couldn't read the file", errorMessage(e));
    }
  }

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    if (!next) setText("");
    onOpenChange(next);
  }

  async function submit() {
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setText("");
    } catch (e) {
      toast.danger("Couldn't add the letter", errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[min(92vw,520px)]">
        <DialogTitle>Add a past letter</DialogTitle>
        <DialogDescription>
          Paste the text of a cover letter you wrote, or choose a .txt file. It stays on your machine and teaches the AI how you write.
        </DialogDescription>
        <div className="mt-4">
          <Field label="Letter text" hint={trimmed ? `${wordCount(text)} words` : "Paste at least a paragraph or two"}>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Dear Hiring Team,\n\nWhen I read that this role…"}
              className="min-h-[220px]"
              autoFocus
            />
          </Field>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.text,text/plain,text/markdown"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = "";
          }}
        />
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" size="sm" type="button" onClick={() => fileRef.current?.click()} disabled={submitting}>
            <Upload size={14} /> Choose a .txt file
          </Button>
          <span className="text-[11.5px] text-fg-low">or paste the text above</span>
        </div>
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={submitting} disabled={!trimmed}>Add &amp; learn</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Loaded shell — owns the wired state once data has arrived ───── */
type Loaded = { letters: PastCoverLetter[]; style: StyleState };

function VoiceLoaded({ initial }: { initial: Loaded }) {
  const [letters, setLetters] = useState<PastCoverLetter[]>(initial.letters);
  const [profile, setProfile] = useState<VoiceProfile | null>(initial.style.style_profile);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [reader, setReader] = useState<PastCoverLetter | null>(null);
  const [toDelete, setToDelete] = useState<PastCoverLetter | null>(null);
  const [deleting, setDeleting] = useState(false);

  // (Re)analyze the whole corpus into a fresh voice fingerprint.
  const runLearn = useCallback(async () => {
    setProgress(0);
    setProgressLabel("Starting…");
    setAnalyzing(true);
    try {
      const res = await learnVoice((p) => {
        setProgress(p.percent);
        setProgressLabel(p.label);
      });
      setProfile(res.style_profile);
      if (res.analysis_failed) {
        toast.warning(
          "Deep analysis didn't complete",
          res.suggest_model_switch
            ? `The model (${res.model ?? "current"}) looks busy — try again, or switch model in Settings.`
            : "We kept your existing voice. Please try again in a moment.",
        );
      } else if (res.style_profile?.enough_signal === false) {
        toast.info("Not enough signal yet", "Add another letter or two so the analysis has more to learn from.");
      } else {
        toast.success("Voice updated", `Learned from ${res.samples} letter${res.samples === 1 ? "" : "s"}.`);
      }
    } catch (e) {
      toast.danger("Couldn't analyze your voice", errorMessage(e));
    } finally {
      setAnalyzing(false);
    }
  }, []);

  // Paste flow: persist the sample, then (re)analyze into the fingerprint.
  const handleAdd = useCallback(
    async (content: string) => {
      const created = await createPastLetter({ content });
      setLetters((prev) => [...prev, created]);
      setAddOpen(false);
      void runLearn();
    },
    [runLearn],
  );

  const handleRate = useCallback((letter: PastCoverLetter, rating: number) => {
    if (letter.id == null) return;
    const id = letter.id;
    const next = { ...letter, user_rating: rating };
    setLetters((prev) => prev.map((l) => (l.id === id ? next : l))); // optimistic
    updatePastLetter(id, next).catch((e) => {
      toast.danger("Couldn't save rating", errorMessage(e));
      setLetters((prev) => prev.map((l) => (l.id === id ? letter : l))); // revert
    });
  }, []);

  const confirmDelete = useCallback(async () => {
    const target = toDelete;
    if (target?.id == null) return;
    setDeleting(true);
    try {
      await deletePastLetter(target.id);
      setLetters((prev) => prev.filter((l) => l.id !== target.id));
      setToDelete(null);
      toast.success("Letter removed", "Re-analyze to refresh your voice fingerprint.");
    } catch (e) {
      toast.danger("Couldn't remove letter", errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }, [toDelete]);

  const hasLetters = letters.length > 0;
  const view = analyzing ? "learning" : profile ? "done" : hasLetters ? "unlearned" : "empty";

  const actions = (
    <>
      {hasLetters && !analyzing ? (
        <Button variant="outline" size="md" onClick={() => void runLearn()}>
          <RotateCw size={14} /> Re-analyze
        </Button>
      ) : null}
      <Button variant="primary" size="md" onClick={() => setAddOpen(true)} disabled={analyzing}>
        <Plus size={14} /> Add a letter
      </Button>
    </>
  );

  return (
    <Page eyebrow={EYEBROW} title={TITLE} actions={actions} bodyClassName="p-0">
      {view === "learning" ? (
        <LearningBody letters={letters} progress={progress} label={progressLabel} />
      ) : view === "empty" ? (
        <EmptyBody onAdd={() => setAddOpen(true)} />
      ) : (
        <DoneBody
          letters={letters}
          profile={profile}
          analyzing={analyzing}
          onOpen={setReader}
          onRate={handleRate}
          onDelete={setToDelete}
          onAdd={() => setAddOpen(true)}
          onLearn={() => void runLearn()}
        />
      )}

      <AddLetterDialog open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAdd} />
      {reader ? <LetterModal letter={reader} onClose={() => setReader(null)} /> : null}
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        tone="danger"
        icon={<Trash2 size={22} />}
        title="Remove this letter?"
        description="It will no longer be used to learn your writing voice. This can't be undone."
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </Page>
  );
}

export function Voice() {
  const load = useAsync<Loaded>(
    () => Promise.all([listPastLetters(), getStyle()]).then(([letters, style]) => ({ letters, style })),
    [],
  );

  // Header stays visible while the one-time load resolves; AsyncBoundary
  // renders the spinner / error+retry. Once data arrives, the loaded shell
  // seeds its own state (flash-free) and owns all wired interactions.
  if (!load.data) {
    return (
      <Page eyebrow={EYEBROW} title={TITLE} bodyClassName="p-0">
        <AsyncBoundary state={load}>{() => null}</AsyncBoundary>
      </Page>
    );
  }

  return <VoiceLoaded initial={load.data} />;
}
