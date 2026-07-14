import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, PenLine, FileText, AudioLines, Github, Target, ShieldCheck, AudioWaveform, Star } from "lucide-react";
import { Page } from "@/components/common/Page";
import { OpenSourceBanner } from "@/components/common/OpenSourceBanner";
import { Button } from "@/components/ui/button";
import { Pill, StatDot } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

/* ── State model ─────────────────────────────────────────────────
   Backend wiring is deferred; the "PREVIEW STATE" switcher (from the
   design) drives local state so every variant is viewable. When we wire
   the backend, `state` is derived from real data (has CV / voice / repos /
   letters) and the switcher becomes a dev-only affordance. */
type HomeState = "welcome" | "cv" | "ready" | "active" | "clean";

const STATE_OPTIONS: { value: HomeState; label: string; desc: string }[] = [
  { value: "welcome", label: "First run", desc: "Nothing set up yet" },
  { value: "cv", label: "CV added", desc: "Mid-setup, voice pending" },
  { value: "ready", label: "Ready to write", desc: "Profile, voice, GitHub done" },
  { value: "active", label: "Draft in progress", desc: "A letter is underway" },
  { value: "clean", label: "All caught up", desc: "Everything sent" },
];

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
          <Pill tone={badgeTone} dot mono className="border border-border-strong uppercase tracking-[0.6px]">
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
      <div className="mb-3 flex items-center justify-between font-mono text-[10px] tracking-[1px] text-fg-low">
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

/* ── Recent letters / activity ───────────────────────────────────── */
type LetterRow = { letter: string; title: string; company: string; status: "Draft" | "Completed"; match: number };
function RecentList({ header, rows }: { header: string; rows: LetterRow[] }) {
  return (
    <div className="cll-fade rounded-[14px] border border-border bg-surface px-[18px] pb-3 pt-1.5">
      <div className="flex items-center justify-between py-3 pb-1.5">
        <span className="font-mono text-[10px] tracking-[1px] text-fg-low">{header}</span>
        <Link to="/cover-letters" className="text-[12px] text-accent-text">View all →</Link>
      </div>
      {rows.map((r, i) => (
        <Link
          key={r.title + r.company}
          to="/cover-letters"
          className={cn("flex items-center gap-3 rounded-[9px] px-2 py-2.5 transition-colors hover:bg-surface-2", i < rows.length - 1 && "border-b border-border")}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-border bg-surface-2 text-[12.5px] font-bold text-accent-text">{r.letter}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-fg">{r.title}</div>
            <div className="text-[11px] text-fg-low">{r.company}</div>
          </div>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold", r.status === "Completed" ? "bg-success-weak text-success" : "bg-surface-2 text-fg-mid")}>{r.status}</span>
          <span className="shrink-0 font-mono text-[10px] text-accent-text">Match {r.match}</span>
        </Link>
      ))}
    </div>
  );
}

/* ── State content ───────────────────────────────────────────────── */
function StateBody({ state }: { state: HomeState }) {
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
          steps={[
            { label: "Add CV", status: "active", pct: 30 },
            { label: "Voice", status: "todo" },
            { label: "GitHub", status: "todo" },
            { label: "First letter", status: "todo" },
          ]}
        />
        <SetupChecklist
          header="GET SET UP · 3 MINUTES"
          count="0 of 4"
          pct={4}
          items={[
            { n: 1, title: "Add your CV", desc: "Parsed on-device into an editable profile.", status: "active", action: <Button asChild size="sm" className={smallAction}><Link to="/onboarding">Add CV</Link></Button> },
            { n: 2, title: "Analyze your writing voice", desc: "Drop in past letters so drafts sound like you.", status: "todo", action: <Button asChild variant="outline" size="sm" className={smallAction}><Link to="/voice">Add samples</Link></Button> },
            { n: 3, title: "Import from GitHub", desc: "Pull real projects and skills into your profile.", status: "todo", action: <Button asChild variant="outline" size="sm" className={smallAction}><Link to="/github">Connect</Link></Button> },
            { n: 4, title: "Write your first letter", desc: "Tailored, grounded, and in your voice.", status: "todo", action: <span className="text-[10.5px] text-fg-low">Soon</span> },
          ]}
        />
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
        <OpenSourceBanner />
      </>
    );
  }

  if (state === "cv") {
    return (
      <>
        <Hero
          badge="CV added"
          badgeTone="success"
          title="Nice — your CV is in."
          desc="Parsed 4 roles, 25 skills and 2 degrees. Two quick steps and you are ready to write."
          actions={
            <>
              <Button asChild size="md"><Link to="/voice"><AudioLines size={15} /> Analyze my voice</Link></Button>
              <Button asChild variant="outline" size="md"><Link to="/profile">Review profile</Link></Button>
            </>
          }
          steps={[
            { label: "CV added", status: "done" },
            { label: "Voice", status: "active", pct: 35 },
            { label: "GitHub", status: "todo" },
            { label: "First letter", status: "todo" },
          ]}
        />
        <StatStrip
          stats={[
            { label: "Profile complete", value: "82%", sub: "3 fields left" },
            { label: "Skills tracked", value: "25", sub: "from your CV" },
            { label: "Writing voice", value: "Pending", sub: "add samples", tone: "warning" },
            { label: "Letters", value: "0", sub: "none yet" },
          ]}
        />
        <SetupChecklist
          header="FINISH SETTING UP"
          count="1 of 4"
          pct={32}
          items={[
            { n: 1, title: "Add your CV", desc: "Imported and turned into your profile.", status: "done", action: <span className="flex items-center gap-1.5 text-[11.5px] text-success"><Check size={13} strokeWidth={2.6} />Done</span> },
            { n: 2, title: "Analyze your writing voice", desc: "Drop in past letters so drafts sound like you.", status: "active", action: <Button asChild size="sm" className={smallAction}><Link to="/voice">Add samples</Link></Button> },
            { n: 3, title: "Import from GitHub", desc: "Pull real projects and skills into your profile.", status: "todo", action: <Button asChild variant="outline" size="sm" className={smallAction}><Link to="/github">Connect</Link></Button> },
            { n: 4, title: "Write your first letter", desc: "Tailored, grounded, and in your voice.", status: "todo", action: <Button asChild variant="outline" size="sm" className={smallAction}><Link to="/write">Write</Link></Button> },
          ]}
        />
        <OpenSourceBanner />
      </>
    );
  }

  if (state === "ready") {
    const picks = [
      { l: "A", name: "Anthropic", role: "ML Engineer" },
      { l: "O", name: "OpenAI", role: "Research Eng" },
      { l: "M", name: "Mistral", role: "Research Eng" },
      { l: "H", name: "Hugging Face", role: "Platform Eng" },
    ];
    return (
      <>
        <Hero
          badge="All connected"
          badgeTone="success"
          title="You are ready to write."
          desc="Profile, writing voice and GitHub are all set. Pick a company and get a tailored first draft."
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
            { label: "Profile complete", value: "100%", sub: "all fields", tone: "success" },
            { label: "Skills tracked", value: "25", sub: "5 categories" },
            { label: "Voice samples", value: "6", sub: "analyzed", tone: "accent" },
            { label: "GitHub repos", value: "8", sub: "imported" },
          ]}
        />
        <div className="cll-fade rounded-[14px] border border-border bg-surface px-5 py-[18px]">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[1px] text-fg-low">START WITH A COMPANY</span>
            <Link to="/write" className="text-[12px] text-accent-text">Search all →</Link>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {picks.map((p) => (
              <Link key={p.name} to="/write" className="rounded-[11px] border border-border bg-surface-2 p-3 transition-transform hover:-translate-y-0.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-border bg-surface text-[13px] font-bold text-accent-text">{p.l}</span>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold text-fg">{p.name}</div>
                    <div className="text-[11px] text-fg-low">{p.role}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <OpenSourceBanner />
      </>
    );
  }

  if (state === "active") {
    return (
      <>
        <Hero
          badge="Draft in progress"
          badgeTone="warning"
          title="ML Engineer · Anthropic"
          desc="Draft · match 74 · edited 2h ago · 1 unsupported claim to review."
          actions={
            <>
              <Button asChild size="md"><Link to="/write"><PenLine size={15} /> Resume draft</Link></Button>
              <Button asChild variant="outline" size="md"><Link to="/cover-letters">All letters</Link></Button>
            </>
          }
          steps={[
            { label: "Research", status: "done" },
            { label: "Draft", status: "done" },
            { label: "Match 74", status: "done" },
            { label: "Review · 1 flag", status: "warn", pct: 35 },
          ]}
        />
        <StatStrip
          stats={[
            { label: "Active drafts", value: "3", sub: "in progress" },
            { label: "Completed", value: "4", sub: "sent" },
            { label: "Avg match", value: "88", sub: "across letters", tone: "accent" },
            { label: "Skills tracked", value: "25", sub: "5 categories" },
          ]}
        />
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.5fr_1fr]">
          <RecentList
            header="RECENT LETTERS"
            rows={[
              { letter: "A", title: "ML Engineer", company: "Anthropic", status: "Draft", match: 74 },
              { letter: "M", title: "Research Engineer", company: "Mistral", status: "Draft", match: 90 },
              { letter: "H", title: "Platform Engineer", company: "Hugging Face", status: "Completed", match: 94 },
              { letter: "O", title: "Research Engineer", company: "OpenAI", status: "Completed", match: 96 },
            ]}
          />
          <div className="cll-fade rounded-[14px] border border-border bg-surface px-5 py-[18px]">
            <div className="font-mono text-[10px] tracking-[1px] text-fg-low">RECENT ACTIVITY</div>
            <div className="mt-3 flex flex-col gap-3">
              {[
                { c: "var(--accent)", t: "Generated a letter for Anthropic", time: "2h" },
                { c: "#a78bfa", t: "Imported 8 repos from GitHub", time: "1d" },
                { c: "var(--success)", t: "Sent letter to Hugging Face", time: "2d" },
              ].map((a) => (
                <div key={a.t} className="flex items-center gap-2.5 text-[12px] text-fg">
                  <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: a.c }} />
                  <span className="flex-1">{a.t}</span>
                  <span className="font-mono text-[10px] text-fg-low">{a.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <OpenSourceBanner />
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
        desc="7 letters sent with a 90 average match. Line up the next role whenever you are ready."
        actions={
          <>
            <Button asChild size="md"><Link to="/write"><PenLine size={15} /> New letter</Link></Button>
            <Button asChild variant="outline" size="md"><Link to="/cover-letters">Browse sent</Link></Button>
          </>
        }
        steps={[
          { label: "Research", status: "done" },
          { label: "Draft", status: "done" },
          { label: "Match 90", status: "done" },
          { label: "All sent", status: "done" },
        ]}
      />
      <StatStrip
        stats={[
          { label: "Completed", value: "7", sub: "all sent", tone: "success" },
          { label: "Avg match", value: "90", sub: "strong fit", tone: "accent" },
          { label: "This week", value: "3", sub: "letters sent" },
          { label: "Drafts open", value: "0", sub: "inbox zero" },
        ]}
      />
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <RecentList
          header="RECENTLY SENT"
          rows={[
            { letter: "O", title: "Research Engineer", company: "OpenAI", status: "Completed", match: 96 },
            { letter: "H", title: "Platform Engineer", company: "Hugging Face", status: "Completed", match: 94 },
            { letter: "C", title: "Applied Scientist", company: "Cohere", status: "Completed", match: 91 },
            { letter: "D", title: "Research Scientist", company: "Google DeepMind", status: "Completed", match: 89 },
          ]}
        />
        <div className="cll-fade rounded-[14px] border border-border bg-surface px-5 py-[18px]">
          <div className="font-mono text-[10px] tracking-[1px] text-fg-low">DO MORE</div>
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
      <OpenSourceBanner />
    </>
  );
}

/* ── Preview-state switcher ──────────────────────────────────────── */
function StateSwitcher({ state, onPick }: { state: HomeState; onPick: (s: HomeState) => void }) {
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
                onClick={() => { onPick(o.value); setOpen(false); }}
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

export function Home() {
  const [state, setState] = useState<HomeState>("welcome");
  return (
    <Page eyebrow="WORKSPACE / HOME" title="Home" actions={<StateSwitcher state={state} onPick={setState} />} bodyClassName="px-7 py-5">
      <div className="flex flex-col gap-3.5">
        <StateBody state={state} />
      </div>
    </Page>
  );
}
