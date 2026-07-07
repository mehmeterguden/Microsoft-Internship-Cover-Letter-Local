import { useEffect, useRef, useState } from "react";
import { Check, Pencil, RefreshCw, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MonthPicker } from "@/components/ui/date-picker";
import { RatingInput } from "@/components/common/RatingInput";
import { StreamingText } from "@/components/common/StreamingText";
import { Spinner } from "@/components/ui/spinner";
import { SkillTag } from "@/components/common/SkillTag";
import { toast } from "@/store/toast";
import {
  streamDraft,
  streamRefine,
  type CompletionStep,
  type DraftEvent,
  type Suggestions,
} from "@/api/profileCompletion";

/** One answer, shape depends on the step kind (see the page's apply builder). */
export type Answer = unknown;

export interface StepViewProps {
  step: CompletionStep;
  suggestions: Suggestions | null;
  suggestionsLoading: boolean;
  answer: Answer;
  onChange: (value: Answer) => void;
}

const REFINE_PRESETS = ["Shorter", "More formal", "More technical", "More concise", "Add impact"];

// ── Generative: draft → accept / write your own / edit with AI ────

interface GenAnswer {
  text: string;
}

function GenerativeStep({ step, answer, onChange }: StepViewProps) {
  const initial = (answer as GenAnswer | undefined)?.text ?? "";
  const [text, setText] = useState(initial);
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState<"view" | "custom" | "refine">("view");
  const [instruction, setInstruction] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    // Kick off the first draft automatically when we land on the step.
    if (!startedRef.current && !initial) {
      startedRef.current = true;
      run(streamDraft, { field_label: step.label, target: step.context_label });
    }
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function run(
    stream: typeof streamDraft | typeof streamRefine,
    body: Parameters<typeof streamDraft>[0] | Parameters<typeof streamRefine>[0],
  ) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStreaming(true);
    setText("");
    let acc = "";
    const onEvent = (e: DraftEvent) => {
      if (e.type === "token") {
        acc += e.text;
        setText(acc);
        onChange({ text: acc });
      } else if (e.type === "done") {
        acc = e.text || acc;
        setText(acc);
        onChange({ text: acc });
        setStreaming(false);
      } else if (e.type === "fatal") {
        setStreaming(false);
        toast.danger("AI couldn't draft this", e.error);
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stream as any)(body, onEvent, ac.signal).catch((err: unknown) => {
      setStreaming(false);
      if (!ac.signal.aborted) toast.danger("AI request failed", String(err));
    });
  }

  function applyRefine() {
    const note = instruction.trim();
    if (!note) return;
    setMode("view");
    setInstruction("");
    run(streamRefine, { field_label: step.label, current: text, instruction: note });
  }

  return (
    <div className="grid gap-4">
      <div className="min-h-[132px] rounded-[14px] border border-border bg-surface-2 p-4">
        {streaming && !text ? (
          <div className="flex items-center gap-2 text-[13.5px] text-text-2">
            <Spinner size={16} /> Drafting from your CV & GitHub…
          </div>
        ) : mode === "custom" ? (
          <Textarea
            autoFocus
            rows={5}
            value={text}
            placeholder="Write it in your own words…"
            onChange={(e) => {
              setText(e.target.value);
              onChange({ text: e.target.value });
            }}
          />
        ) : (
          <StreamingText text={text || "—"} streaming={streaming} />
        )}
      </div>

      {mode === "refine" ? (
        <div className="grid gap-3 rounded-[14px] border border-accent/30 bg-accent-soft/40 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-accent-ink">
            <Wand2 size={15} /> How should the AI change it?
          </p>
          <div className="flex flex-wrap gap-2">
            {REFINE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => run(streamRefine, { field_label: step.label, current: text, instruction: p })}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text-2 transition-colors hover:border-accent hover:text-accent-ink"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={instruction}
              placeholder="Or describe it — e.g. “mention my Azure work”"
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyRefine()}
            />
            <Button size="sm" onClick={applyRefine} disabled={!instruction.trim()}>
              Revise
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("view")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={mode === "custom" ? "secondary" : "primary"}
            onClick={() => setMode(mode === "custom" ? "view" : "custom")}
          >
            <Pencil size={14} /> {mode === "custom" ? "Done editing" : "Write my own"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMode("refine")} disabled={!text || streaming}>
            <Sparkles size={14} /> Edit with AI
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => run(streamDraft, { field_label: step.label, target: step.context_label })}
            disabled={streaming}
          >
            <RefreshCw size={14} /> Regenerate
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Short text / enum / date (with an AI suggestion) ──────────────

function suggestionFor(step: CompletionStep, suggestions: Suggestions | null): string {
  if (!suggestions) return "";
  if (step.section === "identity" && step.field) return suggestions.identity[step.field] ?? "";
  return suggestions.items[step.id] ?? "";
}

function ScalarStep({ step, suggestions, suggestionsLoading, answer, onChange }: StepViewProps) {
  const suggestion = suggestionFor(step, suggestions);
  const value = (answer as string | undefined) ?? "";
  const touched = useRef(false);

  useEffect(() => {
    // Seed with the AI suggestion once it arrives, unless the user has typed.
    if (!touched.current && !value && suggestion) onChange(suggestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion]);

  const set = (v: string) => {
    touched.current = true;
    onChange(v);
  };

  return (
    <div className="grid gap-3">
      {step.kind === "enum" ? (
        <Select value={value} onChange={(e) => set(e.target.value)}>
          <option value="">—</option>
          {step.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : step.kind === "date" ? (
        <MonthPicker value={value} maxMonthsAhead={null} onChange={(v) => set(v)} placeholder="Pick a month" />
      ) : (
        <Input autoFocus value={value} placeholder={`Enter ${step.label.toLowerCase()}`} onChange={(e) => set(e.target.value)} />
      )}

      {suggestionsLoading && !suggestion && (
        <p className="flex items-center gap-2 text-[12.5px] text-text-3">
          <Spinner size={13} /> Looking for a suggestion…
        </p>
      )}
      {suggestion && suggestion !== value && (
        <button
          type="button"
          onClick={() => set(suggestion)}
          className="flex items-center gap-2 self-start rounded-[10px] border border-accent/30 bg-accent-soft/50 px-3 py-1.5 text-[12.5px] font-semibold text-accent-ink transition-colors hover:bg-accent-soft"
        >
          <Sparkles size={13} /> Suggested: {step.kind === "enum" ? (step.options?.find((o) => o.value === suggestion)?.label ?? suggestion) : suggestion}
        </button>
      )}
    </div>
  );
}

// ── Languages (composite) ─────────────────────────────────────────

export interface LangEntry {
  id?: number;
  name: string;
  proficiency: string | null;
}

function LanguagesStep({ step, suggestions, suggestionsLoading, answer, onChange }: StepViewProps) {
  const entries = (answer as LangEntry[] | undefined) ?? [];
  const [draft, setDraft] = useState("");
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || entries.length) return;
    const existing = (step.extra?.existing ?? []).map((e) => ({ id: e.id, name: e.name, proficiency: e.proficiency ?? null }));
    const have = new Set(existing.map((e) => e.name.toLowerCase()));
    const suggested = (suggestions?.languages ?? []).filter((l) => !have.has(l.name.toLowerCase()));
    if (existing.length || suggested.length) {
      seeded.current = true;
      onChange([...existing, ...suggested.map((l) => ({ name: l.name, proficiency: l.proficiency }))]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions]);

  const update = (next: LangEntry[]) => onChange(next);
  const setLevel = (i: number, level: string) => update(entries.map((e, j) => (j === i ? { ...e, proficiency: level || null } : e)));
  const remove = (i: number) => update(entries.filter((_, j) => j !== i));
  const add = () => {
    const name = draft.trim();
    if (!name || entries.some((e) => e.name.toLowerCase() === name.toLowerCase())) return;
    setDraft("");
    update([...entries, { name, proficiency: null }]);
  };

  return (
    <div className="grid gap-3">
      {suggestionsLoading && !entries.length && (
        <p className="flex items-center gap-2 text-[12.5px] text-text-3">
          <Spinner size={13} /> Guessing your languages from your CV & projects…
        </p>
      )}
      <div className="grid gap-2">
        {entries.map((e, i) => (
          <div key={`${e.name}-${i}`} className="flex items-center gap-2 rounded-[12px] border border-border bg-surface-2 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">{e.name}</span>
            {e.id === undefined && <Badge tone="accent"><Sparkles size={11} /> AI</Badge>}
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
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input value={draft} placeholder="Add another language" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button size="sm" variant="secondary" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

// ── Skills (categorize + rate existing, add suggested new) ────────

export interface SkillEntry {
  id?: number;
  name: string;
  category: string | null;
  self_rating: number | null;
  isNew: boolean;
  include: boolean;
}

function SkillsStep({ step, suggestions, suggestionsLoading, answer, onChange }: StepViewProps) {
  const entries = (answer as SkillEntry[] | undefined) ?? [];
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || entries.length) return;
    const cats = suggestions?.skills_categories ?? {};
    const ratings = suggestions?.skills_ratings ?? {};
    const existing: SkillEntry[] = (step.extra?.existing ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category ?? cats[s.name] ?? null,
      self_rating: s.self_rating ?? ratings[s.name] ?? null,
      isNew: false,
      include: true,
    }));
    const have = new Set(existing.map((s) => s.name.toLowerCase()));
    const fresh: SkillEntry[] = (suggestions?.skills_new ?? [])
      .filter((s) => !have.has(s.name.toLowerCase()))
      .map((s) => ({ name: s.name, category: s.category ?? null, self_rating: s.self_rating ?? 3, isNew: true, include: true }));
    if (existing.length || fresh.length) {
      seeded.current = true;
      onChange([...existing, ...fresh]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions]);

  const patch = (i: number, p: Partial<SkillEntry>) => onChange(entries.map((e, j) => (j === i ? { ...e, ...p } : e)));

  if (suggestionsLoading && !entries.length) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-text-2">
        <Spinner size={16} /> Categorizing and rating your skills…
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {entries.map((e, i) => (
        <div
          key={`${e.name}-${i}`}
          className={`grid items-center gap-3 rounded-[12px] border px-3 py-2.5 sm:grid-cols-[1.2fr_1fr_auto] ${
            e.include ? "border-border bg-surface-2" : "border-dashed border-border-strong opacity-60"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-text">{e.name}</span>
            {e.isNew && <Badge tone="accent"><Sparkles size={11} /> New</Badge>}
          </span>
          <Input
            value={e.category ?? ""}
            placeholder="Category"
            onChange={(ev) => patch(i, { category: ev.target.value || null })}
          />
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
      ))}
    </div>
  );
}

// ── Projects from GitHub repos ────────────────────────────────────

export interface RepoPick {
  github_repo_id: number;
  name: string;
  description: string | null;
  technologies: string[];
  url: string | null;
  picked: boolean;
}

function ProjectsFromGithubStep({ step, answer, onChange }: StepViewProps) {
  const picks = (answer as RepoPick[] | undefined) ?? [];
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || picks.length) return;
    const repos = step.extra?.repos ?? [];
    if (repos.length) {
      seeded.current = true;
      onChange(
        repos.map((r) => ({
          github_repo_id: r.github_repo_id,
          name: r.name,
          description: r.purpose,
          technologies: r.technologies,
          url: r.url,
          picked: true,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (i: number) => onChange(picks.map((p, j) => (j === i ? { ...p, picked: !p.picked } : p)));

  return (
    <div className="grid gap-2">
      {picks.map((p, i) => (
        <button
          type="button"
          key={p.github_repo_id}
          onClick={() => toggle(i)}
          className={`grid gap-1.5 rounded-[14px] border p-3.5 text-left transition-colors ${
            p.picked ? "border-accent bg-accent-soft/40" : "border-border bg-surface-2 hover:border-border-strong"
          }`}
        >
          <span className="flex items-center gap-2">
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border ${
                p.picked ? "border-accent bg-accent text-on-accent" : "border-border-strong"
              }`}
            >
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

// ── Dispatcher ────────────────────────────────────────────────────

export function StepView(props: StepViewProps) {
  switch (props.step.kind) {
    case "generative":
      return <GenerativeStep {...props} />;
    case "languages":
      return <LanguagesStep {...props} />;
    case "skills":
      return <SkillsStep {...props} />;
    case "projects_from_github":
      return <ProjectsFromGithubStep {...props} />;
    default:
      return <ScalarStep {...props} />;
  }
}
