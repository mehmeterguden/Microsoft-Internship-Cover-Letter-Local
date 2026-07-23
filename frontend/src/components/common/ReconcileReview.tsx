import { useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, GitCompare, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/feedback";
import { errorMessage } from "@/api/client";
import { toast } from "@/store/toast";
import {
  applyReconcile,
  type ApplyItem,
  type ApplyResult,
  type ReconcileEntry,
  type ReconcilePlan,
} from "@/api/reconcile";
import { cn } from "@/lib/utils";

const SECTION_LABEL: Record<string, string> = {
  profile: "Profile",
  skills: "Skill",
  experiences: "Experience",
  education: "Education",
  projects: "Project",
  certificates: "Certificate",
  trainings: "Training",
  languages: "Language",
  links: "Link",
};

const FIELD_LABEL: Record<string, string> = {
  description: "Description",
  start_date: "Start",
  end_date: "End",
  location: "Location",
  employment_type: "Type",
  is_current: "Current",
  field: "Field",
  gpa: "GPA",
  role: "Role",
  url: "URL",
  technologies: "Tech",
  issuer: "Issuer",
  cert_type: "Kind",
  issue_date: "Issued",
  expiry_date: "Expires",
  credential_id: "Credential",
  proficiency: "Level",
  provider: "Provider",
  completion_date: "Completed",
  label: "Label",
  entry: "Entry",
};

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.map(String).join(", ") || "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

type Decision = "existing" | "imported";

export function ReconcileReview({
  plan,
  source,
  sourceDetail,
  onApplied,
  onDiscard,
}: {
  plan: ReconcilePlan;
  source: "linkedin" | "cv";
  sourceDetail?: string;
  onApplied: (result: ApplyResult) => void;
  onDiscard: () => void;
}) {
  const all = useMemo(
    () => [...plan.profile, ...Object.values(plan.sections).flat()],
    [plan],
  );
  const conflicts = all.filter((e) => e.kind === "conflict");
  const news = all.filter((e) => e.kind === "new");
  const fills = all.filter((e) => e.kind === "fill");
  const sames = all.filter((e) => e.kind === "same");

  const [keep, setKeep] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(conflicts.map((e) => [e.id, e.recommend ?? "existing"])),
  );
  const [add, setAdd] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(news.map((e) => [e.id, true])),
  );
  const [showSame, setShowSame] = useState(false);
  const [applying, setApplying] = useState(false);

  const nothingToDo = conflicts.length === 0 && news.length === 0 && fills.length === 0;

  async function onApply() {
    const profile_fields = [
      ...fills.filter((e) => e.section === "profile").map((e) => ({ field: e.field!, value: e.incoming })),
      ...conflicts
        .filter((e) => e.section === "profile" && keep[e.id] === "imported")
        .map((e) => ({ field: e.field!, value: e.incoming })),
    ];
    const items: ApplyItem[] = [
      ...news
        .filter((e) => e.section !== "profile" && add[e.id])
        .map((e) => ({ section: e.section, existing_id: null, data: e.incoming as Record<string, unknown> })),
      ...conflicts
        .filter((e) => e.section !== "profile" && keep[e.id] === "imported")
        .map((e) => ({ section: e.section, existing_id: e.existing_id, data: e.incoming as Record<string, unknown> })),
    ];
    setApplying(true);
    try {
      const result = await applyReconcile({ source, source_detail: sourceDetail, profile_fields, items });
      onApplied(result);
    } catch (err) {
      toast.danger("Couldn't save", errorMessage(err));
    } finally {
      setApplying(false);
    }
  }

  const acceptedNew = news.filter((e) => add[e.id]).length;
  const acceptedImports = conflicts.filter((e) => keep[e.id] === "imported").length;

  return (
    <div className="cll-fade flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.01em] text-accent-text">
          <GitCompare size={13} /> Review changes
        </span>
        <Pill tone={plan.ai ? "accent" : "neutral"} mono>
          {plan.ai ? <Sparkles size={10} /> : null}
          {plan.ai ? "AI-reviewed" : "Field-matched"}
        </Pill>
      </div>

      {nothingToDo ? (
        <div className="rounded-[14px] border border-border bg-surface px-5 py-8 text-center">
          <p className="text-[14px] font-semibold text-fg">Nothing to change</p>
          <p className="mt-1 text-[12.5px] text-fg-mid">Everything here already matches your profile.</p>
        </div>
      ) : null}

      {/* ── Conflicts ── */}
      {conflicts.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold tracking-[0.01em] text-warning">
              Needs your decision · {conflicts.length}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setKeep(Object.fromEntries(conflicts.map((e) => [e.id, "imported"])))}
                className="rounded-[7px] border border-border px-2 py-1 text-[10.5px] font-medium text-fg-mid transition-colors hover:border-accent hover:text-accent-text"
              >
                Use imported (all)
              </button>
              <button
                type="button"
                onClick={() => setKeep(Object.fromEntries(conflicts.map((e) => [e.id, "existing"])))}
                className="rounded-[7px] border border-border px-2 py-1 text-[10.5px] font-medium text-fg-mid transition-colors hover:border-border-strong hover:text-fg"
              >
                Keep existing (all)
              </button>
            </div>
          </div>
          {conflicts.map((e) => (
            <ConflictCard key={e.id} entry={e} decision={keep[e.id]} onChange={(d) => setKeep((p) => ({ ...p, [e.id]: d }))} />
          ))}
        </section>
      ) : null}

      {/* ── New (add) ── */}
      {news.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold tracking-[0.01em] text-success">
              Will be added · {acceptedNew}/{news.length}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setAdd(Object.fromEntries(news.map((e) => [e.id, true])))}
                className="rounded-[7px] border border-border px-2 py-1 text-[10.5px] font-medium text-fg-mid transition-colors hover:border-accent hover:text-accent-text"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setAdd(Object.fromEntries(news.map((e) => [e.id, false])))}
                className="rounded-[7px] border border-border px-2 py-1 text-[10.5px] font-medium text-fg-mid transition-colors hover:border-border-strong hover:text-fg"
              >
                None
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {news.map((e) => (
              <NewCard key={e.id} entry={e} checked={add[e.id]} onToggle={() => setAdd((p) => ({ ...p, [e.id]: !p[e.id] }))} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Auto-filled blanks + unchanged (informational) ── */}
      {(fills.length > 0 || sames.length > 0) ? (
        <div className="flex flex-col gap-1.5 rounded-[12px] border border-border bg-surface-2 px-4 py-3">
          {fills.length > 0 ? (
            <p className="flex items-center gap-2 text-[12px] text-fg-mid">
              <Check size={13} className="shrink-0 text-success" />
              {fills.length} blank {fills.length === 1 ? "field" : "fields"} will be filled ({fills.map((e) => e.label).join(", ")})
            </p>
          ) : null}
          {sames.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowSame((s) => !s)}
              className="flex items-center gap-2 text-left text-[12px] text-fg-low transition-colors hover:text-fg-mid"
            >
              <ChevronDown size={13} className={cn("shrink-0 transition-transform", showSame && "rotate-180")} />
              {sames.length} already match your profile — no change
            </button>
          ) : null}
          {showSame ? (
            <div className="flex flex-wrap gap-1.5 pl-5 pt-1">
              {sames.map((e) => (
                <span key={e.id} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10.5px] text-fg-low">
                  {e.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Footer ── */}
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <span className="mr-auto text-[11.5px] text-fg-low">
          {fills.length + profileImports(conflicts, keep)} profile {plur(fills.length + profileImports(conflicts, keep), "field")} ·{" "}
          {acceptedNew} added · {acceptedImports - profileImports(conflicts, keep)} replaced
        </span>
        <Button variant="outline" size="sm" onClick={onDiscard} disabled={applying}>
          Discard
        </Button>
        <Button variant="primary" size="md" loading={applying} onClick={onApply} disabled={nothingToDo}>
          <Check size={14} /> Apply to profile
        </Button>
      </div>
    </div>
  );
}

function profileImports(conflicts: ReconcileEntry[], keep: Record<string, Decision>): number {
  return conflicts.filter((e) => e.section === "profile" && keep[e.id] === "imported").length;
}
const plur = (n: number, one: string) => (n === 1 ? one : `${one}s`);

function SectionChip({ section }: { section: string }) {
  return (
    <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.3px] text-fg-low">
      {SECTION_LABEL[section] ?? section}
    </span>
  );
}

function ConflictCard({
  entry,
  decision,
  onChange,
}: {
  entry: ReconcileEntry;
  decision: Decision;
  onChange: (d: Decision) => void;
}) {
  const isProfile = entry.section === "profile";
  return (
    <div className="rounded-[13px] border border-border bg-surface p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <SectionChip section={entry.section} />
        <span className="text-[13px] font-semibold text-fg">{entry.label}</span>
        {entry.recommend ? (
          <Pill tone="accent" className="ml-auto" mono>
            AI: {entry.recommend === "imported" ? "use imported" : "keep existing"}
          </Pill>
        ) : null}
      </div>

      {entry.note ? <p className="mt-1.5 text-[12px] text-fg-mid">{entry.note}</p> : null}

      <div className="mt-2.5 flex flex-col gap-1">
        {isProfile ? (
          <DiffRow field={null} existing={entry.existing} incoming={entry.incoming} />
        ) : (
          (entry.diff ?? []).map((d) => (
            <DiffRow key={d.field} field={d.field} existing={d.existing} incoming={d.incoming} />
          ))
        )}
      </div>

      <div className="mt-3 inline-flex rounded-[9px] border border-border bg-input p-0.5">
        {(["existing", "imported"] as Decision[]).map((opt) => {
          const active = decision === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={cn(
                "rounded-[7px] px-3 py-1.5 text-[11.5px] font-medium transition-colors",
                active ? "text-white" : "text-fg-mid hover:text-fg",
              )}
              style={active ? { background: "var(--accent-grad)" } : undefined}
            >
              {opt === "existing" ? "Keep existing" : "Use imported"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DiffRow({ field, existing, incoming }: { field: string | null; existing: unknown; incoming: unknown }) {
  return (
    <div className="grid grid-cols-[70px_1fr] items-baseline gap-2 text-[12px]">
      <span className="truncate text-fg-low">{field ? FIELD_LABEL[field] ?? field : "Value"}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-fg-low line-through decoration-danger/50">{show(existing)}</span>
        <ArrowRight size={11} className="shrink-0 text-fg-low" />
        <span className="font-medium text-fg">{show(incoming)}</span>
      </span>
    </div>
  );
}

function NewCard({ entry, checked, onToggle }: { entry: ReconcileEntry; checked: boolean; onToggle: () => void }) {
  const inc = entry.incoming as Record<string, unknown>;
  const sub = show(inc.description ?? inc.summary ?? inc.proficiency ?? inc.issuer ?? inc.url ?? "");
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-start gap-2.5 rounded-[12px] border p-3 text-left transition-colors",
        checked ? "border-accent bg-accent-weak" : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border",
          checked ? "border-transparent text-white" : "border-border-strong text-transparent",
        )}
        style={checked ? { background: "var(--accent-grad)" } : undefined}
      >
        <Check size={12} strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <SectionChip section={entry.section} />
          <span className="truncate text-[12.5px] font-semibold text-fg">{entry.label}</span>
        </span>
        {sub !== "—" ? <span className="mt-0.5 block truncate text-[11px] text-fg-mid">{sub}</span> : null}
      </span>
      <Plus size={14} className={cn("shrink-0", checked ? "text-accent-text" : "text-fg-low")} />
    </button>
  );
}
