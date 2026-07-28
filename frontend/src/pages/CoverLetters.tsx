import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, FileText, Plus, Search, Trash2, Undo2, X } from "lucide-react";
import { Page } from "@/components/common/Page";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Pill, StatDot } from "@/components/ui/feedback";
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

function timeValue(iso?: string | null): number {
  const parsed = Date.parse(iso ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortByRecent(rows: JobWithId[]): JobWithId[] {
  return [...rows].sort((a, b) => timeValue(b.updated_at ?? b.created_at) - timeValue(a.updated_at ?? a.created_at));
}

/* ── Filter select ───────────────────────────────────────────────── */
type Option = { value: string; label: string };

function FilterSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Option[] }) {
  return (
    <div className="relative flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded-[10px] border border-border-strong bg-input py-[9px] pl-[13px] pr-9 text-[13px] text-fg-mid outline-none transition-colors hover:border-accent focus-visible:border-accent"
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
              "flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors",
              active ? "bg-accent-weak text-accent-text" : "text-fg-mid hover:text-fg",
            )}
          >
            {it.label}
            <span className={cn("text-[10px] font-semibold tabular-nums", active ? "text-accent-text" : "text-fg-low")}>
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
        "grid h-8 w-8 place-items-center rounded-[10px] border border-transparent bg-surface text-fg-low transition-colors hover:border-border hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40",
        danger ? "hover:text-danger" : "hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function StatusBadge({ completed, hasText }: { completed: boolean; hasText: boolean }) {
  if (completed) {
    return (
      <Pill tone="success" dot mono className="border border-success/20 bg-success/10 px-2 py-0.5 text-success">
        Completed
      </Pill>
    );
  }

  if (hasText) {
    return (
      <Pill tone="warning" dot mono className="border border-warning/20 bg-warning/10 px-2 py-0.5 text-warning">
        Draft
      </Pill>
    );
  }

  return (
    <Pill tone="accent" dot mono className="border border-accent/20 bg-accent-weak px-2 py-0.5 text-accent-text">
      New
    </Pill>
  );
}

/* ── Letter row ──────────────────────────────────────────────────── */
function LetterRow({
  job,
  busy,
  onToggle,
  onDelete,
}: {
  job: JobWithId;
  busy: boolean;
  onToggle: (job: JobWithId) => void;
  onDelete: (job: JobWithId) => void;
}) {
  const completed = isCompleted(job);
  const snippet = snippetOf(job);
  const when = relativeTime(job.updated_at ?? job.created_at);
  const hasText = snippet.length > 0;
  const preview = completed
    ? snippet || "Letter is ready to revisit."
    : hasText
      ? snippet
      : "Saved role, ready for drafting.";

  return (
    <div
      className={cn(
        "group rounded-[14px] border border-border bg-surface/88 px-4 py-3.5 transition-all hover:border-border-strong hover:bg-surface-2 hover:shadow-[0_18px_44px_-32px_rgba(41,182,246,0.32)]",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <Link to={`/write?job=${job.id}`} className="flex min-w-0 flex-1 items-start gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-border-strong bg-[linear-gradient(135deg,var(--surface),var(--surface-2))] text-[14px] font-bold text-accent-text shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            {initialOf(job)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="truncate text-[14px] font-semibold tracking-[-0.02em] text-fg">{job.role}</span>
              <span className="h-[4px] w-[4px] shrink-0 rounded-full bg-fg-low/70" />
              <span className="shrink-0 whitespace-nowrap text-[12px] text-fg-mid">{job.company}</span>
              <StatusBadge completed={completed} hasText={hasText} />
            </div>
            <p className="mt-1.5 overflow-hidden text-[12px] leading-[1.5] text-fg-mid [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1]">
              {preview}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-fg-low">
              {when ? (
                <span className="rounded-full border border-border bg-surface px-2.5 py-1 font-mono">
                  Updated {when}
                </span>
              ) : null}
            </div>
          </div>
        </Link>

        <div className="flex shrink-0 items-center justify-between gap-2.5 pl-[54px] lg:justify-end lg:pl-4">
          <Link
            to={`/write?job=${job.id}`}
            className="inline-flex items-center gap-1 rounded-[10px] border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-fg-mid transition-colors hover:border-accent hover:text-fg"
          >
            Open
            <ArrowRight size={12} />
          </Link>
          <div className="flex items-center gap-1.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
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
      </div>
    </div>
  );
}

function WorkspaceSummary({ jobs }: { jobs: JobWithId[] }) {
  const drafts = jobs.filter((j) => !isCompleted(j));
  const completed = jobs.filter((j) => isCompleted(j));
  const latestDraft = sortByRecent(drafts)[0] ?? null;

  return (
    <div className="cll-fade relative overflow-hidden rounded-[16px] border border-border bg-[linear-gradient(135deg,var(--surface-2),var(--surface))] px-4 py-3.5">
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-56 rounded-full bg-[var(--glow-1)] opacity-25 blur-3xl" />
      <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-[17px] font-semibold tracking-[-0.03em] text-fg">
            {jobs.length} saved letter{jobs.length === 1 ? "" : "s"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-fg-mid">
            <span>{drafts.length} draft{drafts.length === 1 ? "" : "s"}</span>
            <span className="h-[4px] w-[4px] rounded-full bg-fg-low/60" />
            <span>{completed.length} completed</span>
          </div>
        </div>
        {latestDraft ? (
          <Link
            to={`/write?job=${latestDraft.id}`}
            className="inline-flex items-center gap-2 self-start rounded-[11px] border border-border bg-surface px-3 py-2 text-[11.5px] font-medium text-fg-mid transition-colors hover:border-accent hover:text-fg"
          >
            Continue latest draft
            <span className="truncate text-fg">{latestDraft.role}</span>
            <ArrowRight size={12} className="shrink-0 text-accent-text" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ActiveFilters({
  query,
  company,
  role,
  segment,
  clearAll,
}: {
  query: string;
  company: string;
  role: string;
  segment: Segment;
  clearAll: () => void;
}) {
  const chips = [
    query.trim() ? `Search: ${query.trim()}` : null,
    company ? `Company: ${company}` : null,
    role ? `Role: ${role}` : null,
    segment !== "all" ? `Status: ${segment === "draft" ? "Drafts" : "Completed"}` : null,
  ].filter(Boolean) as string[];

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      {chips.map((chip) => (
        <span key={chip} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-fg-mid">
          {chip}
        </span>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="ml-auto rounded-[9px] border border-border bg-surface px-3 py-1.5 text-[11.5px] font-medium text-fg-mid transition-colors hover:border-accent hover:text-fg"
      >
        Clear all
      </button>
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
    <div className="cll-fade overflow-hidden rounded-[16px] border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3.5">
        <StatDot tone={tone} glow size={8} />
        <span className="text-[13.5px] font-semibold tracking-[-0.2px] text-fg">{title}</span>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-fg-low">
          {rows.length}
        </span>
        <span className="ml-auto text-[11px] text-fg-mid">{meta}</span>
      </div>
      <div className="flex flex-col gap-2.5 p-2.5">
        {rows.map((job) => (
          <LetterRow
            key={job.id}
            job={job}
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

  const drafts = sortByRecent(matches.filter((j) => !isCompleted(j)));
  const completed = sortByRecent(matches.filter((j) => isCompleted(j)));

  const hasFilters = query.trim() !== "" || company !== "" || role !== "" || segment !== "all";

  const clearAll = () => {
    setQuery("");
    setCompany("");
    setRole("");
    setSegment("all");
  };

  return (
    <div className="flex flex-col gap-5">
      <WorkspaceSummary jobs={jobs} />

      <div className="cll-fade rounded-[16px] border border-border bg-surface p-3.5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[12px] font-semibold text-fg">Filter letters</div>
            <SegmentFilter value={segment} onChange={setSegment} counts={segmentCounts} />
          </div>

          <div className="flex flex-col gap-2.5 xl:flex-row">
            <div className="flex min-w-[220px] flex-1 items-center gap-2.5 rounded-[12px] border border-border-strong bg-input px-[13px] py-[10px]">
              <Search size={15} className="shrink-0 text-fg-low" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by company or role…"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-low"
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
            <div className="flex flex-wrap gap-2.5">
              <FilterSelect value={company} onChange={setCompany} options={companyOptions} />
              <FilterSelect value={role} onChange={setRole} options={roleOptions} />
            </div>
          </div>

          <ActiveFilters query={query} company={company} role={role} segment={segment} clearAll={clearAll} />
        </div>
      </div>

      {/* Results / no-results */}
      {matches.length > 0 ? (
        <div className="flex shrink-0 flex-col gap-4">
          {drafts.length > 0 ? (
            <LetterGroup
              title="Drafts"
              tone="warning"
              meta={drafts.length === 1 ? "1 in progress" : `${drafts.length} in progress`}
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
              meta={completed.length === 1 ? "1 ready to revisit" : `${completed.length} ready to revisit`}
              rows={completed}
              busyId={busyId}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ) : null}
        </div>
      ) : (
        <div className="cll-fade mx-auto my-7 max-w-[420px] rounded-[18px] border border-border bg-surface px-6 py-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] border border-border bg-surface-2">
            <Search size={24} strokeWidth={1.5} className="text-fg-low" />
          </div>
          <div className="text-[17px] font-semibold text-fg">No letters match these filters</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-fg-mid">
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
            className="mt-[18px] rounded-[10px] border border-border-strong bg-surface-2 px-4 py-[9px] text-[12.5px] text-fg transition-colors hover:border-accent hover:bg-surface disabled:opacity-45"
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
      <div className="cll-fade mx-auto max-w-[520px] rounded-[18px] border border-border bg-[linear-gradient(135deg,var(--surface-2),var(--surface))] px-8 py-8 text-center">
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
        <div className="text-[20px] font-bold tracking-[-0.3px] text-fg">No cover letters yet</div>
        <p className="mt-2.5 text-[13.5px] leading-[1.7] text-fg-mid">
          Generate a tailored, on-device cover letter for any role — grounded in your profile and written in your own
          voice. Your drafts and completed letters will live here.
        </p>
        <div className="mt-[22px] flex flex-wrap justify-center gap-2.5">
          <Button asChild variant="primary" size="lg">
            <Link to="/write">
              <Plus size={15} strokeWidth={1.8} /> Write your first cover letter
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/onboarding">
              <FileText size={15} strokeWidth={1.8} /> Add CV first
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */
export function CoverLetters() {
  const jobs = useAsync(listJobs, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const routeParams = useParams<{ jobId?: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (routeParams.jobId) {
      navigate(`/write/${routeParams.jobId}`, { replace: true });
    }
  }, [routeParams.jobId, navigate]);

  const query = searchParams.get("q") ?? "";
  const setQuery = (v: string) => setSearchParams((p) => { const n = new URLSearchParams(p); if (v) n.set("q", v); else n.delete("q"); return n; }, { replace: true });

  const company = searchParams.get("company") ?? "";
  const setCompany = (v: string) => setSearchParams((p) => { const n = new URLSearchParams(p); if (v) n.set("company", v); else n.delete("company"); return n; }, { replace: true });

  const role = searchParams.get("role") ?? "";
  const setRole = (v: string) => setSearchParams((p) => { const n = new URLSearchParams(p); if (v) n.set("role", v); else n.delete("role"); return n; }, { replace: true });

  const rawSegment = searchParams.get("filter") as Segment | null;
  const segment: Segment = rawSegment && ["all", "draft", "completed"].includes(rawSegment) ? rawSegment : "all";
  const setSegment = (v: Segment) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("filter", v); return n; }, { replace: true });

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
      subtitle="Browse every saved application, resume the right draft fast, and keep finished letters close at hand."
      actions={
        <Button asChild variant="primary">
          <Link to="/write">
            <Plus size={15} strokeWidth={1.8} /> New Cover Letter
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
