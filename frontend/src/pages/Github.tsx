import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, ChevronRight, ExternalLink, Loader2, RotateCw, Sparkles, Trash2 } from "lucide-react";
import { Page } from "@/components/common/Page";
import { OpenSourceBanner } from "@/components/common/OpenSourceBanner";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ProgressBar, Spinner, StatDot } from "@/components/ui/feedback";
import { useAsync } from "@/lib/useAsync";
import { errorMessage } from "@/api/client";
import { toast } from "@/store/toast";
import { analyzeRepos, fetchRepos, githubStatus, saveRepos, type GithubProfile } from "@/api/github";
import { deleteSavedRepo, listSavedRepos } from "@/api/githubRepos";
import type { GithubRepo, ScoredSkill } from "@/api/types";
import { cn } from "@/lib/utils";

/* ── The page walks a real lifecycle derived from backend calls ──────
   connect  → githubStatus() tells us if a token/account is linked; the
              user enters a username (or uses their account).
   analyzing→ fetchRepos() then analyzeRepos() run back-to-back; the
              analyze call can take a while, so we show progress.
   results  → analyzed repos + detected skills; save/remove sync with the
              profile via listSavedRepos()/saveRepos()/deleteSavedRepo(). */
type Phase = "connect" | "analyzing" | "results";

/* ── GitHub-language identity colors (data colors, not theme tokens) ── */
const LANG_COLORS: Record<string, string> = {
  Python: "#3572A5",
  Rust: "#dea584",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Go: "#00ADD8",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  PHP: "#4F5D95",
};

const langColor = (name?: string | null): string => (name && LANG_COLORS[name]) || "var(--text-low)";
const primaryLang = (repo: GithubRepo): string | null => repo.technologies?.[0] ?? null;

const formatStars = (n?: number | null): string => {
  const v = n ?? 0;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return String(v);
};

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** Involvement bullets: prefer AI highlights, fall back to the contribution note. */
const involvementLines = (repo: GithubRepo): string[] => {
  if (repo.highlights && repo.highlights.length > 0) return repo.highlights;
  if (repo.contribution) return [repo.contribution];
  return [];
};

/** Score badge for a detected skill — 0..1 relevance shown as a compact percent. */
const formatScore = (score?: number | null): string | null => {
  if (score == null || !Number.isFinite(score)) return null;
  const pct = score <= 1 ? Math.round(score * 100) : Math.round(score);
  return String(pct);
};

const initials = (profile: GithubProfile): string => {
  const base = (profile.name || profile.login || "").trim();
  if (!base) return "?";
  const parts = base.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
};

/* ── Icons (kept from the design for fidelity) ──────────────────────── */
function GithubMark({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function StarIcon({ size = 11, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2l2.9 6.26 6.9.5-5.3 4.5 1.7 6.74L12 16.9l-6.2 4.1 1.7-6.74-5.3-4.5 6.9-.5z" />
    </svg>
  );
}

/* ── Account chip (header, right) ───────────────────────────────────── */
function AccountChip({ connected, profile }: { connected: boolean; profile: GithubProfile | null }) {
  if (profile?.login) {
    const chip = (
      <>
        <span
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-[12px] font-bold text-white"
          style={{ background: "var(--accent-grad)" }}
        >
          {initials(profile)}
        </span>
        <span className="leading-tight">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
            @{profile.login}
            {profile.html_url ? <ExternalLink size={12} className="text-fg-low" /> : null}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] text-success">
            <StatDot tone="success" glow size={5} />
            {typeof profile.public_repos === "number" ? `${profile.public_repos} REPOS` : "LOADED"}
          </span>
        </span>
      </>
    );
    if (profile.html_url) {
      return (
        <a
          href={profile.html_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2.5 rounded-[11px] border border-border-strong bg-surface py-2 pl-2.5 pr-3.5 no-underline transition-colors hover:border-accent"
        >
          {chip}
        </a>
      );
    }
    return <div className="flex items-center gap-2.5 rounded-[11px] border border-border-strong bg-surface py-2 pl-2.5 pr-3.5">{chip}</div>;
  }

  return (
    <div className="flex items-center gap-2.5 rounded-[11px] border border-border-strong bg-surface py-2 pl-2.5 pr-3.5">
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-border bg-surface-2 text-fg-low">
        <GithubMark size={15} />
      </span>
      <span className="leading-tight">
        <span className="block text-[13px] font-semibold text-fg-mid">{connected ? "Account linked" : "No account"}</span>
        <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px]" style={{ color: connected ? "var(--success)" : "var(--text-low)" }}>
          <span className="h-[5px] w-[5px] rounded-full" style={{ background: connected ? "var(--success)" : "var(--text-low)" }} />
          {connected ? "TOKEN SET" : "NOT CONNECTED"}
        </span>
      </span>
    </div>
  );
}

/* ── Repo card ──────────────────────────────────────────────────────── */
type RepoCardProps = {
  repo: GithubRepo;
  inProfile: boolean;
  analyzing?: boolean;
  onOpen?: () => void;
  onRemove?: () => void;
};

function RepoCard({ repo, inProfile, analyzing = false, onOpen, onRemove }: RepoCardProps) {
  const lang = primaryLang(repo);
  const desc = repo.description ?? repo.purpose ?? "No description provided.";
  const interactive = !!onOpen;

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-[7px] text-[14px] font-[650]">
          <GithubMark size={14} className="shrink-0 text-fg-low" />
          <span className="truncate text-fg">{repo.repo_name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-fg-mid">
          <StarIcon size={11} />
          {formatStars(repo.stars)}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-[11.5px] leading-[1.55] text-fg-mid">{desc}</p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10.5px] text-fg-mid">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: langColor(lang) }} />
          {lang ?? "—"}
        </span>

        {inProfile ? (
          <div className="flex shrink-0 items-center gap-[7px]">
            <span
              className="flex items-center gap-1.5 rounded-full px-[9px] py-[3px] font-mono text-[9px] text-success"
              style={{ background: "rgba(52,211,153,.14)" }}
            >
              <Check size={10} strokeWidth={2.8} />
              IN PROFILE
            </span>
            {onRemove ? (
              <button
                type="button"
                title="Remove from profile"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] border border-border bg-surface-2 text-fg-mid transition-colors hover:border-danger hover:text-danger"
              >
                <Trash2 size={12} />
              </button>
            ) : null}
          </div>
        ) : analyzing ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-[8px] bg-accent-weak px-[11px] py-[5px] text-[11px] font-semibold text-accent-text">
            <Loader2 size={12} className="animate-spin" />
            Analyzing…
          </span>
        ) : (
          <ChevronRight size={16} className="shrink-0 text-fg-low transition-colors group-hover:text-accent-text" />
        )}
      </div>
    </>
  );

  if (!interactive) {
    return <div className="rounded-[13px] border border-border bg-surface p-4">{body}</div>;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.();
        }
      }}
      className="group cursor-pointer rounded-[13px] border border-border bg-surface p-4 text-left outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-weak"
    >
      {body}
    </div>
  );
}

/* ── Section header (mono label + right slot) ───────────────────────── */
function SectionHead({ label, count, tone, right }: { label: string; count: number; tone: "success" | "low"; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className={cn("font-mono text-[10px] tracking-[1px]", tone === "success" ? "text-success" : "text-fg-low")}>
        {label} · {count}
      </span>
      {right}
    </div>
  );
}

/* ── Detected skills (real ScoredSkill[]) ───────────────────────────── */
function SkillsCard({ skills, repoCount }: { skills: ScoredSkill[]; repoCount: number }) {
  const sorted = useMemo(
    () => [...skills].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name)),
    [skills],
  );

  return (
    <div className="cll-fade rounded-[14px] border border-border bg-surface px-5 py-[18px]">
      <div className="mb-3.5 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] tracking-[1px] text-fg-low">
          <Sparkles size={12} className="text-accent-text" />
          DETECTED SKILLS · {sorted.length}
        </span>
        <span className="font-mono text-[10px] text-fg-low">from {plural(repoCount, "analyzed repo")}</span>
      </div>
      {sorted.length === 0 ? (
        <p className="text-[12px] text-fg-mid">No skills detected yet — analyze a repository to pull its skills into your profile.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sorted.map((s) => {
            const score = formatScore(s.score);
            return (
              <span
                key={s.name}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[12px] text-fg"
              >
                {s.name}
                {score ? <span className="font-mono text-[9.5px] text-accent-text">{score}</span> : null}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Repo detail modal (AI summary / involvement / tech) ────────────── */
function RepoDetail({
  repo,
  inProfile,
  saving,
  onClose,
  onAdd,
  onRemove,
}: {
  repo: GithubRepo;
  inProfile: boolean;
  saving: boolean;
  onClose: () => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const lang = primaryLang(repo);
  const summary = repo.purpose ?? repo.description ?? "No AI summary is available for this repository yet.";
  const bullets = involvementLines(repo);

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="w-[min(92vw,560px)] max-h-[85vh] overflow-y-auto p-6">
        <div className="pr-8">
          <DialogTitle className="flex items-center gap-2 text-[16px] tracking-[-0.3px]">
            <GithubMark size={16} className="text-fg-low" />
            <span className="truncate">{repo.repo_name}</span>
          </DialogTitle>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-fg-mid">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: langColor(lang) }} />
              {lang ?? "—"}
            </span>
            <span className="flex items-center gap-1 font-mono">
              <StarIcon size={11} />
              {formatStars(repo.stars)}
            </span>
            {typeof repo.involvement_rating === "number" ? (
              <span className="font-mono uppercase tracking-[0.5px] text-fg-low">Involvement {repo.involvement_rating}/5</span>
            ) : null}
          </div>
        </div>

        {repo.description ? <p className="mt-4 text-[12.5px] leading-relaxed text-fg-mid">{repo.description}</p> : null}

        <div className="mt-4 rounded-[11px] border border-border bg-surface-2 p-3.5">
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[1px] text-accent-text">
            <Sparkles size={12} />
            AI Summary
          </div>
          <p className="text-[12.5px] leading-relaxed text-fg">{summary}</p>
        </div>

        {bullets.length > 0 ? (
          <div className="mt-4">
            <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[1px] text-fg-low">Your involvement</div>
            <ul className="flex flex-col gap-2">
              {bullets.map((line) => (
                <li key={line} className="flex gap-2.5 text-[12.5px] leading-relaxed text-fg">
                  <Check size={14} strokeWidth={2.4} className="mt-0.5 shrink-0 text-success" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {repo.technologies && repo.technologies.length > 0 ? (
          <div className="mt-4">
            <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[1px] text-fg-low">Tech</div>
            <div className="flex flex-wrap gap-2">
              {repo.technologies.map((t) => (
                <span key={t} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 font-mono text-[10px] text-fg-mid">
                  {t}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex items-center gap-2.5 border-t border-border pt-4">
          {inProfile ? (
            <>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-success">
                <Check size={14} strokeWidth={2.6} />
                In your profile
              </span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={onRemove}>
                <Trash2 size={13} />
                Remove
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" size="md" loading={saving} onClick={onAdd}>
                <Sparkles size={14} />
                Add to profile
              </Button>
              <div className="flex-1" />
            </>
          )}
          {repo.url ? (
            <a
              href={repo.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-border-strong bg-surface px-3 py-2 text-[12px] font-medium text-fg no-underline transition-colors hover:bg-surface-2"
            >
              View on GitHub
              <ExternalLink size={12} />
            </a>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Intro + connect input (shared across states) ───────────────────── */
function ConnectRow({
  username,
  onUsername,
  onFetch,
  onUseAccount,
  connected,
  busy,
}: {
  username: string;
  onUsername: (v: string) => void;
  onFetch: () => void;
  onUseAccount: () => void;
  connected: boolean;
  busy: boolean;
}) {
  return (
    <div className="cll-fade mx-auto mb-6 w-full max-w-[640px]">
      <p className="mb-3 text-center text-[13px] text-fg-mid">
        Enter a GitHub account and we&apos;ll fetch its public repos, then turn them into skills and projects.
      </p>
      <form
        className="flex gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          onFetch();
        }}
      >
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-low">
            <GithubMark size={16} />
          </span>
          <input
            type="text"
            value={username}
            onChange={(e) => onUsername(e.target.value)}
            placeholder="github username or profile URL"
            className="h-11 w-full rounded-[11px] border border-border-strong bg-input pl-[38px] pr-3.5 font-mono text-[13px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-low focus:border-accent focus:ring-[3px] focus:ring-accent-weak"
          />
        </div>
        <Button type="submit" variant="primary" size="md" loading={busy} className="h-11 rounded-[11px] px-5">
          Fetch repos
        </Button>
      </form>
      <div className="mt-2.5 flex items-center justify-center gap-2 text-center font-mono text-[10px] text-fg-low">
        {connected ? (
          <button type="button" onClick={onUseAccount} disabled={busy} className="text-accent-text underline-offset-2 hover:underline disabled:opacity-50">
            Use my connected account
          </button>
        ) : (
          <span>
            Add a token in{" "}
            <Link to="/settings" className="text-accent-text underline-offset-2 hover:underline">
              Settings
            </Link>{" "}
            to include private repositories.
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Inline state for the saved-repos list ──────────────────────────── */
function SavedError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[13px] border border-border bg-danger-weak px-4 py-3">
      <span className="flex items-center gap-2 text-[12px] text-danger">
        <AlertTriangle size={14} />
        {message}
      </span>
      <Button variant="outline" size="xs" onClick={onRetry}>
        <RotateCw size={12} /> Retry
      </Button>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */
export function Github() {
  const status = useAsync(githubStatus);
  const saved = useAsync(listSavedRepos);

  const [phase, setPhase] = useState<Phase>("connect");
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState<GithubProfile | null>(null);
  const [fetchedRepos, setFetchedRepos] = useState<GithubRepo[]>([]);
  const [analysis, setAnalysis] = useState<{ repos: GithubRepo[]; skills: ScoredSkill[] } | null>(null);
  const [progress, setProgress] = useState(0);

  const [selected, setSelected] = useState<GithubRepo | null>(null);
  const [fetching, setFetching] = useState(false);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<GithubRepo | null>(null);
  const [removing, setRemoving] = useState(false);

  const savedRepos = saved.data ?? [];
  const savedByName = useMemo(() => new Map(savedRepos.map((r) => [r.repo_name, r])), [savedRepos]);
  const isInProfile = useCallback((repo: GithubRepo) => savedByName.has(repo.repo_name), [savedByName]);

  const availableRepos = useMemo(
    () => (analysis?.repos ?? []).filter((r) => !savedByName.has(r.repo_name)),
    [analysis, savedByName],
  );

  // Animate the analyze progress bar while the (single, blocking) analyze call runs.
  useEffect(() => {
    if (phase !== "analyzing") return;
    setProgress(6);
    const id = window.setInterval(() => {
      setProgress((p) => (p >= 92 ? p : p + Math.max(0.5, (92 - p) * 0.06)));
    }, 350);
    return () => window.clearInterval(id);
  }, [phase]);

  // Skills relevant to the repos being saved (fall back to the full detected set).
  const skillsForRepos = useCallback(
    (repos: GithubRepo[]): ScoredSkill[] => {
      if (!analysis) return [];
      const tech = new Set(repos.flatMap((r) => (r.technologies ?? []).map((t) => t.toLowerCase())));
      const matched = analysis.skills.filter((s) => tech.has(s.name.toLowerCase()));
      return matched.length > 0 ? matched : analysis.skills;
    },
    [analysis],
  );

  const runFetchAnalyze = useCallback(async (target: { username: string | null; useAccount: boolean }) => {
    setFetching(true);
    try {
      const fetched = await fetchRepos(target.username, target.useAccount);
      setProfile(fetched.profile);
      setFetchedRepos(fetched.repos);
      setFetching(false);

      if (fetched.repos.length === 0) {
        toast.warning("No public repositories", "This account has no public repos to analyze.");
        return;
      }

      const login = fetched.profile.login ?? target.username ?? "";
      setAnalysis(null);
      setPhase("analyzing");
      try {
        const result = await analyzeRepos(login, fetched.repos);
        setAnalysis(result);
        setProgress(100);
        setPhase("results");
        toast.success(
          "Analysis complete",
          `Analyzed ${plural(result.repos.length, "repository", "repositories")} · ${plural(result.skills.length, "skill")} detected.`,
        );
      } catch (err) {
        toast.danger("Analysis failed", errorMessage(err));
        setPhase("connect");
      }
    } catch (err) {
      toast.danger("Couldn't fetch repositories", errorMessage(err));
      setFetching(false);
    }
  }, []);

  const onFetch = () => {
    const value = username.trim();
    if (!value) {
      toast.warning("Enter a username", "Type a GitHub username or profile URL first.");
      return;
    }
    void runFetchAnalyze({ username: value, useAccount: false });
  };

  const onUseAccount = () => {
    void runFetchAnalyze({ username: null, useAccount: true });
  };

  const addRepos = useCallback(
    async (repos: GithubRepo[], setBusy: (v: boolean) => void) => {
      setBusy(true);
      try {
        const res = await saveRepos(repos, skillsForRepos(repos));
        saved.reload();
        const label = repos.length === 1 ? repos[0].repo_name : plural(res.saved_repos, "repo");
        toast.success("Added to profile", `${label} · ${plural(res.added_skills, "skill")} added.`);
      } catch (err) {
        toast.danger("Couldn't add to profile", errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [saved, skillsForRepos],
  );

  const handleAdd = (repo: GithubRepo) => void addRepos([repo], (v) => setSavingName(v ? repo.repo_name : null));
  const handleAddAll = () => void addRepos(availableRepos, setSavingAll);

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    const id = savedByName.get(pendingRemove.repo_name)?.id;
    if (id == null) {
      toast.danger("Couldn't remove", "This repository is not linked to a saved record.");
      setPendingRemove(null);
      return;
    }
    setRemoving(true);
    try {
      await deleteSavedRepo(id);
      saved.reload();
      toast.success("Removed from profile", `${pendingRemove.repo_name} was removed.`);
      setPendingRemove(null);
    } catch (err) {
      toast.danger("Couldn't remove", errorMessage(err));
    } finally {
      setRemoving(false);
    }
  };

  const busy = fetching || phase === "analyzing";

  /* Saved-repos section, reused on the connect + results screens. */
  const profileSection = (
    <section>
      <SectionHead
        label="IN YOUR PROFILE"
        count={savedRepos.length}
        tone="success"
        right={<span className="font-mono text-[10px] text-fg-low">click a repo to view its analysis</span>}
      />
      {saved.error ? (
        <SavedError message={saved.error} onRetry={saved.reload} />
      ) : saved.loading && savedRepos.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-fg-mid">
          <Spinner size={18} />
        </div>
      ) : savedRepos.length === 0 ? (
        <p className="rounded-[13px] border border-dashed border-border bg-surface px-4 py-3 text-[12px] text-fg-mid">
          No repos in your profile yet — fetch an account and add one below.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {savedRepos.map((r) => (
            <RepoCard key={r.id ?? r.repo_name} repo={r} inProfile onOpen={() => setSelected(r)} onRemove={() => setPendingRemove(r)} />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <Page
      eyebrow="SETUP / GITHUB IMPORT"
      title={
        <span className="inline-flex items-center gap-2.5">
          <GithubMark size={21} />
          GitHub Import
        </span>
      }
      actions={<AccountChip connected={status.data?.account_connected ?? false} profile={profile} />}
      bodyClassName="px-7 py-6"
    >
      <AsyncBoundary
        state={status}
        skeleton={
          <div className="flex items-center justify-center py-24 text-fg-mid">
            <Spinner size={22} />
          </div>
        }
      >
        {(st) => (
          <div className="flex flex-col">
            <ConnectRow
              username={username}
              onUsername={setUsername}
              onFetch={onFetch}
              onUseAccount={onUseAccount}
              connected={st.account_connected}
              busy={busy}
            />

            {phase === "connect" ? (
              <div className="cll-fade">
                {savedRepos.length > 0 || saved.loading || saved.error ? (
                  profileSection
                ) : (
                  <EmptyState
                    icon={<GithubMark size={26} />}
                    title="Connect a GitHub account"
                    description="Enter a username above and we'll pull the public repositories, then analyze them into skills and projects — the account name is all that leaves your device."
                    action={
                      st.account_connected ? (
                        <Button variant="outline" size="sm" onClick={onUseAccount} loading={busy}>
                          Use my connected account
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </div>
            ) : null}

            {phase === "analyzing" ? (
              <div className="flex flex-col gap-3.5">
                <div className="cll-fade flex items-center gap-3 rounded-[14px] border border-border bg-surface px-5 py-4">
                  <Loader2 size={18} className="shrink-0 animate-spin text-accent-text" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-fg">Analyzing repositories…</div>
                    <div className="mt-2">
                      <ProgressBar value={progress} />
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-fg-mid">{plural(fetchedRepos.length, "repo")}</span>
                </div>

                <SectionHead label="READING FROM GITHUB" count={fetchedRepos.length} tone="low" />
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {fetchedRepos.map((r) => (
                    <RepoCard key={r.id ?? r.repo_name} repo={r} inProfile={false} analyzing />
                  ))}
                </div>
              </div>
            ) : null}

            {phase === "results" ? (
              <div className="flex flex-col gap-3.5">
                {profileSection}

                <section>
                  <SectionHead
                    label="AVAILABLE ON GITHUB"
                    count={availableRepos.length}
                    tone="low"
                    right={
                      availableRepos.length > 0 ? (
                        <Button variant="primary" size="sm" className="rounded-[9px]" loading={savingAll} onClick={handleAddAll}>
                          <Sparkles size={13} />
                          Add all to profile
                        </Button>
                      ) : null
                    }
                  />
                  {availableRepos.length === 0 ? (
                    <p className="rounded-[13px] border border-dashed border-border bg-surface px-4 py-3 text-[12px] text-fg-mid">
                      Every analyzed repository has been added to your profile.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                      {availableRepos.map((r) => (
                        <RepoCard key={r.id ?? r.repo_name} repo={r} inProfile={false} onOpen={() => setSelected(r)} />
                      ))}
                    </div>
                  )}
                </section>

                <SkillsCard skills={analysis?.skills ?? []} repoCount={analysis?.repos.length ?? 0} />
                <OpenSourceBanner />
              </div>
            ) : null}
          </div>
        )}
      </AsyncBoundary>

      {selected ? (
        <RepoDetail
          repo={savedByName.get(selected.repo_name) ?? selected}
          inProfile={isInProfile(selected)}
          saving={savingName === selected.repo_name}
          onClose={() => setSelected(null)}
          onAdd={() => handleAdd(selected)}
          onRemove={() => {
            setPendingRemove(selected);
            setSelected(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!pendingRemove}
        onOpenChange={(o) => !o && setPendingRemove(null)}
        tone="danger"
        icon={<Trash2 size={20} />}
        title="Remove from profile?"
        description={
          pendingRemove
            ? `“${pendingRemove.repo_name}” and its imported skills will be removed from your profile. This won't touch anything on GitHub.`
            : undefined
        }
        confirmLabel="Remove"
        loading={removing}
        onConfirm={confirmRemove}
      />
    </Page>
  );
}
