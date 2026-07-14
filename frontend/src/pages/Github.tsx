import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, ExternalLink, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { Page } from "@/components/common/Page";
import { OpenSourceBanner } from "@/components/common/OpenSourceBanner";
import { Button } from "@/components/ui/button";
import { StatDot, EmptyState, ProgressBar } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

/* ── State model ─────────────────────────────────────────────────
   Backend wiring is deferred; the "PREVIEW STATE" switcher (from the
   design) drives local state so every variant is viewable. When we wire
   the backend, `state` is derived from real data (connected account /
   fetched repos / analysis in flight) and the switcher becomes a dev
   affordance. */
type GhState = "connect" | "analyzing" | "results";

const STATE_OPTIONS: { value: GhState; label: string; desc: string }[] = [
  { value: "connect", label: "Connect", desc: "No account linked yet" },
  { value: "analyzing", label: "Analyzing", desc: "Fetching and reading repos" },
  { value: "results", label: "Results", desc: "Repos analyzed and imported" },
];

/* ── Data (design placeholder — no backend calls) ───────────────── */
const LANG_COLORS = {
  Python: "#3572A5",
  Rust: "#dea584",
  TypeScript: "#3178c6",
  Go: "#00ADD8",
  Shell: "#89e051",
  HTML: "#e34c26",
} as const;

type Repo = {
  id: string;
  name: string;
  stars: string;
  lang: keyof typeof LANG_COLORS;
  desc: string;
  summary: string;
  involvement: string[];
  tech: string[];
};

/* First three ship in the profile by default; the rest are fetched but
   not yet imported. */
const REPOS: Repo[] = [
  {
    id: "llm-serve",
    name: "llm-serve",
    stars: "1.2k",
    lang: "Python",
    desc: "High-throughput inference server for open-weight LLMs — continuous batching and token streaming.",
    summary:
      "A production-grade inference server for open-weight LLMs. Handles continuous batching, token-level streaming over SSE, and a paged KV-cache that keeps GPU memory bounded under load.",
    involvement: [
      "Author and lead maintainer — 1.2k stars, 40+ contributors.",
      "Designed the continuous-batching scheduler and paged KV-cache.",
      "Owns the release process and the CUDA kernel benchmarks.",
    ],
    tech: ["Python", "LLM inference", "Token streaming", "Batching", "CUDA"],
  },
  {
    id: "vector-index",
    name: "vector-index",
    stars: "842",
    lang: "Rust",
    desc: "Approximate nearest-neighbor index with on-disk quantization for billion-scale embeddings.",
    summary:
      "An approximate nearest-neighbor index built for billion-scale embeddings, with on-disk product quantization and SIMD-accelerated distance kernels.",
    involvement: [
      "Core author of the on-disk quantization format.",
      "Wrote the SIMD distance kernels (AVX-512 / NEON).",
      "Benchmarked recall and latency against FAISS and HNSWlib.",
    ],
    tech: ["Rust", "Vector search", "Quantization", "ANN indexing", "SIMD"],
  },
  {
    id: "promptkit",
    name: "promptkit",
    stars: "517",
    lang: "TypeScript",
    desc: "Composable prompt templates and offline evals for local models — zero external calls.",
    summary:
      "A zero-dependency toolkit for composing prompt templates and running offline evals against local models — no external API calls, everything stays on-device.",
    involvement: [
      "Created the template DSL and the eval runner.",
      "Designed the snapshot-based regression tests.",
      "Maintains the docs and the example gallery.",
    ],
    tech: ["TypeScript", "Prompt templates", "Evals", "Token streaming", "Local models"],
  },
  {
    id: "token-stream",
    name: "token-stream",
    stars: "293",
    lang: "TypeScript",
    desc: "Server-sent-events helper for streaming model tokens to the browser with backpressure.",
    summary:
      "A small server-sent-events helper for streaming model tokens to the browser, with backpressure handling and automatic reconnection.",
    involvement: [
      "Sole author of the library.",
      "Handles backpressure and reconnection edge cases.",
      "Used in three downstream projects.",
    ],
    tech: ["TypeScript", "SSE", "Backpressure", "Streaming", "Node.js"],
  },
  {
    id: "mini-rag",
    name: "mini-rag",
    stars: "421",
    lang: "Python",
    desc: "A 400-line retrieval-augmented-generation reference with pluggable vector stores.",
    summary:
      "A 400-line reference implementation of retrieval-augmented generation, with pluggable vector stores and swappable chunking strategies.",
    involvement: [
      "Author of the reference implementation.",
      "Kept the codebase deliberately small and readable.",
      "Documented the retrieval trade-offs in the README.",
    ],
    tech: ["Python", "RAG", "Embeddings", "Retrieval", "Chunking"],
  },
  {
    id: "gguf-tools",
    name: "gguf-tools",
    stars: "176",
    lang: "Go",
    desc: "CLI to inspect, convert and quantize GGUF model files.",
    summary:
      "A command-line toolkit to inspect, convert and quantize GGUF model files, with a readable dump of tensor metadata.",
    involvement: [
      "Author and maintainer.",
      "Implemented the GGUF parser and the quantizer.",
      "Added round-trip conversion tests.",
    ],
    tech: ["Go", "GGUF", "Quantization", "CLI", "Model conversion"],
  },
  {
    id: "dotfiles",
    name: "dotfiles",
    stars: "88",
    lang: "Shell",
    desc: "My terminal, editor and shell setup — Zsh, Neovim, Tmux.",
    summary:
      "Personal terminal, editor and shell configuration — Zsh, Neovim and Tmux tuned for a keyboard-driven workflow.",
    involvement: ["Personal configuration repo.", "No collaborators."],
    tech: ["Shell", "Zsh", "Neovim", "Tmux"],
  },
  {
    id: "resume-site",
    name: "resume-site",
    stars: "34",
    lang: "HTML",
    desc: "Personal site and CV, hand-built and static.",
    summary: "A static personal site and CV, hand-built with semantic HTML and CSS — no framework.",
    involvement: ["Personal project.", "Static, deployed on a CDN."],
    tech: ["HTML", "CSS", "Static site"],
  },
];

const DEFAULT_PROFILE_IDS = ["llm-serve", "vector-index", "promptkit"];

/* ── Icons (design SVGs kept for fidelity) ──────────────────────── */
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

/* ── Account chip (header, right) ───────────────────────────────── */
function AccountChip({ connected }: { connected: boolean }) {
  if (!connected) {
    return (
      <div className="flex items-center gap-2.5 rounded-[11px] border border-border-strong bg-surface py-2 pl-2.5 pr-3.5">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-border bg-surface-2 text-fg-low">
          <GithubMark size={15} />
        </span>
        <span className="leading-tight">
          <span className="block text-[13px] font-semibold text-fg-mid">No account</span>
          <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] text-fg-low">
            <span className="h-[5px] w-[5px] rounded-full" style={{ background: "var(--text-low)" }} />
            NOT CONNECTED
          </span>
        </span>
      </div>
    );
  }
  return (
    <a
      href="https://github.com/jrivera"
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2.5 rounded-[11px] border border-border-strong bg-surface py-2 pl-2.5 pr-3.5 no-underline transition-colors hover:border-accent"
    >
      <span
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-[12px] font-bold text-white"
        style={{ background: "var(--accent-grad)" }}
      >
        JR
      </span>
      <span className="leading-tight">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
          @jrivera
          <ExternalLink size={12} className="text-fg-low" />
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] text-success">
          <StatDot tone="success" glow size={5} />
          CONNECTED
        </span>
      </span>
    </a>
  );
}

/* ── Repo card ──────────────────────────────────────────────────── */
type RepoCardProps = {
  repo: Repo;
  inProfile: boolean;
  analyzing?: boolean;
  queued?: boolean;
  onOpen: () => void;
  onRemove?: () => void;
};

function RepoCard({ repo, inProfile, analyzing = false, queued = false, onOpen, onRemove }: RepoCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group cursor-pointer rounded-[13px] border border-border bg-surface p-4 text-left outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-weak"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-[7px] text-[14px] font-[650]">
          <GithubMark size={14} className="shrink-0 text-fg-low" />
          <span className="truncate text-fg">{repo.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-fg-mid">
          <StarIcon size={11} />
          {repo.stars}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-[11.5px] leading-[1.55] text-fg-mid">{repo.desc}</p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10.5px] text-fg-mid">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LANG_COLORS[repo.lang] }} />
          {repo.lang}
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
                title="Remove analysis from profile"
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
        ) : queued ? (
          <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2.5 py-[3px] font-mono text-[9px] uppercase tracking-[0.5px] text-fg-low">
            Queued
          </span>
        ) : (
          <ChevronRight size={16} className="shrink-0 text-fg-low transition-colors group-hover:text-accent-text" />
        )}
      </div>
    </div>
  );
}

/* ── Section header (mono label + right slot) ───────────────────── */
function SectionHead({
  label,
  count,
  tone,
  right,
}: {
  label: string;
  count: number;
  tone: "success" | "low";
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className={cn("font-mono text-[10px] tracking-[1px]", tone === "success" ? "text-success" : "text-fg-low")}>
        {label} · {count}
      </span>
      {right}
    </div>
  );
}

/* ── Detected skills ────────────────────────────────────────────── */
function SkillsCard({ repos }: { repos: Repo[] }) {
  const counts = new Map<string, number>();
  for (const r of repos) for (const t of r.tech) counts.set(t, (counts.get(t) ?? 0) + 1);
  const skills = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <div className="cll-fade rounded-[14px] border border-border bg-surface px-5 py-[18px]">
      <div className="mb-3.5 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] tracking-[1px] text-fg-low">
          <Sparkles size={12} className="text-accent-text" />
          DETECTED SKILLS · {skills.length}
        </span>
        <span className="font-mono text-[10px] text-fg-low">
          from {repos.length} analyzed {repos.length === 1 ? "repo" : "repos"}
        </span>
      </div>
      {skills.length === 0 ? (
        <p className="text-[12px] text-fg-mid">Analyze a repository to pull its skills into your profile.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {skills.map(([name, n]) => (
            <span
              key={name}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[12px] text-fg"
            >
              {name}
              {n > 1 ? <span className="font-mono text-[9.5px] text-accent-text">×{n}</span> : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Repo detail modal (AI summary / involvement / tech) ────────── */
function RepoDetail({
  repo,
  inProfile,
  onClose,
  onToggle,
}: {
  repo: Repo;
  inProfile: boolean;
  onClose: () => void;
  onToggle: (id: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${repo.name} analysis`}
    >
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-y-auto rounded-[16px] border border-border-strong bg-surface-3 p-6 shadow-[0_24px_54px_-20px_rgba(0,0,0,.8)]"
        style={{ animation: "cll-menu .16s ease" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[16px] font-bold tracking-[-0.3px] text-fg">
              <GithubMark size={16} className="text-fg-low" />
              <span className="truncate">{repo.name}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-fg-mid">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: LANG_COLORS[repo.lang] }} />
                {repo.lang}
              </span>
              <span className="flex items-center gap-1 font-mono">
                <StarIcon size={11} />
                {repo.stars}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-border bg-surface-2 text-fg-mid transition-colors hover:text-fg"
          >
            <X size={15} />
          </button>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-fg-mid">{repo.desc}</p>

        <div className="mt-4 rounded-[11px] border border-border bg-surface-2 p-3.5">
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[1px] text-accent-text">
            <Sparkles size={12} />
            AI Summary
          </div>
          <p className="text-[12.5px] leading-relaxed text-fg">{repo.summary}</p>
        </div>

        <div className="mt-4">
          <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[1px] text-fg-low">Your involvement</div>
          <ul className="flex flex-col gap-2">
            {repo.involvement.map((line) => (
              <li key={line} className="flex gap-2.5 text-[12.5px] leading-relaxed text-fg">
                <Check size={14} strokeWidth={2.4} className="mt-0.5 shrink-0 text-success" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[1px] text-fg-low">Tech</div>
          <div className="flex flex-wrap gap-2">
            {repo.tech.map((t) => (
              <span key={t} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 font-mono text-[10px] text-fg-mid">
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2.5 border-t border-border pt-4">
          {inProfile ? (
            <>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-success">
                <Check size={14} strokeWidth={2.6} />
                In your profile
              </span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => onToggle(repo.id)}>
                <Trash2 size={13} />
                Remove
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" size="md" onClick={() => onToggle(repo.id)}>
                <Sparkles size={14} />
                Add to profile
              </Button>
              <div className="flex-1" />
            </>
          )}
          <a
            href={`https://github.com/jrivera/${repo.name}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-border-strong bg-surface px-3 py-2 text-[12px] font-medium text-fg no-underline transition-colors hover:bg-surface-2"
          >
            View on GitHub
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Intro + connect input (shared across states) ───────────────── */
function ConnectRow({ user, onUser, onFetch }: { user: string; onUser: (v: string) => void; onFetch: () => void }) {
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
            value={user}
            onChange={(e) => onUser(e.target.value)}
            placeholder="github username or profile URL"
            className="h-11 w-full rounded-[11px] border border-border-strong bg-input pl-[38px] pr-3.5 font-mono text-[13px] text-fg outline-none transition-[border-color,box-shadow] placeholder:text-fg-low focus:border-accent focus:ring-[3px] focus:ring-accent-weak"
          />
        </div>
        <Button type="submit" variant="primary" size="md" className="h-11 rounded-[11px] px-5">
          Fetch repos
        </Button>
      </form>
    </div>
  );
}

/* ── Preview-state switcher (matches Home) ──────────────────────── */
function StateSwitcher({ state, onPick }: { state: GhState; onPick: (s: GhState) => void }) {
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

/* ── Page ───────────────────────────────────────────────────────── */
export function Github() {
  const [state, setState] = useState<GhState>("results");
  const [user, setUser] = useState("jrivera");
  const [profileIds, setProfileIds] = useState<string[]>(DEFAULT_PROFILE_IDS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep the connect input in sync with the previewed state.
  useEffect(() => {
    setUser(state === "connect" ? "" : "jrivera");
  }, [state]);

  const inProfile = (id: string) => profileIds.includes(id);
  const toggleProfile = (id: string) =>
    setProfileIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const handleFetch = () => {
    if (state === "connect" && user.trim()) setState("analyzing");
  };

  const selected = selectedId ? REPOS.find((r) => r.id === selectedId) ?? null : null;
  const profileRepos = REPOS.filter((r) => inProfile(r.id));
  const availableRepos = REPOS.filter((r) => !inProfile(r.id));

  return (
    <Page
      eyebrow="SETUP / GITHUB IMPORT"
      title={
        <span className="inline-flex items-center gap-2.5">
          <GithubMark size={21} />
          GitHub Import
        </span>
      }
      actions={
        <>
          <AccountChip connected={state !== "connect"} />
          <StateSwitcher state={state} onPick={setState} />
        </>
      }
      bodyClassName="px-7 py-6"
    >
      <div className="flex flex-col">
        <ConnectRow user={user} onUser={setUser} onFetch={handleFetch} />

        {state === "connect" ? (
          <div className="cll-fade">
            <EmptyState
              icon={<GithubMark size={26} />}
              title="Connect a GitHub account"
              description="Enter a username above and we'll pull the public repositories, then analyze them into skills and projects — the account name is all that leaves your device."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setUser("jrivera");
                    setState("analyzing");
                  }}
                >
                  Try a sample account
                </Button>
              }
            />
          </div>
        ) : null}

        {state === "analyzing" ? (
          <div className="flex flex-col gap-3.5">
            <div className="cll-fade flex items-center gap-3 rounded-[14px] border border-border bg-surface px-5 py-4">
              <Loader2 size={18} className="shrink-0 animate-spin text-accent-text" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-fg">Analyzing repositories…</div>
                <div className="mt-2">
                  <ProgressBar value={62} />
                </div>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-fg-mid">5 of {REPOS.length}</span>
            </div>

            <SectionHead label="READING FROM GITHUB" count={REPOS.length} tone="low" />
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {REPOS.map((r, i) => (
                <RepoCard key={r.id} repo={r} inProfile={false} analyzing={i < 5} queued={i >= 5} onOpen={() => setSelectedId(r.id)} />
              ))}
            </div>
          </div>
        ) : null}

        {state === "results" ? (
          <div className="flex flex-col gap-3.5">
            <section>
              <SectionHead
                label="IN YOUR PROFILE"
                count={profileRepos.length}
                tone="success"
                right={<span className="font-mono text-[10px] text-fg-low">click a repo to view its analysis</span>}
              />
              {profileRepos.length === 0 ? (
                <p className="rounded-[13px] border border-dashed border-border bg-surface px-4 py-3 text-[12px] text-fg-mid">
                  No repos in your profile yet — open one below and add it.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {profileRepos.map((r) => (
                    <RepoCard key={r.id} repo={r} inProfile onOpen={() => setSelectedId(r.id)} onRemove={() => toggleProfile(r.id)} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <SectionHead
                label="AVAILABLE ON GITHUB"
                count={availableRepos.length}
                tone="low"
                right={
                  availableRepos.length > 0 ? (
                    <Button variant="primary" size="sm" className="rounded-[9px]" onClick={() => setProfileIds(REPOS.map((r) => r.id))}>
                      <Sparkles size={13} />
                      Analyze all
                    </Button>
                  ) : null
                }
              />
              {availableRepos.length === 0 ? (
                <p className="rounded-[13px] border border-dashed border-border bg-surface px-4 py-3 text-[12px] text-fg-mid">
                  Every repository has been analyzed and added to your profile.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {availableRepos.map((r) => (
                    <RepoCard key={r.id} repo={r} inProfile={false} onOpen={() => setSelectedId(r.id)} />
                  ))}
                </div>
              )}
            </section>

            <SkillsCard repos={profileRepos} />
            <OpenSourceBanner />
          </div>
        ) : null}
      </div>

      {selected ? (
        <RepoDetail repo={selected} inProfile={inProfile(selected.id)} onClose={() => setSelectedId(null)} onToggle={toggleProfile} />
      ) : null}
    </Page>
  );
}
