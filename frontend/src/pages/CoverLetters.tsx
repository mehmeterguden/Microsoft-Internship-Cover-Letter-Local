import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Plus, Search, Trash2, Undo2, X } from "lucide-react";
import { Page } from "@/components/common/Page";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { StatDot } from "@/components/ui/feedback";
import { useAsync } from "@/lib/useAsync";
import { deleteJob, listJobs, updateJob } from "@/api/jobs";
import type { Job } from "@/api/types";
import { toast } from "@/store/toast";
import { cn, relativeTime } from "@/lib/utils";

/* ── Data model ──────────────────────────────────────────────────
   Wired to the real /jobs API. Jobs are split into Drafts vs Completed
   by `job.letter?.completed`. The toolbar (search + company / role
   selects + All / Drafts / Completed segment) filters the live list;
   an empty match set surfaces the "No letters found" screen, while a
   truly empty account shows the designed first-run empty state. */

/** A job that has been persisted (always has a numeric id). */
type JobWithId = Job & { id: number };

const isCompleted = (job: Job): boolean => job.letter?.completed === true;

/** First non-empty line of the saved letter, whitespace-collapsed. */
const snippetOf = (job: Job): string => (job.letter?.text ?? "").replace(/\s+/g, " ").trim();

const initialOf = (job: Job): string => job.company.trim().charAt(0).toUpperCase() || "?";

/** Average match score across rows that carry one (else null). */
function avgMatch(rows: JobWithId[]): number | null {
  const scores = rows.map((j) => j.match_score).filter((s): s is number => typeof s === "number");
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/* ── Match label (kept subtle — this is not "how compatible you are") ── */
function MatchPill({ score }: { score: number }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[12px] tabular-nums text-fg-low">
      {Math.round(score)} match
    </span>
  );
}

/* ── Filter select ───────────────────────────────────────────────── */
type Option = { value: string; label: string };

function FilterSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Option[] }) {
  return (
    <div className="relative flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded-[10px] border border-border-strong bg-input py-[9px] pl-[13px] pr-9 text-[14px] text-fg-mid outline-none transition-colors hover:border-accent focus-visible:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface-2 text-fg">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-[11px] text-fg-low" />
    </div>
  );
}

/* ── Segment filter (All / Drafts / Completed) ───────────────────── */
type Segment = "all" | "draft" | "completed";

function SegmentFilter({
  value,
  onChange,
  counts,
}: {
  value: Segment;
  onChange: (v: Segment) => void;
  counts: Record<Segment, number>;
}) {
  const items: { value: Segment; label: string }[] = [
    { value: "all", label: "All" },
    { value: "draft", label: "Drafts" },
    { value: "completed", label: "Completed" },
  ];
  return (
    <div className="ml-auto flex gap-[3px] rounded-[10px] border border-border bg-input p-[3px]">
      {items.map((it) => {
        const active = value === it.value;
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors",
              active ? "bg-accent-weak text-accent-text" : "text-fg-mid hover:text-fg",
            )}
          >
            {it.label}
            <span className={cn("text-[12px] font-semibold tabular-nums", active ? "text-accent-text" : "text-fg-low")}>
              {counts[it.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Row action icon button ──────────────────────────────────────── */
function RowAction({
  onClick,
  disabled,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-[9px] text-fg-low transition-colors hover:bg-surface-3 disabled:pointer-events-none disabled:opacity-40",
        danger ? "hover:text-danger" : "hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/* ── Letter row ──────────────────────────────────────────────────── */
function LetterRow({
  job,
  last,
  busy,
  onToggle,
  onDelete,
}: {
  job: JobWithId;
  last: boolean;
  busy: boolean;
  onToggle: (job: JobWithId) => void;
  onDelete: (job: JobWithId) => void;
}) {
  const completed = isCompleted(job);
  const snippet = snippetOf(job);
  const when = relativeTime(job.updated_at ?? job.created_at);
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-surface-2",
        !last && "border-b border-border",
      )}
    >
      <Link to={`/write?job=${job.id}`} className="flex min-w-0 flex-1 items-center gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-border bg-surface-2 text-[16px] font-bold text-accent-text">
          {initialOf(job)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-fg">{job.role}</span>
            <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-fg-low" />
            <span className="shrink-0 whitespace-nowrap text-[13px] text-fg-mid">{job.company}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[13px] text-fg-low">
            <span className="truncate">{snippet || "Not written yet"}</span>
            {when ? (
              <>
                <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-fg-low/60" />
                <span className="shrink-0 whitespace-nowrap font-mono text-[12px]">{when}</span>
              </>
            ) : null}
          </div>
        </div>
        {typeof job.match_score === "number" ? <MatchPill score={job.match_score} /> : null}
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        <RowAction
          onClick={() => onToggle(job)}
          disabled={busy}
          label={completed ? "Mark as draft" : "Mark completed"}
        >
          {completed ? <Undo2 size={15} /> : <Check size={15} strokeWidth={2.2} />}
        </RowAction>
        <RowAction onClick={() => onDelete(job)} disabled={busy} label="Delete letter" danger>
          <Trash2 size={15} />
        </RowAction>
      </div>
    </div>
  );
}

/* ── Letter group (Drafts / Completed) ───────────────────────────── */
function LetterGroup({
  title,
  tone,
  meta,
  rows,
  busyId,
  onToggle,
  onDelete,
}: {
  title: string;
  tone: "warning" | "success";
  meta: string;
  rows: JobWithId[];
  busyId: number | null;
  onToggle: (job: JobWithId) => void;
  onDelete: (job: JobWithId) => void;
}) {
  return (
    <div>
      <div className="mb-[11px] flex items-center gap-2.5 px-[3px]">
        <StatDot tone={tone} glow size={8} />
        <span className="text-[14px] font-semibold tracking-[-0.2px] text-fg">{title}</span>
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-fg-low">
          {rows.length}
        </span>
        <span className="ml-auto font-mono text-[12px] tracking-[0.02em] text-fg-low">{meta}</span>
      </div>
      <div className="cll-fade overflow-hidden rounded-[14px] border border-border bg-surface">
        {rows.map((job, i) => (
          <LetterRow
            key={job.id}
            job={job}
            last={i === rows.length - 1}
            busy={busyId === job.id}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Populated workspace (toolbar + grouped results / no-results) ── */
function LettersWorkspace({
  jobs,
  query,
  setQuery,
  company,
  setCompany,
  role,
  setRole,
  segment,
  setSegment,
  busyId,
  onToggle,
  onDelete,
}: {
  jobs: JobWithId[];
  query: string;
  setQuery: (v: string) => void;
  company: string;
  setCompany: (v: string) => void;
  role: string;
  setRole: (v: string) => void;
  segment: Segment;
  setSegment: (v: Segment) => void;
  busyId: number | null;
  onToggle: (job: JobWithId) => void;
  onDelete: (job: JobWithId) => void;
}) {
  const companyOptions = useMemo<Option[]>(() => {
    const names = Array.from(new Set(jobs.map((j) => j.company))).sort();
    return [{ value: "", label: "All companies" }, ...names.map((n) => ({ value: n, label: n }))];
  }, [jobs]);
  const roleOptions = useMemo<Option[]>(() => {
    const names = Array.from(new Set(jobs.map((j) => j.role))).sort();
    return [{ value: "", label: "All roles" }, ...names.map((n) => ({ value: n, label: n }))];
  }, [jobs]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (q && !`${j.company} ${j.role}`.toLowerCase().includes(q)) return false;
      if (company && j.company !== company) return false;
      if (role && j.role !== role) return false;
      if (segment === "draft" && isCompleted(j)) return false;
      if (segment === "completed" && !isCompleted(j)) return false;
      return true;
    });
  }, [jobs, query, company, role, segment]);

  // Segment counts reflect search + company + role, but ignore the segment itself.
  const segmentCounts = useMemo<Record<Segment, number>>(() => {
    const q = query.trim().toLowerCase();
    const scoped = jobs.filter((j) => {
      if (q && !`${j.company} ${j.role}`.toLowerCase().includes(q)) return false;
      if (company && j.company !== company) return false;
      if (role && j.role !== role) return false;
      return true;
    });
    return {
      all: scoped.length,
      draft: scoped.filter((j) => !isCompleted(j)).length,
      completed: scoped.filter((j) => isCompleted(j)).length,
    };
  }, [jobs, query, company, role]);

  const drafts = matches.filter((j) => !isCompleted(j));
  const completed = matches.filter((j) => isCompleted(j));
  const completedAvg = avgMatch(completed);

  const hasFilters = query.trim() !== "" || company !== "" || role !== "" || segment !== "all";

  const clearAll = () => {
    setQuery("");
    setCompany("");
    setRole("");
    setSegment("all");
  };

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="flex min-w-[220px] max-w-[320px] flex-1 items-center gap-2.5 rounded-[10px] border border-border-strong bg-input px-[13px] py-[9px]">
          <Search size={15} className="shrink-0 text-fg-low" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by company or role…"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-low"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="flex shrink-0 text-fg-low transition-colors hover:text-fg"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
        <FilterSelect value={company} onChange={setCompany} options={companyOptions} />
        <FilterSelect value={role} onChange={setRole} options={roleOptions} />
        <SegmentFilter value={segment} onChange={setSegment} counts={segmentCounts} />
      </div>

      {/* Results / no-results */}
      {matches.length > 0 ? (
        <div className="flex shrink-0 flex-col gap-[22px]">
          {drafts.length > 0 ? (
            <LetterGroup
              title="Drafts"
              tone="warning"
              meta={`${drafts.length} in progress`}
              rows={drafts}
              busyId={busyId}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ) : null}
          {completed.length > 0 ? (
            <LetterGroup
              title="Completed"
              tone="success"
              meta={completedAvg != null ? `avg ${completedAvg} match` : `${completed.length} ready`}
              rows={completed}
              busyId={busyId}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ) : null}
        </div>
      ) : (
        <div className="cll-fade mx-auto my-9 max-w-[380px] text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] border border-border bg-surface">
            <Search size={24} strokeWidth={1.5} className="text-fg-low" />
          </div>
          <div className="text-[18px] font-semibold text-fg">No letters found</div>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-mid">
            {query.trim() ? (
              <>
                Nothing matches “<span className="text-fg">{query.trim()}</span>”. Try a different search or filter.
              </>
            ) : (
              <>Nothing matches your current filters. Try a different search or filter.</>
            )}
          </p>
          <button
            type="button"
            onClick={clearAll}
            disabled={!hasFilters}
            className="mt-[18px] rounded-[10px] border border-border-strong bg-surface px-4 py-[9px] text-[13px] text-fg transition-colors hover:bg-surface-2 disabled:opacity-45"
          >
            Clear search &amp; filters
          </button>
        </div>
      )}
    </div>
  );
}

/* ── First-run empty screen ──────────────────────────────────────── */
function LettersEmpty() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center">
      <div className="cll-fade mx-auto max-w-[440px] py-5 text-center">
        <div className="relative mx-auto mb-5 flex h-[66px] w-[66px] items-center justify-center rounded-[18px] border border-border bg-accent-weak">
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent-text)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
            <path d="M3.5 7l8.5 6 8.5-6" />
          </svg>
        </div>
        <div className="text-[22px] font-bold tracking-[-0.3px] text-fg">No cover letters yet</div>
        <p className="mt-2.5 text-[15px] leading-[1.7] text-fg-mid">
          Generate a tailored, on-device cover letter for any role — grounded in your profile and written in your own
          voice. Your drafts and completed letters will live here.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-[22px]">
          <Link to="/write">
            <Plus size={15} strokeWidth={1.8} /> Write your first letter
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */
export function CoverLetters() {
  const jobs = useAsync(listJobs, []);

  // Toolbar filters are lifted here so they survive the AsyncBoundary
  // remount that a reload() (after a toggle / delete) triggers.
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [segment, setSegment] = useState<Segment>("all");

  const [pendingDelete, setPendingDelete] = useState<JobWithId | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const handleToggle = async (job: JobWithId) => {
    const next = !isCompleted(job);
    setBusyId(job.id);
    try {
      await updateJob(job.id, { ...job, letter: { ...(job.letter ?? {}), completed: next } });
      toast.success(next ? "Marked as completed" : "Moved back to drafts", `${job.role} — ${job.company}`);
      jobs.reload();
    } catch (e) {
      toast.danger("Couldn't update letter", e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    const job = pendingDelete;
    if (!job) return;
    setDeleting(true);
    try {
      await deleteJob(job.id);
      toast.success("Cover letter deleted", `${job.role} — ${job.company}`);
      setPendingDelete(null);
      jobs.reload();
    } catch (e) {
      toast.danger("Couldn't delete letter", e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Page
      eyebrow="Workspace / Cover Letters"
      title="Cover Letters"
      actions={
        <Button asChild variant="primary">
          <Link to="/write">
            <Plus size={15} strokeWidth={1.8} /> New letter
          </Link>
        </Button>
      }
      bodyClassName="px-7 py-5"
    >
      <AsyncBoundary
        state={jobs}
        isEmpty={(list) => list.length === 0}
        emptyView={<LettersEmpty />}
      >
        {(list) => (
          <LettersWorkspace
            jobs={list.filter((j): j is JobWithId => typeof j.id === "number")}
            query={query}
            setQuery={setQuery}
            company={company}
            setCompany={setCompany}
            role={role}
            setRole={setRole}
            segment={segment}
            setSegment={setSegment}
            busyId={busyId}
            onToggle={handleToggle}
            onDelete={setPendingDelete}
          />
        )}
      </AsyncBoundary>

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        tone="danger"
        icon={<Trash2 size={22} />}
        title="Delete this cover letter?"
        description={
          pendingDelete
            ? `“${pendingDelete.role} — ${pendingDelete.company}” will be permanently removed. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete letter"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </Page>
  );
}
