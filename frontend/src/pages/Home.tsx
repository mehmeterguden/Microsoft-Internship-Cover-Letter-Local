import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, PenLine, FileText, AudioLines, Github, Target, ShieldCheck, AudioWaveform, Star } from "lucide-react";
import { Page } from "@/components/common/Page";
import { ProjectBadge } from "@/components/common/ProjectBadge";
import { Button } from "@/components/ui/button";
import { Pill, StatDot, Skeleton } from "@/components/ui/feedback";
import { useAsync } from "@/lib/useAsync";
import { toast } from "@/store/toast";
import { getProfile, listSkills } from "@/api/profile";
import { getStyle } from "@/api/style";
import { listSavedRepos } from "@/api/githubRepos";
import { listJobs } from "@/api/jobs";
import type { Job } from "@/api/types";
import { cn } from "@/lib/utils";

/* ── State model ─────────────────────────────────────────────────
   Which home you get is DERIVED from your real data — CV/profile, writing
   voice, imported repos, and letters — and nothing else. There is no manual
   override: the page always shows where you actually are. */
type HomeState = "welcome" | "cv" | "ready" | "active" | "clean";

/* ── Rail ────────────────────────────────────────────────────────── */
type RailStatus = "done" | "active" | "todo" | "warn";
type RailStep = { label: string; status: RailStatus; pct?: number };

function Rail({ steps }: { steps: RailStep[] }) {
  return (
    <div className="relative mt-5 flex items-end gap-3 border-t border-border pt-[18px]">
      {steps.map((s) => {
        const color =
          s.status === "done" ? "text-fg" : s.status === "active" ? "text-accent-text" : s.status === "warn" ? "text-warning" : "text-fg-low";
        return (
          <div key={s.label} className="flex min-w-0 flex-1 flex-col gap-2">
            <div className={cn("flex items-center gap-1.5 truncate text-[11.5px] font-medium", color)}>
              {s.status === "done" ? (
                <Check size={13} strokeWidth={2.6} className="text-success" />
              ) : s.status === "todo" ? (
                <span className="h-[7px] w-[7px] rounded-full border-[1.5px] border-current" />
              ) : (
                <StatDot tone={s.status === "warn" ? "warning" : "accent"} pulse glow size={7} />
              )}
              {s.label}
            </div>
            <div className="h-1 overflow-hidden rounded-full" style={{ background: s.status === "done" ? "var(--success)" : "var(--input)" }}>
              {s.status !== "done" && s.pct ? (
                <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.status === "warn" ? "var(--warning)" : "var(--accent-grad)" }} />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Hero ────────────────────────────────────────────────────────── */
function Hero({
  badge,
  badgeTone,
  title,
  desc,
  actions,
  steps,
}: {
  badge: string;
  badgeTone: "accent" | "success" | "warning";
  title: string;
  desc: string;
  actions: ReactNode;
  steps: RailStep[];
}) {
  return (
    <div className="cll-fade relative overflow-hidden rounded-[15px] border border-border-strong px-6 py-5" style={{ background: "linear-gradient(135deg, var(--surface-2), var(--surface))" }}>
      <span aria-hidden className="pointer-events-none absolute -right-12 -top-24 h-56 w-72 rounded-full" style={{ background: "var(--glow-1)", opacity: 0.3, filter: "blur(56px)" }} />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-[260px] flex-1">
          <Pill tone={badgeTone} dot mono className="border border-border-strong tracking-[0.02em]">
            {badge}
          </Pill>
          <h2 className="mt-3 text-[18px] font-bold tracking-[-0.4px] text-fg">{title}</h2>
          <p className="mt-1.5 max-w-[460px] text-[12.5px] leading-relaxed text-fg-mid">{desc}</p>
        </div>
        <div className="flex shrink-0 gap-2.5">{actions}</div>
      </div>
      <Rail steps={steps} />
    </div>
  );
}

/* ── Stat strip ──────────────────────────────────────────────────── */
type Stat = { label: string; value: string; sub: string; tone?: "success" | "accent" | "warning" };
function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="cll-fade flex overflow-hidden rounded-[14px] border border-border bg-surface">
      {stats.map((s, i) => (
        <div key={s.label} className={cn("flex-1 px-4 py-2.5", i > 0 && "border-l border-border")}>
          <div className="truncate text-[10px] tracking-[0.2px] text-fg-mid">{s.label}</div>
          <div
            className={cn(
              "mt-0.5 text-[16px] font-bold tracking-[-0.4px]",
              s.tone === "success" && "text-success",
              s.tone === "accent" && "text-accent-text",
              s.tone === "warning" && "text-warning",
            )}
          >
            {s.value}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-fg-low">{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Setup checklist ─────────────────────────────────────────────── */
type SetupItem = { n: number; title: string; desc: string; status: "done" | "active" | "todo"; action?: ReactNode };
function SetupChecklist({ header, count, pct, items }: { header: string; count: string; pct: number; items: SetupItem[] }) {
  return (
    <div className="cll-fade rounded-[14px] border border-border bg-surface px-5 py-[18px]">
      <div className="mb-3 flex items-center justify-between text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">
        <span>{header}</span>
        <span>{count}</span>
      </div>
      <div className="mb-3.5 h-[5px] overflow-hidden rounded-full bg-input">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent-grad)" }} />
      </div>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div
            key={it.n}
            className={cn(
              "flex items-center gap-3 rounded-[11px] border px-3 py-2.5",
              it.status === "active" ? "border-accent bg-accent-weak" : "border-border bg-surface-2",
            )}
          >
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-[12.5px] font-bold",
                it.status === "done" && "border border-accent bg-accent-weak text-accent-text",
                it.status === "active" && "text-white",
                it.status === "todo" && "border border-border bg-surface-2 text-fg-low",
              )}
              style={it.status === "active" ? { background: "var(--accent-grad)", boxShadow: "0 5px 14px -6px var(--accent-shadow)" } : undefined}
            >
              {it.status === "done" ? <Check size={13} strokeWidth={2.6} /> : it.n}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-fg">{it.title}</div>
              <div className="mt-0.5 text-[11.5px] text-fg-mid">{it.desc}</div>
            </div>
            <div className="shrink-0">{it.action}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const smallAction = "shrink-0 rounded-[8px] px-3 py-1.5 text-[12px] font-semibold";

const DoneTag = (
  <span className="flex items-center gap-1.5 text-[11.5px] text-success">
    <Check size={13} strokeWidth={2.6} />
    Done
  </span>
);

/* ── Recent letters / activity ───────────────────────────────────── */
type LetterRow = { letter: string; title: string; company: string; status: "Draft" | "Completed"; match: number | null; to: string };
function RecentList({ header, rows }: { header: string; rows: LetterRow[] }) {
  return (
    <div className="cll-fade rounded-[14px] border border-border bg-surface px-[18px] pb-3 pt-1.5">
      <div className="flex items-center justify-between py-3 pb-1.5">
        <span className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">{header}</span>
        <Link to="/cover-letters" className="text-[12px] text-accent-text">View all →</Link>
      </div>
      {rows.map((r, i) => (
        <Link
          key={`${r.to}-${i}`}
          to={r.to}
          className={cn("flex items-center gap-3 rounded-[9px] px-2 py-2.5 transition-colors hover:bg-surface-2", i < rows.length - 1 && "border-b border-border")}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-border bg-surface-2 text-[12.5px] font-bold text-accent-text">{r.letter}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-fg">{r.title}</div>
            <div className="text-[11px] text-fg-low">{r.company}</div>
          </div>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold", r.status === "Completed" ? "bg-success-weak text-success" : "bg-surface-2 text-fg-mid")}>{r.status}</span>
          <span className="shrink-0 font-mono text-[10px] text-accent-text">{r.match != null ? `Match ${r.match}` : "No match"}</span>
        </Link>
      ))}
    </div>
  );
}

/* ── Derived data shape ──────────────────────────────────────────── */
type ActivityItem = { c: string; t: string; tag: string };
interface Derived {
  name: string | null;
  hasProfile: boolean;
  hasVoice: boolean;
  hasRepos: boolean;
  hasLetters: boolean;
  profilePct: number;
  fieldsLeft: number;
  skillsCount: number;
  reposCount: number;
  voiceStatus: string;
  voiceSamples: number;
  voiceAnalyzed: boolean;
  lettersCount: number;
  completedCount: number;
  draftCount: number;
  avgMatch: number | null;
  maxMatch: number | null;
  recent: LetterRow[];
  topDraft: { role: string; company: string; match: number | null; to: string } | null;
  activity: ActivityItem[];
  setupItems: SetupItem[];
  railSetup: RailStep[];
  setupDone: number;
}

/* ── State content (all numbers/copy come from `d`) ──────────────── */
function StateBody({ state, d }: { state: HomeState; d: Derived }) {
  if (state === "welcome") {
    return (
      <>
        <Hero
          badge="Welcome"
          badgeTone="accent"
          title="Cover letters that sound like you."
          desc="Add your CV and a local model drafts tailored letters from your real work — nothing leaves your device."
          actions={
            <>
              <Button asChild size="md"><Link to="/onboarding"><FileText size={15} /> Add my CV</Link></Button>
              <Button asChild variant="outline" size="md"><Link to="/github">Import from GitHub</Link></Button>
            </>
          }
          steps={d.railSetup}
        />
        <SetupChecklist header="Get set up · 3 minutes" count={`${d.setupDone} of 4`} pct={Math.max(4, Math.round((d.setupDone / 4) * 100))} items={d.setupItems} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: <ShieldCheck size={17} />, title: "100% on-device", desc: "A local model does the writing. Your CV and letters never touch a server." },
            { icon: <AudioWaveform size={17} />, title: "Sounds like you", desc: "It learns your tone from letters you have written — not generic AI filler." },
            { icon: <Target size={17} />, title: "Grounded in your CV", desc: "Every claim is backed by real experience, with a match score per role." },
          ].map((f) => (
            <div key={f.title} className="cll-fade rounded-[14px] border border-border bg-surface p-4">
              <div className="mb-3 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-border-strong bg-accent-weak text-accent-text">{f.icon}</div>
              <div className="text-[13px] font-bold text-fg">{f.title}</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-fg-mid">{f.desc}</p>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (state === "cv") {
    return (
      <>
        <Hero
          badge="CV added"
          badgeTone="success"
          title={d.name ? `Nice, ${d.name} — your CV is in.` : "Nice — your CV is in."}
          desc={`Your CV is imported${d.skillsCount ? `, ${d.skillsCount} skills tracked` : ""}. A couple of quick steps and you are ready to write.`}
          actions={
            <>
              <Button asChild size="md"><Link to="/voice"><AudioLines size={15} /> Analyze my voice</Link></Button>
              <Button asChild variant="outline" size="md"><Link to="/profile">Review profile</Link></Button>
            </>
          }
          steps={d.railSetup}
        />
        <StatStrip
          stats={[
            { label: "Profile complete", value: `${d.profilePct}%`, sub: d.fieldsLeft ? `${d.fieldsLeft} fields left` : "all fields" },
            { label: "Skills tracked", value: String(d.skillsCount), sub: d.skillsCount ? "from your CV" : "add skills" },
            { label: "Writing voice", value: d.voiceStatus, sub: d.voiceSamples ? `${d.voiceSamples} samples` : "add samples", tone: d.voiceAnalyzed ? "accent" : "warning" },
            { label: "Letters", value: String(d.lettersCount), sub: d.lettersCount ? "in progress" : "none yet" },
          ]}
        />
        <SetupChecklist header="Finish setting up" count={`${d.setupDone} of 4`} pct={Math.max(4, Math.round((d.setupDone / 4) * 100))} items={d.setupItems} />
      </>
    );
  }

  if (state === "ready") {
    return (
      <>
        <Hero
          badge="All connected"
          badgeTone="success"
          title="You are ready to write."
          desc={`Profile, writing voice and ${d.reposCount} ${d.reposCount === 1 ? "repo" : "repos"} are all set. Pick a company and get a tailored first draft.`}
          actions={
            <>
              <Button asChild size="md"><Link to="/write"><PenLine size={15} /> Write a letter</Link></Button>
              <Button asChild variant="outline" size="md"><Link to="/profile">View profile</Link></Button>
            </>
          }
          steps={[
            { label: "Profile", status: "done" },
            { label: "Voice", status: "done" },
            { label: "GitHub", status: "done" },
            { label: "Write", status: "active", pct: 20 },
          ]}
        />
        <StatStrip
          stats={[
            { label: "Profile complete", value: `${d.profilePct}%`, sub: d.fieldsLeft ? `${d.fieldsLeft} fields left` : "all fields", tone: d.profilePct >= 100 ? "success" : undefined },
            { label: "Skills tracked", value: String(d.skillsCount), sub: "from your profile" },
            { label: "Voice samples", value: String(d.voiceSamples), sub: d.voiceAnalyzed ? "analyzed" : "collected", tone: "accent" },
            { label: "GitHub repos", value: String(d.reposCount), sub: "imported" },
          ]}
        />
        <div className="cll-fade rounded-[14px] border border-border bg-surface px-5 py-[18px]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Start your first cover letter</span>
            <Link to="/write" className="text-[12px] text-accent-text">Open composer →</Link>
          </div>
          <p className="max-w-[560px] text-[12.5px] leading-relaxed text-fg-mid">
            Everything is connected. Enter a company and role and the local model drafts a tailored letter grounded in your CV — with a match score per posting.
          </p>
          <div className="mt-4">
            <Button asChild size="md"><Link to="/write"><PenLine size={15} /> Write a cover letter</Link></Button>
          </div>
        </div>
      </>
    );
  }

  if (state === "active") {
    const draft = d.topDraft;
    const descParts = ["Draft"];
    if (draft?.match != null) descParts.push(`match ${draft.match}`);
    descParts.push(`${d.draftCount} in progress`);
    if (d.completedCount) descParts.push(`${d.completedCount} completed`);
    return (
      <>
        <Hero
          badge="Draft in progress"
          badgeTone="warning"
          title={draft ? `${draft.role} · ${draft.company}` : "Draft in progress"}
          desc={descParts.join(" · ")}
          actions={
            <>
              <Button asChild size="md"><Link to={draft?.to ?? "/write"}><PenLine size={15} /> Resume draft</Link></Button>
              <Button asChild variant="outline" size="md"><Link to="/cover-letters">All letters</Link></Button>
            </>
          }
          steps={[
            { label: "Research", status: "done" },
            { label: "Draft", status: "done" },
            { label: draft?.match != null ? `Match ${draft.match}` : "Match", status: "done" },
            { label: "Review", status: "warn", pct: 35 },
          ]}
        />
        <StatStrip
          stats={[
            { label: "Completed letters", value: String(d.completedCount), sub: "all prepared", tone: "success" },
            { label: "Active drafts", value: String(d.draftCount), sub: d.draftCount ? "in progress" : "none in draft", tone: d.draftCount > 0 ? "warning" : undefined },
            { label: "Skills tracked", value: String(d.skillsCount), sub: "from profile" },
            { label: "GitHub repos", value: String(d.reposCount), sub: "imported" },
          ]}
        />
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.5fr_1fr]">
          <RecentList header="Recent letters" rows={d.recent} />
          <div className="cll-fade rounded-[14px] border border-border bg-surface px-5 py-[18px]">
            <div className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Recent activity</div>
            <div className="mt-3 flex flex-col gap-3">
              {d.activity.map((a) => (
                <div key={a.t} className="flex items-center gap-2.5 text-[12px] text-fg">
                  <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: a.c }} />
                  <span className="flex-1">{a.t}</span>
                  <span className="font-mono text-[10px] text-fg-low">{a.tag}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  // clean
  return (
    <>
      <Hero
        badge="All caught up"
        badgeTone="success"
        title="You are all caught up."
        desc={`${d.completedCount} ${d.completedCount === 1 ? "letter" : "letters"} sent. Line up the next role whenever you are ready.`}
        actions={
          <>
            <Button asChild size="md"><Link to="/write"><PenLine size={15} /> New Cover Letter</Link></Button>
            <Button asChild variant="outline" size="md"><Link to="/cover-letters">Browse sent</Link></Button>
          </>
        }
        steps={[
          { label: "Research", status: "done" },
          { label: "Draft", status: "done" },
          { label: "Review", status: "done" },
          { label: "All sent", status: "done" },
        ]}
      />
      <StatStrip
        stats={[
          { label: "Completed letters", value: String(d.completedCount), sub: "all prepared", tone: "success" },
          { label: "Drafts open", value: String(d.draftCount), sub: d.draftCount ? "in progress" : "inbox zero" },
          { label: "Skills tracked", value: String(d.skillsCount), sub: "from profile" },
          { label: "GitHub repos", value: String(d.reposCount), sub: "imported" },
        ]}
      />
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <RecentList header="Recently sent" rows={d.recent} />
        <div className="cll-fade rounded-[14px] border border-border bg-surface px-5 py-[18px]">
          <div className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Do more</div>
          <div className="mt-3 flex flex-col gap-2.5">
            <Link to="/voice" className="flex items-center gap-3 rounded-[10px] bg-surface-2 p-2.5 text-[12.5px] text-fg transition-colors hover:brightness-110">
              <span className="text-accent-text"><AudioLines size={17} /></span> Refine your writing voice
            </Link>
            <Link to="/github" className="flex items-center gap-3 rounded-[10px] bg-surface-2 p-2.5 text-[12.5px] text-fg transition-colors hover:brightness-110">
              <span className="text-accent-text"><Github size={16} /></span> Re-sync GitHub projects
            </Link>
            <a
              href="https://github.com/mehmeterguden/Microsoft-Internship-Cover-Letter-Local"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-[10px] bg-surface-2 p-2.5 text-[12.5px] text-fg no-underline transition-colors hover:brightness-110"
            >
              <span className="text-warning"><Star size={15} fill="currentColor" /></span> Star the project on GitHub
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Loading skeleton ────────────────────────────────────────────── */
function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-3.5">
      <Skeleton className="h-[168px] w-full rounded-[15px]" />
      <Skeleton className="h-[74px] w-full rounded-[14px]" />
      <Skeleton className="h-[210px] w-full rounded-[14px]" />
    </div>
  );
}

/* ── Derivation helpers ──────────────────────────────────────────── */
type Status3 = "done" | "active" | "todo";
/** Mark completed steps done; the first incomplete one is "active", the rest "todo". */
function stepStatuses(flags: boolean[]): Status3[] {
  let usedActive = false;
  return flags.map((done) => {
    if (done) return "done";
    if (!usedActive) {
      usedActive = true;
      return "active";
    }
    return "todo";
  });
}

export function Home() {
  const profile = useAsync(getProfile);
  const style = useAsync(getStyle);
  const repos = useAsync(listSavedRepos);
  const jobs = useAsync(listJobs);
  const skills = useAsync(listSkills);

  const loading = profile.loading || style.loading || repos.loading || jobs.loading || skills.loading;
  const loadError = profile.error ?? jobs.error ?? style.error ?? repos.error ?? skills.error;

  useEffect(() => {
    if (!loading && loadError) {
      toast.warning("Couldn't load everything", "Showing what we could — some data may be missing.");
    }
  }, [loading, loadError]);

  if (loading) {
    return (
      <Page eyebrow="Workspace / Home" title="Home" actions={<ProjectBadge />} bodyClassName="px-7 py-5">
        <div className="flex flex-col gap-3.5">
          <HomeSkeleton />
        </div>
      </Page>
    );
  }

  // ── Derive everything from whatever loaded (null-safe → welcome on failure) ──
  const p = profile.data;
  const st = style.data;
  const rp = repos.data ?? [];
  const jb = jobs.data ?? [];
  const sk = skills.data ?? [];

  const hasProfile = !!(p && (p.name || p.surname || p.email || p.summary || p.github || p.linkedin));
  const hasVoice = !!(st && (st.style_profile || (st.samples ?? 0) > 0));
  const hasRepos = rp.length > 0;

  const isDone = (j: Job) => j.letter?.completed === true;
  const lettersCount = jb.length;
  const completedCount = jb.filter(isDone).length;
  const draftCount = lettersCount - completedCount;
  const hasLetters = lettersCount > 0;
  const allCompleted = hasLetters && draftCount === 0;

  const scores = jb.map((j) => j.match_score).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const avgMatch = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const maxMatch = scores.length ? Math.max(...scores) : null;

  const profileFields = [p?.name, p?.surname, p?.email, p?.phone, p?.linkedin, p?.github, p?.summary];
  const filled = profileFields.filter(Boolean).length;
  const profilePct = Math.round((filled / profileFields.length) * 100);

  const voiceAnalyzed = !!st?.style_profile?.llm_analyzed;
  const voiceSamples = st?.samples ?? 0;
  const voiceStatus = voiceAnalyzed ? "Analyzed" : hasVoice ? "In progress" : "Pending";

  const byNewest = [...jb].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  const jobTo = (j: Job) => (j.id != null ? `/write?job=${j.id}` : "/cover-letters");
  const recent: LetterRow[] = byNewest.slice(0, 4).map((j) => ({
    letter: (j.company?.trim()?.[0] ?? "?").toUpperCase(),
    title: j.role?.trim() || "Untitled role",
    company: j.company?.trim() || "Unknown company",
    status: isDone(j) ? "Completed" : "Draft",
    match: typeof j.match_score === "number" ? j.match_score : null,
    to: jobTo(j),
  }));

  const topDraftJob = byNewest.find((j) => !isDone(j));
  const topDraft = topDraftJob
    ? {
        role: topDraftJob.role?.trim() || "Untitled role",
        company: topDraftJob.company?.trim() || "Unknown company",
        match: typeof topDraftJob.match_score === "number" ? topDraftJob.match_score : null,
        to: jobTo(topDraftJob),
      }
    : null;

  const activity: ActivityItem[] = [];
  if (topDraft) activity.push({ c: "var(--accent)", t: `Draft in progress · ${topDraft.role} at ${topDraft.company}`, tag: "Draft" });
  if (completedCount > 0) activity.push({ c: "var(--success)", t: `${completedCount} ${completedCount === 1 ? "letter" : "letters"} completed`, tag: "Done" });
  if (hasRepos) activity.push({ c: "var(--accent-2)", t: `${rp.length} ${rp.length === 1 ? "repo" : "repos"} imported from GitHub`, tag: "GitHub" });
  if (voiceAnalyzed) activity.push({ c: "var(--accent)", t: "Writing voice analyzed", tag: "Voice" });

  // Setup steps (welcome / cv states)
  const setupFlags = [hasProfile, hasVoice, hasRepos, hasLetters];
  const setupStatuses = stepStatuses(setupFlags);
  const setupDone = setupFlags.filter(Boolean).length;
  const railSetup: RailStep[] = ["Add CV", "Voice", "GitHub", "First cover letter"].map((label, i) => ({
    label,
    status: setupStatuses[i],
    pct: setupStatuses[i] === "active" ? 30 : undefined,
  }));
  const setupItems: SetupItem[] = [
    {
      n: 1,
      title: "Add your CV",
      desc: hasProfile ? "Imported and turned into your profile." : "Parsed on-device into an editable profile.",
      status: setupStatuses[0],
      action: hasProfile ? DoneTag : <Button asChild size="sm" className={smallAction}><Link to="/onboarding">Add CV</Link></Button>,
    },
    {
      n: 2,
      title: "Analyze your writing voice",
      desc: "Drop in past letters so drafts sound like you.",
      status: setupStatuses[1],
      action: hasVoice ? DoneTag : <Button asChild variant="outline" size="sm" className={smallAction}><Link to="/voice">Add samples</Link></Button>,
    },
    {
      n: 3,
      title: "Import from GitHub",
      desc: "Pull real projects and skills into your profile.",
      status: setupStatuses[2],
      action: hasRepos ? DoneTag : <Button asChild variant="outline" size="sm" className={smallAction}><Link to="/github">Connect</Link></Button>,
    },
    {
      n: 4,
      title: "Write your first cover letter",
      desc: "Tailored, grounded, and in your voice.",
      status: setupStatuses[3],
      action: hasLetters ? (
        DoneTag
      ) : setupStatuses[3] === "active" ? (
        <Button asChild size="sm" className={smallAction}><Link to="/write">Write</Link></Button>
      ) : (
        <span className="text-[10.5px] text-fg-low">Soon</span>
      ),
    },
  ];

  const state: HomeState = !hasProfile ? "welcome" : hasLetters ? (allCompleted ? "clean" : "active") : hasVoice && hasRepos ? "ready" : "cv";

  const d: Derived = {
    name: p?.name ?? null,
    hasProfile,
    hasVoice,
    hasRepos,
    hasLetters,
    profilePct,
    fieldsLeft: profileFields.length - filled,
    skillsCount: sk.length,
    reposCount: rp.length,
    voiceStatus,
    voiceSamples,
    voiceAnalyzed,
    lettersCount,
    completedCount,
    draftCount,
    avgMatch,
    maxMatch,
    recent,
    topDraft,
    activity,
    setupItems,
    railSetup,
    setupDone,
  };

  return (
    <Page eyebrow="Workspace / Home" title="Home" actions={<ProjectBadge />} bodyClassName="px-7 py-5">
      <div className="flex flex-col gap-3.5">
        <StateBody state={state} d={d} />
      </div>
    </Page>
  );
}
