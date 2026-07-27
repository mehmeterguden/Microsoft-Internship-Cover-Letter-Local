import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Edit3,
  GitCompare,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/feedback";
import { errorMessage } from "@/api/client";
import { toast } from "@/store/toast";
import {
  applyReconcile,
  type ApplyDelete,
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
  start_date: "Start Date",
  end_date: "End Date",
  location: "Location",
  employment_type: "Type",
  is_current: "Current",
  field: "Field of Study",
  gpa: "GPA",
  role: "Role",
  url: "URL",
  technologies: "Technologies",
  issuer: "Issuer",
  cert_type: "Kind",
  issue_date: "Issue Date",
  expiry_date: "Expiry Date",
  credential_id: "Credential ID",
  proficiency: "Proficiency",
  provider: "Provider",
  completion_date: "Completed Date",
  label: "Label",
  entry: "Entry",
};

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.map(String).join(", ") || "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

type Decision = "existing" | "imported" | "merge" | "remove" | "keep";

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
  const isReplaceMode = plan.mode === "replace";

  const all = useMemo(
    () => [...plan.profile, ...Object.values(plan.sections).flat()],
    [plan],
  );

  const conflicts = all.filter((e) => e.kind === "conflict" || e.kind === "replace");
  const news = all.filter((e) => e.kind === "new");
  const removes = all.filter((e) => e.kind === "remove");
  const fills = all.filter((e) => e.kind === "fill");
  const sames = all.filter((e) => e.kind === "same");

  // State for decisions
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries([
      ...conflicts.map((e) => [e.id, e.recommend === "imported" ? "imported" : "existing"] as const),
      ...removes.map((e) => [e.id, "remove"] as const),
    ]),
  );

  // State for selected new items to add
  const [add, setAdd] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(news.map((e) => [e.id, true])),
  );

  // Editable overrides for inline tweaking
  const [overrides, setOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const [showSame, setShowSame] = useState(false);
  const [applying, setApplying] = useState(false);

  const nothingToDo =
    conflicts.length === 0 && news.length === 0 && fills.length === 0 && removes.length === 0;

  async function onApply() {
    const profile_fields = [
      ...fills.filter((e) => e.section === "profile").map((e) => ({
        field: e.field!,
        value: overrides[e.id]?.value ?? e.incoming,
      })),
      ...conflicts
        .filter((e) => e.section === "profile" && decisions[e.id] === "imported")
        .map((e) => ({
          field: e.field!,
          value: overrides[e.id]?.value ?? e.incoming,
        })),
    ];

    const items: ApplyItem[] = [
      ...news
        .filter((e) => e.section !== "profile" && add[e.id])
        .map((e) => ({
          section: e.section,
          existing_id: null,
          data: (overrides[e.id] ?? e.incoming) as Record<string, unknown>,
        })),
      ...conflicts
        .filter((e) => e.section !== "profile" && decisions[e.id] === "imported")
        .map((e) => ({
          section: e.section,
          existing_id: e.existing_id,
          data: (overrides[e.id] ?? e.incoming) as Record<string, unknown>,
        })),
    ];

    const deletions: ApplyDelete[] = removes
      .filter((e) => decisions[e.id] === "remove" && e.existing_id !== null)
      .map((e) => ({ section: e.section, id: e.existing_id! }));

    setApplying(true);
    try {
      const result = await applyReconcile({
        source,
        source_detail: sourceDetail,
        profile_fields,
        items,
        deletions,
      });
      toast.success(
        isReplaceMode ? "Profile Replaced" : "Profile Merged",
        `Updated ${result.profile_fields} identity fields, added ${result.added}, updated ${result.updated}${
          result.deleted ? `, deleted ${result.deleted}` : ""
        }.`,
      );
      onApplied(result);
    } catch (err) {
      toast.danger("Couldn't save changes", errorMessage(err));
    } finally {
      setApplying(false);
    }
  }

  const acceptedNew = news.filter((e) => add[e.id]).length;
  const acceptedImports = conflicts.filter((e) => decisions[e.id] === "imported").length;
  const acceptedRemovals = removes.filter((e) => decisions[e.id] === "remove").length;

  return (
    <div className="cll-fade flex flex-col gap-5">
      {/* ── Banner Header ── */}
      <div className="rounded-[14px] border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-weak text-accent-text">
              <GitCompare size={18} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-fg">
                {isReplaceMode ? "Replace Review & Confirmation" : "AI Merge & Reconcile Review"}
              </h3>
              <p className="text-[11.5px] text-fg-mid">
                {isReplaceMode
                  ? "Review items to replace, add, or remove. Nothing will be deleted until you confirm."
                  : "Review AI-matched suggestions, resolve conflicts, and accept new profile items."}
              </p>
            </div>
          </div>
          <Pill tone={plan.ai ? "accent" : "neutral"} mono>
            {plan.ai ? <Sparkles size={10} /> : null}
            {plan.ai ? "AI-Evaluated" : "Deterministic Match"}
          </Pill>
        </div>
      </div>

      {nothingToDo ? (
        <div className="rounded-[14px] border border-border bg-surface px-5 py-8 text-center">
          <p className="text-[14px] font-semibold text-fg">No Changes Required</p>
          <p className="mt-1 text-[12.5px] text-fg-mid">All entries match your current profile perfectly.</p>
        </div>
      ) : null}

      {/* ── Conflicts / Replace Items ── */}
      {conflicts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wide uppercase text-warning">
              {isReplaceMode ? `Items to Update / Replace · ${conflicts.length}` : `Requires Decision · ${conflicts.length}`}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setDecisions((p) => ({
                    ...p,
                    ...Object.fromEntries(conflicts.map((e) => [e.id, "imported"])),
                  }))
                }
                className="rounded-[7px] border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-mid transition-colors hover:border-accent hover:text-accent-text"
              >
                Use imported (all)
              </button>
              <button
                type="button"
                onClick={() =>
                  setDecisions((p) => ({
                    ...p,
                    ...Object.fromEntries(conflicts.map((e) => [e.id, "existing"])),
                  }))
                }
                className="rounded-[7px] border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-mid transition-colors hover:border-border-strong hover:text-fg"
              >
                Keep existing (all)
              </button>
            </div>
          </div>
          {conflicts.map((e) => (
            <ConflictCard
              key={e.id}
              entry={e}
              decision={decisions[e.id] ?? "existing"}
              override={overrides[e.id]}
              isEditing={editingId === e.id}
              onToggleEdit={() => setEditingId(editingId === e.id ? null : e.id)}
              onSaveOverride={(val) => setOverrides((p) => ({ ...p, [e.id]: val }))}
              onChange={(d) => setDecisions((p) => ({ ...p, [e.id]: d }))}
            />
          ))}
        </section>
      ) : null}

      {/* ── Removals (Replace Mode) ── */}
      {removes.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wide uppercase text-danger">
              Items to be Removed ({acceptedRemovals}/{removes.length})
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setDecisions((p) => ({
                    ...p,
                    ...Object.fromEntries(removes.map((e) => [e.id, "remove"])),
                  }))
                }
                className="rounded-[7px] border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-danger transition-colors hover:border-danger/40"
              >
                Remove all
              </button>
              <button
                type="button"
                onClick={() =>
                  setDecisions((p) => ({
                    ...p,
                    ...Object.fromEntries(removes.map((e) => [e.id, "keep"])),
                  }))
                }
                className="rounded-[7px] border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-mid transition-colors hover:border-border-strong hover:text-fg"
              >
                Keep all (preserve)
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {removes.map((e) => (
              <RemoveCard
                key={e.id}
                entry={e}
                willRemove={decisions[e.id] === "remove"}
                onToggle={() =>
                  setDecisions((p) => ({
                    ...p,
                    [e.id]: p[e.id] === "remove" ? "keep" : "remove",
                  }))
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── New Items (Add) ── */}
      {news.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wide uppercase text-success">
              New Items to Add ({acceptedNew}/{news.length})
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setAdd(Object.fromEntries(news.map((e) => [e.id, true])))}
                className="rounded-[7px] border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-mid transition-colors hover:border-accent hover:text-accent-text"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setAdd(Object.fromEntries(news.map((e) => [e.id, false])))}
                className="rounded-[7px] border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg-mid transition-colors hover:border-border-strong hover:text-fg"
              >
                Deselect all
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {news.map((e) => (
              <NewCard
                key={e.id}
                entry={e}
                checked={add[e.id]}
                onToggle={() => setAdd((p) => ({ ...p, [e.id]: !p[e.id] }))}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Auto-filled Blanks & Unchanged ── */}
      {fills.length > 0 || sames.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-[12px] border border-border bg-surface-2 p-3.5">
          {fills.length > 0 ? (
            <p className="flex items-center gap-2 text-[12px] text-fg-mid">
              <Check size={14} className="shrink-0 text-success" />
              {fills.length} blank identity {fills.length === 1 ? "field" : "fields"} will be populated (
              {fills.map((e) => e.label).join(", ")})
            </p>
          ) : null}
          {sames.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setShowSame((s) => !s)}
                className="flex items-center gap-2 text-left text-[12px] text-fg-low transition-colors hover:text-fg-mid"
              >
                <ChevronDown size={14} className={cn("shrink-0 transition-transform", showSame && "rotate-180")} />
                {sames.length} existing items already match — no changes needed
              </button>
              {showSame ? (
                <div className="flex flex-wrap gap-1.5 pl-6 pt-2">
                  {sames.map((e) => (
                    <span
                      key={e.id}
                      className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] text-fg-low"
                    >
                      {e.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Footer Stats & Actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-2 text-[11.5px] text-fg-mid">
          <ShieldCheck size={15} className="text-accent shrink-0" />
          <span>
            {acceptedNew} to add · {acceptedImports} to update
            {isReplaceMode && acceptedRemovals ? ` · ${acceptedRemovals} to remove` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={onDiscard} disabled={applying}>
            Discard
          </Button>
          <Button variant="primary" size="md" loading={applying} onClick={onApply} disabled={nothingToDo}>
            <Check size={14} /> Apply to profile
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Source Badge Helper ────────────────────────────────────────── */
function SourceBadge({ source }: { source?: string | null }) {
  if (!source) return null;
  const s = source.toLowerCase();
  const label =
    s === "manual" ? "Manual" : s === "linkedin" ? "LinkedIn" : s === "github" ? "GitHub" : "CV Import";
  const tone =
    s === "manual"
      ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
      : s === "linkedin"
      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
      : s === "github"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : "bg-amber-500/10 text-amber-400 border-amber-500/20";

  return (
    <span className={cn("rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide uppercase", tone)}>
      {label}
    </span>
  );
}

function SectionChip({ section }: { section: string }) {
  return (
    <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.3px] text-fg-low">
      {SECTION_LABEL[section] ?? section}
    </span>
  );
}

/* ── Conflict / Replace Card ────────────────────────────────────── */
function ConflictCard({
  entry,
  decision,
  override,
  isEditing,
  onToggleEdit,
  onSaveOverride,
  onChange,
}: {
  entry: ReconcileEntry;
  decision: Decision;
  override?: Record<string, unknown>;
  isEditing: boolean;
  onToggleEdit: () => void;
  onSaveOverride: (v: Record<string, unknown>) => void;
  onChange: (d: Decision) => void;
}) {
  const isProfile = entry.section === "profile";
  const activeIncoming = override ?? entry.incoming;

  return (
    <div className="rounded-[13px] border border-border bg-surface p-4 shadow-xs transition-all hover:border-border-strong">
      <div className="flex flex-wrap items-center gap-2">
        <SectionChip section={entry.section} />
        <span className="text-[13px] font-semibold text-fg">{entry.label}</span>
        <SourceBadge source={entry.existing_source} />
        {entry.recommend ? (
          <Pill tone="accent" className="ml-auto" mono>
            AI Rec: {entry.recommend}
          </Pill>
        ) : null}
        <button
          type="button"
          onClick={onToggleEdit}
          className="ml-1 rounded-md p-1 text-fg-low hover:bg-surface-2 hover:text-fg"
          title="Tweak imported text before applying"
        >
          <Edit3 size={13} />
        </button>
      </div>

      {entry.note ? <p className="mt-1.5 text-[11.5px] text-fg-mid">{entry.note}</p> : null}

      <div className="mt-3 flex flex-col gap-1.5">
        {isProfile ? (
          <DiffRow field={null} existing={entry.existing} incoming={activeIncoming} />
        ) : (
          (entry.diff ?? []).map((d) => (
            <DiffRow key={d.field} field={d.field} existing={d.existing} incoming={(activeIncoming as any)?.[d.field] ?? d.incoming} />
          ))
        )}
      </div>

      {isEditing ? (
        <div className="mt-3 rounded-[10px] border border-border-strong bg-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-fg">Inline Tweak</span>
            <button type="button" onClick={onToggleEdit} className="text-fg-low hover:text-fg">
              <X size={13} />
            </button>
          </div>
          {isProfile ? (
            <input
              type="text"
              defaultValue={String(activeIncoming ?? "")}
              onChange={(e) => onSaveOverride({ value: e.target.value })}
              className="w-full rounded-[8px] border border-border bg-input px-2.5 py-1.5 text-[12px] text-fg focus:border-accent focus:outline-none"
            />
          ) : (
            <textarea
              rows={3}
              defaultValue={typeof activeIncoming === "object" ? JSON.stringify(activeIncoming, null, 2) : String(activeIncoming)}
              onChange={(e) => {
                try {
                  onSaveOverride(JSON.parse(e.target.value));
                } catch {
                  // user is still typing JSON
                }
              }}
              className="w-full rounded-[8px] border border-border bg-input p-2 font-mono text-[11px] text-fg focus:border-accent focus:outline-none"
            />
          )}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <div className="inline-flex rounded-[9px] border border-border bg-input p-0.5">
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
    </div>
  );
}

function DiffRow({ field, existing, incoming }: { field: string | null; existing: unknown; incoming: unknown }) {
  return (
    <div className="grid grid-cols-[85px_1fr] items-baseline gap-2 text-[12px]">
      <span className="truncate text-fg-low font-medium">{field ? FIELD_LABEL[field] ?? field : "Value"}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-fg-low line-through decoration-danger/40">{show(existing)}</span>
        <ArrowRight size={11} className="shrink-0 text-fg-low" />
        <span className="font-semibold text-fg">{show(incoming)}</span>
      </span>
    </div>
  );
}

/* ── Removal Card (Replace Mode) ───────────────────────────────── */
function RemoveCard({
  entry,
  willRemove,
  onToggle,
}: {
  entry: ReconcileEntry;
  willRemove: boolean;
  onToggle: () => void;
}) {
  const ext = (entry.existing ?? {}) as Record<string, unknown>;
  const sub = show(ext.description ?? ext.institution ?? ext.issuer ?? ext.url ?? "");

  return (
    <div
      onClick={onToggle}
      className={cn(
        "flex cursor-pointer items-start justify-between gap-3 rounded-[12px] border p-3 transition-colors",
        willRemove ? "border-danger/40 bg-danger/5" : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <SectionChip section={entry.section} />
          <span className={cn("truncate text-[12.5px] font-semibold", willRemove ? "text-danger line-through" : "text-fg")}>
            {entry.label}
          </span>
          <SourceBadge source={entry.existing_source} />
        </div>
        {sub !== "—" ? <span className="mt-1 block truncate text-[11px] text-fg-mid">{sub}</span> : null}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          "rounded-md p-1.5 text-[11px] font-medium transition-colors",
          willRemove ? "bg-danger/10 text-danger hover:bg-danger/20" : "bg-surface-2 text-fg-mid hover:text-fg",
        )}
      >
        {willRemove ? <Trash2 size={13} /> : "Preserve"}
      </button>
    </div>
  );
}

/* ── New Item Card ─────────────────────────────────────────────── */
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
