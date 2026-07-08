import { useRef, useState, type ReactNode } from "react";
import { Check, RefreshCw, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { MonthPicker } from "@/components/ui/date-picker";
import { RatingInput } from "@/components/common/RatingInput";
import { SkillTag } from "@/components/common/SkillTag";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import {
  streamDraft,
  streamRefine,
  type CompletionStep,
  type DraftEvent,
  type LangEntry,
  type RepoPick,
  type SkillEntry,
} from "@/api/profileCompletion";

const REFINE_PRESETS = ["Shorter", "More formal", "More technical", "Add impact"];

/** Frame that colours a field by state: red when empty, accent when filled. */
function FieldFrame({
  label,
  filled,
  isAI,
  children,
}: {
  label: string;
  filled: boolean;
  isAI: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-[12px] border-l-[3px] py-1 pl-3.5", filled ? "border-accent" : "border-danger")}>
      <div className="mb-1.5 flex items-center gap-2">
        <Label>{label}</Label>
        {!filled ? (
          <Badge tone="danger">Missing</Badge>
        ) : isAI ? (
          <Badge tone="accent">
            <Sparkles size={11} /> AI
          </Badge>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Placeholder while the AI hasn't streamed this field's suggestion yet. */
function PendingRow({ label }: { label: string }) {
  return (
    <div className="rounded-[12px] border-l-[3px] border-accent/40 py-1 pl-3.5">
      <div className="mb-1.5">
        <Label>{label}</Label>
      </div>
      <div className="flex items-center gap-2 rounded-[10px] bg-accent-soft/40 px-3 py-2.5 text-[13px] text-accent-ink">
        <Spinner size={14} /> Drafting from your CV &amp; GitHub…
      </div>
    </div>
  );
}

/** Thin banner shown atop a composite card while its suggestion streams in. */
function PendingBanner() {
  return (
    <div className="flex items-center gap-2 rounded-[10px] bg-accent-soft/40 px-3 py-2 text-[12.5px] font-semibold text-accent-ink">
      <Spinner size={13} /> AI is suggesting from your CV &amp; GitHub…
    </div>
  );
}

// ── Scalar: short_text / enum / date ──────────────────────────────

export function ScalarField({
  step,
  suggested,
  value,
  pending,
  onChange,
}: {
  step: CompletionStep;
  suggested: string;
  value: string;
  pending?: boolean;
  onChange: (v: string) => void;
}) {
  if (pending) return <PendingRow label={step.label} />;
  const filled = Boolean(value.trim());
  const isAI = filled && value === suggested;
  return (
    <FieldFrame label={step.label} filled={filled} isAI={isAI}>
      {step.kind === "enum" ? (
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {step.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : step.kind === "date" ? (
        <MonthPicker value={value} maxMonthsAhead={null} onChange={onChange} placeholder="Pick a month" />
      ) : (
        <Input value={value} placeholder={`Enter ${step.label.toLowerCase()}`} onChange={(e) => onChange(e.target.value)} />
      )}
    </FieldFrame>
  );
}

// ── Generative: directly editable, AI-drafted, refinable ──────────

export function GenerativeField({
  step,
  suggested,
  value,
  pending,
  onChange,
}: {
  step: CompletionStep;
  suggested: string;
  value: string;
  pending?: boolean;
  onChange: (v: string) => void;
}) {
  const [streaming, setStreaming] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const filled = Boolean(value.trim());
  const isAI = filled && value === suggested;

  function run(
    stream: typeof streamDraft | typeof streamRefine,
    body: Parameters<typeof streamDraft>[0] | Parameters<typeof streamRefine>[0],
  ) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStreaming(true);
    let acc = "";
    onChange("");
    const onEvent = (e: DraftEvent) => {
      if (e.type === "token") {
        acc += e.text;
        onChange(acc);
      } else if (e.type === "done") {
        onChange(e.text || acc);
        setStreaming(false);
      } else if (e.type === "fatal") {
        setStreaming(false);
        toast.danger("AI couldn't write this", e.error);
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stream as any)(body, onEvent, ac.signal).catch((err: unknown) => {
      setStreaming(false);
      if (!ac.signal.aborted) toast.danger("AI request failed", String(err));
    });
  }

  function refine(note: string) {
    const trimmed = note.trim();
    if (!trimmed) return;
    setRefineOpen(false);
    setInstruction("");
    run(streamRefine, { field_label: step.label, current: value, instruction: trimmed });
  }

  if (pending) return <PendingRow label={step.label} />;

  return (
    <FieldFrame label={step.label} filled={filled} isAI={isAI}>
      <Textarea
        rows={4}
        value={value}
        disabled={streaming}
        placeholder="Write it in your own words, or let the AI draft it…"
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setRefineOpen((v) => !v)} disabled={streaming || !filled}>
          <Wand2 size={14} /> Edit with AI
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => run(streamDraft, { field_label: step.label, target: step.context_label })}
          disabled={streaming}
        >
          {streaming ? <Spinner size={14} /> : <RefreshCw size={14} />} Regenerate
        </Button>
      </div>

      {refineOpen && (
        <div className="mt-2 grid gap-2 rounded-[12px] border border-accent/30 bg-accent-soft/40 p-3">
          <div className="flex flex-wrap gap-2">
            {REFINE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => refine(p)}
                className="rounded-full border border-border bg-surface px-3 py-1 text-[12.5px] font-semibold text-text-2 transition-colors hover:border-accent hover:text-accent-ink"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={instruction}
              placeholder="Or describe the change…"
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && refine(instruction)}
            />
            <Button size="sm" onClick={() => refine(instruction)} disabled={!instruction.trim()}>
              Revise
            </Button>
          </div>
        </div>
      )}
    </FieldFrame>
  );
}

// ── Languages (composite card) ────────────────────────────────────

export function LanguagesCard({
  step,
  value,
  pending,
  onChange,
}: {
  step: CompletionStep;
  value: LangEntry[];
  pending?: boolean;
  onChange: (v: LangEntry[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const setLevel = (i: number, level: string) =>
    onChange(value.map((e, j) => (j === i ? { ...e, proficiency: level || null } : e)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const add = () => {
    const name = draft.trim();
    if (!name || value.some((e) => e.name.toLowerCase() === name.toLowerCase())) return;
    setDraft("");
    onChange([...value, { name, proficiency: null }]);
  };

  return (
    <div className="grid gap-2">
      {pending && <PendingBanner />}
      {value.map((e, i) => {
        const missing = !e.proficiency;
        return (
          <div
            key={`${e.name}-${i}`}
            className={cn("flex items-center gap-2 rounded-[12px] border-l-[3px] bg-surface-2 py-2 pl-3.5 pr-3", missing ? "border-danger" : "border-accent")}
          >
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">{e.name}</span>
            {e.id === undefined && (
              <Badge tone="accent">
                <Sparkles size={11} /> AI
              </Badge>
            )}
            <Select className="w-[168px]" value={e.proficiency ?? ""} onChange={(ev) => setLevel(i, ev.target.value)}>
              <option value="">Set level…</option>
              {step.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <button type="button" aria-label={`Remove ${e.name}`} onClick={() => remove(i)} className="text-text-3 transition-colors hover:text-danger">
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Input value={draft} placeholder="Add another language" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button size="sm" variant="secondary" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

// ── Skills (composite card) ───────────────────────────────────────

export function SkillsCard({ value, pending, onChange }: { value: SkillEntry[]; pending?: boolean; onChange: (v: SkillEntry[]) => void }) {
  const patch = (i: number, p: Partial<SkillEntry>) => onChange(value.map((e, j) => (j === i ? { ...e, ...p } : e)));
  return (
    <div className="grid gap-2">
      {pending && <PendingBanner />}
      {value.map((e, i) => {
        const missing = !e.category || !e.self_rating;
        return (
          <div
            key={`${e.name}-${i}`}
            className={cn(
              "grid items-center gap-3 rounded-[12px] border-l-[3px] px-3.5 py-2.5 sm:grid-cols-[1.2fr_1fr_auto]",
              !e.include ? "border-border-strong opacity-55" : missing ? "border-danger bg-surface-2" : "border-accent bg-surface-2",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[14px] font-semibold text-text">{e.name}</span>
              {e.isNew && (
                <Badge tone="accent">
                  <Sparkles size={11} /> New
                </Badge>
              )}
            </span>
            <Input value={e.category ?? ""} placeholder="Category" onChange={(ev) => patch(i, { category: ev.target.value || null })} />
            <div className="flex items-center justify-end gap-3">
              <RatingInput value={e.self_rating ?? 0} onChange={(v) => patch(i, { self_rating: v })} />
              {e.isNew && (
                <button
                  type="button"
                  aria-label={e.include ? `Skip ${e.name}` : `Add ${e.name}`}
                  onClick={() => patch(i, { include: !e.include })}
                  className={e.include ? "text-text-3 hover:text-danger" : "text-accent-ink"}
                >
                  {e.include ? <Trash2 size={16} /> : <Check size={16} />}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Projects from GitHub (composite card) ─────────────────────────

export function ProjectsCard({ value, onChange }: { value: RepoPick[]; onChange: (v: RepoPick[]) => void }) {
  const toggle = (i: number) => onChange(value.map((p, j) => (j === i ? { ...p, picked: !p.picked } : p)));
  return (
    <div className="grid gap-2">
      {value.map((p, i) => (
        <button
          type="button"
          key={p.github_repo_id}
          onClick={() => toggle(i)}
          className={cn(
            "grid gap-1.5 rounded-[14px] border p-3.5 text-left transition-colors",
            p.picked ? "border-accent bg-accent-soft/40" : "border-border bg-surface-2 hover:border-border-strong",
          )}
        >
          <span className="flex items-center gap-2">
            <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border", p.picked ? "border-accent bg-accent text-on-accent" : "border-border-strong")}>
              {p.picked && <Check size={13} />}
            </span>
            <span className="text-[14px] font-semibold text-text">{p.name}</span>
          </span>
          {p.description && <span className="pl-7 text-[13px] text-text-2">{p.description}</span>}
          {p.technologies.length > 0 && (
            <span className="flex flex-wrap gap-1.5 pl-7">
              {p.technologies.slice(0, 8).map((t) => (
                <SkillTag key={t}>{t}</SkillTag>
              ))}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
