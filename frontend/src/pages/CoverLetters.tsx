import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, Plus, Search, X } from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { StatDot } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

/* ── Data model ──────────────────────────────────────────────────
   Backend wiring is deferred; the "PREVIEW STATE" switcher (from the
   design) toggles between the populated workspace and the first-run
   empty screen. Within the populated view the toolbar is live: search,
   company / role selects and the All / Drafts / Completed segment all
   filter local state, and an empty match set surfaces the design's
   "No letters found" screen. */
type LetterStatus = "draft" | "completed";

type Letter = {
  id: string;
  initial: string;
  role: string;
  company: string;
  snippet: string;
  match: number;
  status: LetterStatus;
  date: string;
};

const LETTERS: Letter[] = [
  {
    id: "l-anthropic",
    initial: "A",
    role: "ML Engineer",
    company: "Anthropic",
    snippet: "I've spent four years shipping ML systems and want to help make them safe.",
    match: 74,
    status: "draft",
    date: "2h",
  },
  {
    id: "l-mistral",
    initial: "M",
    role: "Research Engineer",
    company: "Mistral",
    snippet: "Open-weight models are why I got into research — I'd love to build them with you.",
    match: 90,
    status: "draft",
    date: "1d",
  },
  {
    id: "l-cohere",
    initial: "C",
    role: "Applied Scientist",
    company: "Cohere",
    snippet: "Your work on retrieval-augmented generation maps directly to my last two roles.",
    match: 68,
    status: "draft",
    date: "3d",
  },
  {
    id: "l-huggingface",
    initial: "H",
    role: "Platform Engineer",
    company: "Hugging Face",
    snippet: "I maintain three open-source libraries and live in the tooling layer every day.",
    match: 94,
    status: "completed",
    date: "2d",
  },
  {
    id: "l-openai",
    initial: "O",
    role: "Research Engineer",
    company: "OpenAI",
    snippet: "Scaling training infrastructure is the problem I keep coming back to.",
    match: 96,
    status: "completed",
    date: "5d",
  },
  {
    id: "l-deepmind",
    initial: "D",
    role: "Research Scientist",
    company: "Google DeepMind",
    snippet: "My thesis on sample-efficient RL lines up closely with your recent papers.",
    match: 89,
    status: "completed",
    date: "1w",
  },
];

/* ── Preview state ───────────────────────────────────────────────── */
type ScreenState = "populated" | "empty";

const STATE_OPTIONS: { value: ScreenState; label: string; desc: string }[] = [
  { value: "populated", label: "Has letters", desc: "Drafts and completed letters" },
  { value: "empty", label: "First run", desc: "No cover letters yet" },
];

/* ── Match pill ──────────────────────────────────────────────────── */
type MatchTone = "success" | "accent" | "warning";

function matchTone(match: number): MatchTone {
  if (match >= 90) return "success";
  if (match >= 75) return "accent";
  return "warning";
}

const matchToneCls: Record<MatchTone, string> = {
  success: "bg-success-weak text-success",
  accent: "bg-accent-weak text-accent-text",
  warning: "bg-warning-weak text-warning",
};

function MatchPill({ match }: { match: number }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums",
        matchToneCls[matchTone(match)],
      )}
    >
      {match} match
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

/* ── Letter row ──────────────────────────────────────────────────── */
function LetterRow({ letter, last }: { letter: Letter; last: boolean }) {
  return (
    <Link
      to="/write"
      className={cn(
        "flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-surface-2",
        !last && "border-b border-border",
      )}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-border bg-surface-2 text-[15px] font-bold text-accent-text">
        {letter.initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-fg">{letter.role}</span>
          <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-fg-low" />
          <span className="shrink-0 whitespace-nowrap text-[12px] text-fg-mid">{letter.company}</span>
        </div>
        <div className="mt-1 truncate text-[12px] text-fg-low">{letter.snippet}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <MatchPill match={letter.match} />
        <span className="w-[54px] text-right text-[11px] tabular-nums text-fg-low">{letter.date}</span>
        <ChevronRight size={16} className="text-fg-low" />
      </div>
    </Link>
  );
}

/* ── Letter group (Drafts / Completed) ───────────────────────────── */
function LetterGroup({
  title,
  tone,
  meta,
  rows,
}: {
  title: string;
  tone: "warning" | "success";
  meta: string;
  rows: Letter[];
}) {
  return (
    <div>
      <div className="mb-[11px] flex items-center gap-2.5 px-[3px]">
        <StatDot tone={tone} glow size={8} />
        <span className="text-[13px] font-semibold tracking-[-0.2px] text-fg">{title}</span>
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-fg-low">
          {rows.length}
        </span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[1px] text-fg-low">{meta}</span>
      </div>
      <div className="cll-fade overflow-hidden rounded-[14px] border border-border bg-surface">
        {rows.map((l, i) => (
          <LetterRow key={l.id} letter={l} last={i === rows.length - 1} />
        ))}
      </div>
    </div>
  );
}

/* ── Preview-state switcher (mirrors Home.tsx) ───────────────────── */
function StateSwitcher({ state, onPick }: { state: ScreenState; onPick: (s: ScreenState) => void }) {
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

/* ── Populated workspace (toolbar + grouped results / no-results) ── */
function LettersWorkspace() {
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [segment, setSegment] = useState<Segment>("all");

  const companyOptions = useMemo<Option[]>(() => {
    const names = Array.from(new Set(LETTERS.map((l) => l.company)));
    return [{ value: "", label: "All companies" }, ...names.map((n) => ({ value: n, label: n }))];
  }, []);
  const roleOptions = useMemo<Option[]>(() => {
    const names = Array.from(new Set(LETTERS.map((l) => l.role)));
    return [{ value: "", label: "All roles" }, ...names.map((n) => ({ value: n, label: n }))];
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LETTERS.filter((l) => {
      if (q && !`${l.company} ${l.role}`.toLowerCase().includes(q)) return false;
      if (company && l.company !== company) return false;
      if (role && l.role !== role) return false;
      if (segment !== "all" && l.status !== segment) return false;
      return true;
    });
  }, [query, company, role, segment]);

  // Segment counts reflect search + company + role, but ignore the segment itself.
  const segmentCounts = useMemo<Record<Segment, number>>(() => {
    const q = query.trim().toLowerCase();
    const scoped = LETTERS.filter((l) => {
      if (q && !`${l.company} ${l.role}`.toLowerCase().includes(q)) return false;
      if (company && l.company !== company) return false;
      if (role && l.role !== role) return false;
      return true;
    });
    return {
      all: scoped.length,
      draft: scoped.filter((l) => l.status === "draft").length,
      completed: scoped.filter((l) => l.status === "completed").length,
    };
  }, [query, company, role]);

  const drafts = matches.filter((l) => l.status === "draft");
  const completed = matches.filter((l) => l.status === "completed");
  const avg = (rows: Letter[]) => Math.round(rows.reduce((s, l) => s + l.match, 0) / rows.length);

  const hasFilters = query.trim() !== "" || company !== "" || role !== "" || segment !== "all";

  const clearAll = () => {
    setQuery("");
    setCompany("");
    setRole("");
    setSegment("all");
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="flex min-w-[220px] max-w-[320px] flex-1 items-center gap-2.5 rounded-[10px] border border-border-strong bg-input px-[13px] py-[9px]">
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
        <FilterSelect value={company} onChange={setCompany} options={companyOptions} />
        <FilterSelect value={role} onChange={setRole} options={roleOptions} />
        <SegmentFilter value={segment} onChange={setSegment} counts={segmentCounts} />
      </div>

      {/* Results / no-results */}
      {matches.length > 0 ? (
        <div className="flex shrink-0 flex-col gap-[22px]">
          {drafts.length > 0 ? (
            <LetterGroup title="Drafts" tone="warning" meta={`${drafts.length} in progress`} rows={drafts} />
          ) : null}
          {completed.length > 0 ? (
            <LetterGroup title="Completed" tone="success" meta={`avg ${avg(completed)} match`} rows={completed} />
          ) : null}
        </div>
      ) : (
        <div className="cll-fade mx-auto my-9 max-w-[380px] text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] border border-border bg-surface">
            <Search size={24} strokeWidth={1.5} className="text-fg-low" />
          </div>
          <div className="text-[16px] font-semibold text-fg">No letters found</div>
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
            className="mt-[18px] rounded-[10px] border border-border-strong bg-surface px-4 py-[9px] text-[12.5px] text-fg transition-colors hover:bg-surface-2 disabled:opacity-45"
          >
            Clear search &amp; filters
          </button>
        </div>
      )}
    </>
  );
}

/* ── First-run empty screen ──────────────────────────────────────── */
function LettersEmpty() {
  return (
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
      <div className="text-[20px] font-bold tracking-[-0.3px] text-fg">No cover letters yet</div>
      <p className="mt-2.5 text-[13.5px] leading-[1.7] text-fg-mid">
        Generate a tailored, on-device cover letter for any role — grounded in your profile and written in your own
        voice. Your drafts and sent letters will live here.
      </p>
      <Button asChild variant="primary" size="lg" className="mt-[22px]">
        <Link to="/write">
          <Plus size={15} strokeWidth={1.8} /> Write your first letter
        </Link>
      </Button>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */
export function CoverLetters() {
  const [state, setState] = useState<ScreenState>("populated");
  return (
    <Page
      eyebrow="WORKSPACE / COVER LETTERS"
      title="Cover Letters"
      actions={
        <>
          <StateSwitcher state={state} onPick={setState} />
          <Button asChild variant="primary">
            <Link to="/write">
              <Plus size={15} strokeWidth={1.8} /> New letter
            </Link>
          </Button>
        </>
      }
      bodyClassName="px-7 py-5"
    >
      <div className={cn("flex flex-col gap-[18px]", state === "empty" && "min-h-full justify-center")}>
        {state === "populated" ? <LettersWorkspace /> : <LettersEmpty />}
      </div>
    </Page>
  );
}
