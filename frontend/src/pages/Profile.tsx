import { useEffect, useState, type ReactNode } from "react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { StatDot } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

/* ══════════════════════════════════════════════════════════════════
   Profile & Skills
   Faithful translation of the "02-profile" screen, folding in the
   detail/modal explorations from ProfileSectionDesigns.

   Backend wiring is deferred. Everything is local state:
     • preview data-state tabs (the design's "PREVIEW · DATA STATE"
       bar) switch how full the profile is — driving every section's
       empty ⇄ full state.
     • clicking any item card opens an item detail modal.
     • the header "AI complete empty fields" button opens the AI panel.
     • the empty summary "Generate" button opens the AI summary studio.
   ══════════════════════════════════════════════════════════════════ */

/* ── Domain types ─────────────────────────────────────────────────── */
type Source = "manual" | "cv" | "github" | "linkedin";
type SkillWeight = "primary" | "strong" | "normal" | "learning";

type Identity = {
  initials: string;
  name: string;
  subline: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
};
type Summary = { text: string; words: number; keywords: number; source: Source };
type Skill = { id: string; name: string; category: string; level: number; weight: SkillWeight; source: Source };
type Experience = {
  id: string;
  title: string;
  company: string;
  period: string;
  tags: string[];
  description: string;
  source: Source;
  current?: boolean;
};
type Education = { id: string; degree: string; school: string; meta: string; courses: string[]; source: Source };
type Language = { id: string; name: string; level: string; pct: number; source: Source };
type Project = { id: string; name: string; role: string; desc: string; tags: string[]; url?: string; stars?: number; source: Source };
type Certificate = { id: string; name: string; issuer: string; source: Source };
type Training = { id: string; name: string; provider: string; completed: string; url?: string; source: Source };
type LinkItem = { id: string; label: string; url: string; source: Source };

type ProfileData = {
  identity: Identity;
  summary?: Summary;
  skills: Skill[];
  experience: Experience[];
  education: Education[];
  languages: Language[];
  projects: Project[];
  certificates: Certificate[];
  trainings: Training[];
  links: LinkItem[];
};

/* ── Placeholder data (verbatim from the design) ──────────────────── */
const FULL: ProfileData = {
  identity: {
    initials: "JR",
    name: "Jordan Rivera",
    subline: "Senior ML Engineer · Latent Labs",
    email: "jordan.rivera@example.com",
    phone: "+1 (555) 019-2834",
    linkedin: "in/jordanrivera",
    github: "jrivera",
  },
  summary: {
    text:
      "ML engineer focused on evaluation and reliability — I build measurement tooling that turns model quality into something teams can see and trust, and I ship it end to end.",
    words: 42,
    keywords: 3,
    source: "cv",
  },
  skills: [
    { id: "sk-pytorch", name: "PyTorch", category: "Machine Learning", level: 5, weight: "primary", source: "cv" },
    { id: "sk-eval", name: "Evaluation", category: "Machine Learning", level: 5, weight: "strong", source: "cv" },
    { id: "sk-python", name: "Python", category: "Languages", level: 4, weight: "normal", source: "cv" },
    { id: "sk-rust", name: "Rust", category: "Languages", level: 4, weight: "normal", source: "github" },
    { id: "sk-dist", name: "Distributed training", category: "Machine Learning", level: 4, weight: "normal", source: "cv" },
    { id: "sk-rlhf", name: "RLHF", category: "Machine Learning", level: 2, weight: "learning", source: "manual" },
    { id: "sk-triton", name: "Triton", category: "Infrastructure", level: 2, weight: "learning", source: "github" },
    { id: "sk-cuda", name: "CUDA", category: "Infrastructure", level: 2, weight: "learning", source: "github" },
    { id: "sk-docker", name: "Docker", category: "Infrastructure", level: 2, weight: "learning", source: "manual" },
  ],
  experience: [
    {
      id: "xp-latent",
      title: "Senior ML Engineer",
      company: "Latent Labs",
      period: "2023 — Now",
      tags: ["Full-time", "Remote"],
      description: "Owned the on-device eval harness; cut model regression detection from days to minutes.",
      source: "cv",
      current: true,
    },
    {
      id: "xp-corevance",
      title: "ML Engineer",
      company: "Corevance",
      period: "2021 — 23",
      tags: ["Full-time"],
      description: "Built distributed training pipelines used by 60+ engineers across the org.",
      source: "cv",
    },
    {
      id: "xp-berkeley",
      title: "Research Assistant",
      company: "UC Berkeley",
      period: "2019 — 21",
      tags: ["Part-time"],
      description: "Researched evaluation methods for reinforcement learning from human feedback.",
      source: "manual",
    },
  ],
  education: [
    {
      id: "ed-berkeley",
      degree: "B.S. Computer Science",
      school: "UC Berkeley",
      meta: "2018 — 2022 · GPA 3.8",
      courses: ["Machine Learning", "Distributed Systems", "Algorithms"],
      source: "cv",
    },
  ],
  languages: [
    { id: "lg-en", name: "English", level: "Native", pct: 100, source: "manual" },
    { id: "lg-es", name: "Spanish", level: "Professional", pct: 75, source: "manual" },
    { id: "lg-fr", name: "French", level: "Basic", pct: 35, source: "manual" },
  ],
  projects: [
    {
      id: "pr-evalkit",
      name: "eval-kit",
      role: "Owner",
      desc: "On-device model evaluation harness with per-commit regression tracking.",
      tags: ["Python", "Rust"],
      url: "github.com/jrivera/eval-kit",
      stars: 214,
      source: "github",
    },
    {
      id: "pr-stream",
      name: "stream-parse",
      role: "Author",
      desc: "Streaming JSON parser for token-by-token LLM output.",
      tags: ["TypeScript"],
      url: "github.com/jrivera/stream-parse",
      stars: 96,
      source: "github",
    },
    {
      id: "pr-triton",
      name: "tiny-triton",
      role: "Contributor",
      desc: "Minimal Triton kernels for 4-bit inference.",
      tags: ["CUDA"],
      url: "github.com/jrivera/tiny-triton",
      source: "github",
    },
  ],
  certificates: [
    { id: "ct-dl", name: "Deep Learning Specialization", issuer: "Coursera", source: "cv" },
    { id: "ct-aws", name: "AWS Machine Learning — Specialty", issuer: "AWS", source: "manual" },
    { id: "ct-tf", name: "TensorFlow Developer", issuer: "Google", source: "manual" },
  ],
  trainings: [
    { id: "tr-mlops", name: "MLOps Specialization", provider: "DeepLearning.AI", completed: "2023", url: "coursera.org/learn/mlops", source: "cv" },
    { id: "tr-llm", name: "Full Stack LLM Bootcamp", provider: "The Full Stack", completed: "2023", source: "linkedin" },
    { id: "tr-kube", name: "Kubernetes for ML Workloads", provider: "Linux Foundation", completed: "2022", source: "manual" },
  ],
  links: [
    { id: "ln-site", label: "Portfolio", url: "jordanrivera.dev", source: "manual" },
    { id: "ln-gh", label: "GitHub", url: "github.com/jrivera", source: "github" },
    { id: "ln-li", label: "LinkedIn", url: "linkedin.com/in/jordanrivera", source: "linkedin" },
  ],
};

/* Derived preview states — same shape, trimmed to exercise empty views. */
const CV_ONLY: ProfileData = { ...FULL, projects: [], links: [] };

const SPARSE: ProfileData = {
  identity: { initials: "AC", name: "Alex Chen", subline: "Software Engineer", email: "alex.chen@example.com" },
  skills: [
    { id: "sp-py", name: "Python", category: "Languages", level: 4, weight: "strong", source: "manual" },
    { id: "sp-react", name: "React", category: "Frontend", level: 2, weight: "learning", source: "manual" },
  ],
  experience: [
    {
      id: "sp-fe",
      title: "Frontend Engineer",
      company: "Northwind",
      period: "2022 — Now",
      tags: ["Full-time"],
      description: "Building the design system and shipping product surfaces.",
      source: "manual",
    },
  ],
  education: [],
  languages: [],
  projects: [],
  certificates: [],
  trainings: [],
  links: [],
};

const EMPTY: ProfileData = {
  identity: { initials: "YN", name: "Your name", subline: "Add your title" },
  skills: [],
  experience: [],
  education: [],
  languages: [],
  projects: [],
  certificates: [],
  trainings: [],
  links: [],
};

/* ── Preview data-state switcher (the design's top bar) ───────────── */
type PreviewState = "full" | "cv" | "sparse" | "empty";
const PREVIEW_TABS: { value: PreviewState; label: string; count: number; hint: string; sync: string }[] = [
  { value: "full", label: "Full profile", count: 28, hint: "Complete profile — ready to write.", sync: "Synced from CV & GitHub" },
  { value: "cv", label: "From CV", count: 22, hint: "Imported from your CV — add projects & links.", sync: "Synced from CV" },
  { value: "sparse", label: "Sparse", count: 3, hint: "A few fields filled — let AI complete the rest.", sync: "Partially filled" },
  { value: "empty", label: "Empty", count: 0, hint: "Nothing yet — import a CV or let AI infer it.", sync: "Nothing synced yet" },
];
const DATA_BY_STATE: Record<PreviewState, ProfileData> = { full: FULL, cv: CV_ONLY, sparse: SPARSE, empty: EMPTY };

/* ══════════════════════════════════════════════════════════════════
   Page
   ══════════════════════════════════════════════════════════════════ */
type DetailKind = "skill" | "experience" | "education" | "project" | "certificate" | "training" | "link" | "language";
type Detail = { kind: DetailKind; id: string };

export function Profile() {
  const [preview, setPreview] = useState<PreviewState>("full");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const data = DATA_BY_STATE[preview];
  const tab = PREVIEW_TABS.find((t) => t.value === preview)!;
  const anyOpen = detail !== null || aiOpen || summaryOpen;

  useEffect(() => {
    if (!anyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDetail(null);
        setAiOpen(false);
        setSummaryOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyOpen]);

  const open = (kind: DetailKind, id: string) => setDetail({ kind, id });

  return (
    <Page
      eyebrow="WORKSPACE / PROFILE"
      title="Profile & Skills"
      actions={
        <>
          <span className="hidden items-center gap-1.5 text-[11.5px] text-fg-mid sm:flex">
            <StatDot tone={preview === "empty" ? "neutral" : preview === "sparse" ? "warning" : "success"} glow size={6} />
            {tab.sync}
          </span>
          <Button variant="primary" size="md" onClick={() => setAiOpen(true)}>
            <SparkleIcon size={15} /> AI complete empty fields
          </Button>
        </>
      }
      bodyClassName="px-7 py-5"
    >
      {/* preview data-state bar (edge-to-edge under the header) */}
      <PreviewBar tabs={PREVIEW_TABS} value={preview} hint={tab.hint} onPick={setPreview} />

      <div className="flex flex-col gap-4">
        {/* Identity */}
        <IdentityCard identity={data.identity} />

        {/* Skills · Experience */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <SkillsCard skills={data.skills} onOpen={(id) => open("skill", id)} />
          <ExperienceCard experience={data.experience} onOpen={(id) => open("experience", id)} />
        </div>

        {/* Summary */}
        <SummaryCard summary={data.summary} onGenerate={() => setSummaryOpen(true)} />

        {/* Education · Languages */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <EducationCard education={data.education} onOpen={(id) => open("education", id)} />
          <LanguagesCard languages={data.languages} onOpen={(id) => open("language", id)} />
        </div>

        {/* Projects */}
        <ProjectsCard projects={data.projects} onOpen={(id) => open("project", id)} />

        {/* Certificates · Links */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <CertificatesCard certificates={data.certificates} onOpen={(id) => open("certificate", id)} />
          <LinksCard links={data.links} onOpen={(id) => open("link", id)} />
        </div>

        {/* Trainings */}
        <TrainingsCard trainings={data.trainings} onOpen={(id) => open("training", id)} />
      </div>

      {detail ? <DetailModal data={data} detail={detail} onClose={() => setDetail(null)} /> : null}
      {aiOpen ? <AiCompleteModal data={data} onClose={() => setAiOpen(false)} /> : null}
      {summaryOpen ? <SummaryStudioModal onClose={() => setSummaryOpen(false)} /> : null}
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Preview bar
   ══════════════════════════════════════════════════════════════════ */
function PreviewBar({
  tabs,
  value,
  hint,
  onPick,
}: {
  tabs: typeof PREVIEW_TABS;
  value: PreviewState;
  hint: string;
  onPick: (s: PreviewState) => void;
}) {
  return (
    <div className="-mx-7 -mt-5 mb-4 flex flex-wrap items-center gap-3.5 border-b border-border bg-surface-2 px-7 py-[11px]">
      <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[9.5px] tracking-[1.2px] text-fg-low">
        <span className="h-1.5 w-1.5 rounded-[2px] bg-accent" />
        PREVIEW · DATA STATE
      </span>
      <div className="flex gap-1 rounded-[11px] border border-border bg-input p-1">
        {tabs.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onPick(t.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                active ? "bg-surface text-fg shadow-[0_1px_0_rgba(0,0,0,.3)]" : "text-fg-mid hover:text-fg",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-px font-mono text-[9px]",
                  active ? "bg-accent-weak text-accent-text" : "bg-surface-2 text-fg-low",
                )}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>
      <span className="ml-auto whitespace-nowrap text-[11.5px] text-fg-mid">{hint}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Section shell + shared bits
   ══════════════════════════════════════════════════════════════════ */
function SectionCard({
  title,
  meta,
  headerExtra,
  onAdd,
  addLabel,
  children,
  className,
}: {
  title: string;
  meta?: ReactNode;
  headerExtra?: ReactNode;
  onAdd?: boolean;
  addLabel: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("cll-fade rounded-[12px] border border-border bg-surface px-5 py-[18px]", className)}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[14px] font-semibold text-fg">{title}</span>
        <div className="flex items-center gap-2.5">
          {meta ? <span className="font-mono text-[10px] text-fg-low">{meta}</span> : null}
          {headerExtra}
          {onAdd ? <AddButton title={addLabel} /> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Small "+" affordance — no handler (add flow deferred). */
function AddButton({ title, size = 26 }: { title: string; size?: number }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="flex items-center justify-center rounded-[8px] border border-border-strong bg-surface-2 text-fg-mid transition-colors hover:border-accent hover:text-accent-text"
      style={{ width: size, height: size }}
    >
      <PlusIcon size={13} strokeWidth={1.8} />
    </button>
  );
}

/** Dashed "empty section" prompt (add flow deferred → plain button). */
function EmptyPrompt({ children, minimal = false }: { children: ReactNode; minimal?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-[10px] border border-dashed border-border-strong bg-input text-center text-[12.5px] text-fg-mid transition-colors hover:border-accent",
        minimal ? "p-[18px]" : "p-5",
      )}
    >
      {children}
    </button>
  );
}

const SOURCE_META: Record<Source, { label: string; className?: string; style?: React.CSSProperties; dot: string }> = {
  cv: { label: "CV", className: "bg-accent-weak text-accent-text", dot: "var(--accent)" },
  github: { label: "GitHub", style: { background: "rgba(196,181,253,.14)", color: "#c4b5fd" }, dot: "#c4b5fd" },
  linkedin: { label: "LinkedIn", style: { background: "rgba(147,197,253,.14)", color: "#93c5fd" }, dot: "#93c5fd" },
  manual: { label: "Manual", className: "bg-surface-2 text-fg-mid", dot: "var(--text-low)" },
};

/** Provenance badge — where an item came from. */
function SourceBadge({ source, className }: { source: Source; className?: string }) {
  const m = SOURCE_META[source];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] leading-none",
        m.className,
        className,
      )}
      style={m.style}
    >
      <span className="h-1 w-1 rounded-full" style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Identity
   ══════════════════════════════════════════════════════════════════ */
function IdentityCard({ identity }: { identity: Identity }) {
  const { email, phone, linkedin, github } = identity;
  const noContact = !email && !phone && !linkedin && !github;
  return (
    <div className="cll-fade flex items-center gap-5 rounded-[12px] border border-border bg-surface px-5 py-[18px]">
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[16px] text-[22px] font-bold text-white"
        style={{ background: "var(--accent-grad)", boxShadow: "0 8px 24px -8px var(--accent-shadow)" }}
      >
        {identity.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[19px] font-bold text-fg">{identity.name}</div>
        <div className="mt-1 text-[13px] text-fg-mid">{identity.subline}</div>
        <div className="mt-[11px] flex flex-wrap gap-x-[18px] gap-y-2 text-[12px] text-fg-mid">
          {email ? (
            <span className="flex items-center gap-1.5">
              <MailIcon size={13} strokeWidth={1.4} /> {email}
            </span>
          ) : null}
          {phone ? (
            <span className="flex items-center gap-1.5">
              <PhoneIcon size={13} strokeWidth={1.4} /> {phone}
            </span>
          ) : null}
          {linkedin ? (
            <span className="flex items-center gap-1.5" style={{ color: "#93c5fd" }}>
              <LinkedinIcon size={13} strokeWidth={1.4} /> {linkedin}
            </span>
          ) : null}
          {github ? (
            <span className="flex items-center gap-1.5" style={{ color: "#c4b5fd" }}>
              <GithubIcon size={13} strokeWidth={1.4} /> {github}
            </span>
          ) : null}
          {noContact ? <span className="text-[12px] text-fg-low">No contact details yet</span> : null}
        </div>
      </div>
      <button
        type="button"
        className="flex shrink-0 items-center gap-1.5 rounded-[9px] border border-border-strong bg-transparent px-3 py-2 text-[12px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
      >
        <PencilIcon size={13} /> Edit
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Skills (tag cloud — the design's selected V2)
   ══════════════════════════════════════════════════════════════════ */
const SKILL_CHIP: Record<SkillWeight, { className: string; style?: React.CSSProperties }> = {
  primary: {
    className: "rounded-[9px] px-[13px] py-2 text-[14px] font-semibold text-white",
    style: { background: "var(--accent-grad)", boxShadow: "0 6px 16px -8px var(--accent-shadow)" },
  },
  strong: { className: "rounded-[9px] border border-border-strong bg-accent-weak px-3 py-[7px] text-[13px] font-semibold text-accent-text" },
  normal: { className: "rounded-[8px] border border-border bg-surface-2 px-[11px] py-1.5 text-[12px] text-fg" },
  learning: { className: "rounded-[8px] border border-dashed border-border-strong bg-transparent px-2.5 py-[5px] text-[11.5px] text-fg-mid" },
};

function SkillsCard({ skills, onOpen }: { skills: Skill[]; onOpen: (id: string) => void }) {
  return (
    <SectionCard title="Skills" meta={`${skills.length} tracked`} addLabel="Add skill" onAdd className="flex flex-col">
      {skills.length === 0 ? (
        <EmptyPrompt>
          No skills yet — <span className="font-semibold text-accent-text">add one</span> or let AI infer them from your CV.
        </EmptyPrompt>
      ) : (
        <div
          className="flex max-h-[340px] flex-col gap-4 overflow-auto pr-1.5"
          style={{ WebkitMaskImage: "linear-gradient(180deg,#000 93%,transparent)", maskImage: "linear-gradient(180deg,#000 93%,transparent)" }}
        >
          <div className="flex flex-wrap items-center gap-[7px]">
            {skills.map((sk) => {
              const chip = SKILL_CHIP[sk.weight];
              return (
                <button
                  key={sk.id}
                  type="button"
                  onClick={() => onOpen(sk.id)}
                  className={cn("transition-transform hover:-translate-y-0.5", chip.className)}
                  style={chip.style}
                >
                  {sk.name}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex gap-3.5 font-mono text-[9px] text-fg-low">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[3px] bg-accent" />
              strong
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[3px] border border-dashed border-border-strong" />
              learning
            </span>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Experience (timeline)
   ══════════════════════════════════════════════════════════════════ */
function ExperienceCard({ experience, onOpen }: { experience: Experience[]; onOpen: (id: string) => void }) {
  return (
    <SectionCard title="Experience" meta={experience.length ? `${experience.length} roles` : undefined} addLabel="Add role" onAdd>
      {experience.length === 0 ? (
        <EmptyPrompt>
          No roles yet — <span className="font-semibold text-accent-text">add your first</span>.
        </EmptyPrompt>
      ) : (
        <div className="flex flex-col">
          {experience.map((x, i) => {
            const last = i === experience.length - 1;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => onOpen(x.id)}
                className="-mx-2 flex gap-3.5 rounded-[10px] px-2 py-[11px] text-left transition-colors hover:bg-surface-2"
              >
                <div className="flex shrink-0 flex-col items-center pt-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: "var(--accent)",
                      boxShadow: x.current ? "0 0 8px var(--accent)" : undefined,
                      opacity: x.current ? 1 : 0.6,
                    }}
                  />
                  {!last ? <span className="mt-1.5 min-h-[14px] w-px flex-1 bg-border" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="text-[13.5px] font-semibold leading-tight text-fg">{x.title}</span>
                    <span className="shrink-0 text-[10.5px] tabular-nums text-fg-low">{x.period}</span>
                  </div>
                  <div className="mt-1 text-[12px] text-accent-text">{x.company}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {x.tags.map((t) => (
                      <span key={t} className="rounded-[6px] border border-border bg-input px-2 py-0.5 text-[10px] text-fg-mid">
                        {t}
                      </span>
                    ))}
                    <SourceBadge source={x.source} />
                  </div>
                  <div className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-fg-mid">{x.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Summary
   ══════════════════════════════════════════════════════════════════ */
function SummaryCard({ summary, onGenerate }: { summary?: Summary; onGenerate: () => void }) {
  return (
    <div className="cll-fade rounded-[12px] border border-border bg-surface px-5 py-[18px]">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[14px] font-semibold text-fg">Summary</span>
        {summary ? (
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-[8px] border border-border-strong bg-transparent px-2.5 py-1.5 text-[11.5px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
          >
            <PencilIcon size={12} /> Edit
          </button>
        ) : (
          <span className="rounded-full border border-dashed border-border-strong px-2 py-0.5 font-mono text-[9px] text-fg-low">EMPTY</span>
        )}
      </div>
      {summary ? (
        <>
          <div className="mt-3 text-[13.5px] leading-[1.85] text-fg-mid">{summary.text}</div>
          <div className="mt-3 flex items-center gap-1.5">
            <span className="rounded-[6px] bg-input px-2 py-0.5 font-mono text-[9px] text-fg-low">{summary.words} words</span>
            <span className="rounded-[6px] bg-input px-2 py-0.5 font-mono text-[9px] text-fg-low">{summary.keywords} keywords</span>
            <SourceBadge source={summary.source} />
          </div>
        </>
      ) : (
        <div className="mt-2.5 flex items-center justify-between gap-4 rounded-[10px] border border-dashed border-border-strong bg-input p-4">
          <div className="text-[13px] text-fg-mid">
            <span className="font-semibold text-accent-text">AI can draft this from your CV.</span> A 2-line professional summary grounded in
            your experience.
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="primary" size="sm" onClick={onGenerate}>
              <SparkleIcon size={13} /> Generate
            </Button>
            <button
              type="button"
              className="rounded-[9px] border border-border-strong bg-transparent px-3.5 py-2 text-[12px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
            >
              Write myself
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Education
   ══════════════════════════════════════════════════════════════════ */
function EducationCard({ education, onOpen }: { education: Education[]; onOpen: (id: string) => void }) {
  return (
    <SectionCard title="Education" addLabel="Add education" onAdd>
      {education.length === 0 ? (
        <EmptyPrompt minimal>
          No education yet — <span className="font-semibold text-accent-text">add a degree</span>.
        </EmptyPrompt>
      ) : (
        <div className="flex flex-col gap-2.5">
          {education.map((ed) => (
            <button
              key={ed.id}
              type="button"
              onClick={() => onOpen(ed.id)}
              className="flex gap-3 rounded-[10px] border border-border bg-surface-2 p-[11px] text-left transition-colors hover:border-accent"
            >
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-accent-weak text-accent-text">
                <CapIcon size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-fg">{ed.degree}</span>
                  <SourceBadge source={ed.source} />
                </div>
                <div className="mt-0.5 text-[12px] text-fg-mid">{ed.school}</div>
                <div className="mt-1 font-mono text-[11px] text-fg-low">{ed.meta}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Languages
   ══════════════════════════════════════════════════════════════════ */
function LanguagesCard({ languages, onOpen }: { languages: Language[]; onOpen: (id: string) => void }) {
  return (
    <SectionCard title="Languages" addLabel="Add language" onAdd>
      {languages.length === 0 ? (
        <EmptyPrompt minimal>
          No languages yet — <span className="font-semibold text-accent-text">add one</span>.
        </EmptyPrompt>
      ) : (
        <div className="flex flex-col gap-2.5">
          {languages.map((lg) => (
            <button
              key={lg.id}
              type="button"
              onClick={() => onOpen(lg.id)}
              className="-mx-2 rounded-[9px] p-2 text-left transition-colors hover:bg-surface-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-fg">{lg.name}</span>
                <span className="font-mono text-[10px] text-accent-text">{lg.level}</span>
              </div>
              <div className="mt-2 h-[5px] overflow-hidden rounded-[3px] bg-input">
                <div className="h-full rounded-[3px]" style={{ width: `${lg.pct}%`, background: "var(--accent-grad)" }} />
              </div>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Projects
   ══════════════════════════════════════════════════════════════════ */
function ProjectsCard({ projects, onOpen }: { projects: Project[]; onOpen: (id: string) => void }) {
  return (
    <SectionCard
      title="Projects"
      addLabel="Add project"
      onAdd
      headerExtra={
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-[9px] border border-border-strong bg-surface-2 px-3 py-1.5 text-[12px] text-fg transition-colors hover:border-accent"
        >
          <BranchIcon size={13} strokeWidth={1.4} /> Add from GitHub
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            className="rounded-[11px] border border-border bg-surface-2 p-3.5 text-left transition-colors hover:border-accent"
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-accent-text">
                <BranchIcon size={14} strokeWidth={1.5} />
              </span>
              <span className="truncate text-[13px] font-semibold text-fg">{p.name}</span>
              <span className="ml-auto shrink-0 rounded-[6px] bg-accent-weak px-2 py-0.5 font-mono text-[9px] text-accent-text">{p.role}</span>
            </div>
            <div className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-fg-mid">{p.desc}</div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {p.tags.map((t) => (
                <span key={t} className="flex items-center gap-1.5 rounded-[6px] bg-input px-2 py-[3px] font-mono text-[9px] text-fg-mid">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {t}
                </span>
              ))}
              <SourceBadge source={p.source} />
            </div>
          </button>
        ))}
        <button
          type="button"
          className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-border-strong bg-input p-3.5 text-center transition-colors hover:border-accent"
        >
          <PlusIcon size={18} strokeWidth={1.6} className="text-accent" />
          <span className="text-[12.5px] text-fg-mid">Add a project manually</span>
        </button>
      </div>
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Certificates
   ══════════════════════════════════════════════════════════════════ */
function CertificatesCard({ certificates, onOpen }: { certificates: Certificate[]; onOpen: (id: string) => void }) {
  return (
    <SectionCard title="Certificates" addLabel="Add certificate" onAdd>
      {certificates.length === 0 ? (
        <EmptyPrompt minimal>
          No certificates yet — <span className="font-semibold text-accent-text">add one</span>.
        </EmptyPrompt>
      ) : (
        <div className="flex flex-col gap-0.5">
          {certificates.map((ct) => (
            <button
              key={ct.id}
              type="button"
              onClick={() => onOpen(ct.id)}
              className="-mx-2 flex items-center gap-3 rounded-[8px] p-2 text-left text-[13px] transition-colors hover:bg-surface-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-accent-weak text-accent-text">
                <AwardIcon size={15} />
              </span>
              <span className="min-w-0 flex-1 truncate text-fg">{ct.name}</span>
              <SourceBadge source={ct.source} />
              <span className="shrink-0 font-mono text-[10px] text-fg-low">{ct.issuer}</span>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Trainings
   ══════════════════════════════════════════════════════════════════ */
function TrainingsCard({ trainings, onOpen }: { trainings: Training[]; onOpen: (id: string) => void }) {
  return (
    <SectionCard title="Trainings" meta={trainings.length ? `${trainings.length} completed` : undefined} addLabel="Add training" onAdd>
      {trainings.length === 0 ? (
        <EmptyPrompt minimal>
          No trainings yet — <span className="font-semibold text-accent-text">add one</span>.
        </EmptyPrompt>
      ) : (
        <div className="flex flex-col gap-0.5">
          {trainings.map((tr) => (
            <button
              key={tr.id}
              type="button"
              onClick={() => onOpen(tr.id)}
              className="-mx-2 flex items-center gap-3 rounded-[8px] p-2 text-left transition-colors hover:bg-surface-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-accent-weak text-accent-text">
                <BookIcon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-fg">{tr.name}</div>
                <div className="truncate font-mono text-[11px] text-fg-low">{tr.provider}</div>
              </div>
              <SourceBadge source={tr.source} />
              <span className="shrink-0 font-mono text-[10px] text-fg-low">{tr.completed}</span>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Links
   ══════════════════════════════════════════════════════════════════ */
function LinksCard({ links, onOpen }: { links: LinkItem[]; onOpen: (id: string) => void }) {
  return (
    <SectionCard title="Links" addLabel="Add link" onAdd>
      {links.length === 0 ? (
        <EmptyPrompt minimal>
          No links yet — <span className="font-semibold text-accent-text">add one</span>.
        </EmptyPrompt>
      ) : (
        <div className="flex flex-col gap-0.5">
          {links.map((ln) => (
            <button
              key={ln.id}
              type="button"
              onClick={() => onOpen(ln.id)}
              className="-mx-2 flex items-center gap-3 rounded-[8px] p-2 text-left transition-colors hover:bg-surface-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-accent-weak text-accent-text">
                <LinkIcon size={14} strokeWidth={1.6} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] text-fg">{ln.label}</div>
                <div className="truncate font-mono text-[11px] text-accent-text">{ln.url}</div>
              </div>
              <SourceBadge source={ln.source} />
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Modal shell
   ══════════════════════════════════════════════════════════════════ */
function ModalShell({ children, onClose, width = 440 }: { children: ReactNode; onClose: () => void; width?: number }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      style={{ animation: "cll-backdrop .16s ease" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="my-auto w-full overflow-hidden rounded-[13px] border border-border-strong bg-surface shadow-[0_24px_60px_-30px_#000]"
        style={{ maxWidth: width, animation: "cll-modal .2s cubic-bezier(.16,1,.3,1) both" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ icon, kicker, title }: { icon: ReactNode; kicker: string; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border-strong bg-accent-weak text-accent-text">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[8.5px] tracking-[1px] text-fg-low">{kicker}</div>
        <div className="truncate text-[15px] font-bold text-fg">{title}</div>
      </div>
    </div>
  );
}

/** Delete / Edit footer shared by item detail modals (both deferred → no-op). */
function DetailFooter() {
  return (
    <div className="flex items-center justify-between border-t border-border bg-surface-2 px-4 py-3">
      <button
        type="button"
        className="rounded-[9px] border px-3 py-1.5 text-[12px] text-danger transition-colors hover:bg-danger-weak"
        style={{ borderColor: "rgba(251,113,133,.32)" }}
      >
        Delete
      </button>
      <Button variant="primary" size="sm">
        Edit
      </Button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Item detail modal — routes to per-kind body (M1 designs)
   ══════════════════════════════════════════════════════════════════ */
function DetailModal({ data, detail, onClose }: { data: ProfileData; detail: Detail; onClose: () => void }) {
  const body = renderDetail(data, detail);
  if (!body) return null;
  return (
    <ModalShell onClose={onClose} width={detail.kind === "experience" || detail.kind === "project" ? 460 : 420}>
      {body}
    </ModalShell>
  );
}

const LEVEL_LABEL: Record<number, string> = { 5: "Expert", 4: "Advanced", 3: "Intermediate", 2: "Basic", 1: "Beginner" };

function renderDetail(data: ProfileData, { kind, id }: Detail): ReactNode {
  switch (kind) {
    case "skill": {
      const sk = data.skills.find((s) => s.id === id);
      if (!sk) return null;
      return (
        <>
          <ModalHeader icon={<SparkleIcon size={17} />} kicker="SKILL" title={sk.name} />
          <div className="p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[10.5px] text-fg-mid">{sk.category}</span>
              <SourceBadge source={sk.source} />
            </div>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="font-mono text-[9px] tracking-[1px] text-fg-low">PROFICIENCY</span>
              <span className="text-[12px] font-semibold text-accent-text">{LEVEL_LABEL[sk.level]}</span>
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className="h-2 flex-1 rounded-[4px]"
                  style={{ background: n <= sk.level ? "var(--accent-grad)" : "var(--input)" }}
                />
              ))}
            </div>
          </div>
          <DetailFooter />
        </>
      );
    }
    case "experience": {
      const x = data.experience.find((e) => e.id === id);
      if (!x) return null;
      return (
        <>
          <ModalHeader icon={<BriefcaseIcon size={17} />} kicker="EXPERIENCE" title={x.title} />
          <div className="p-4">
            <div className="text-[12.5px] font-semibold text-accent-text">{x.company}</div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="rounded-[8px] bg-accent-weak px-2.5 py-1 text-[11px] text-accent-text">{x.period}</span>
              {x.tags.map((t) => (
                <span key={t} className="rounded-[8px] border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-fg-mid">
                  {t}
                </span>
              ))}
              <SourceBadge source={x.source} />
            </div>
            <div className="mt-3.5 border-t border-border pt-3.5">
              <div className="mb-2 font-mono text-[9px] tracking-[1px] text-fg-low">WHAT I DID</div>
              <div className="rounded-[10px] bg-reading px-3.5 py-3 text-[12.5px] leading-relaxed text-reading-ink">{x.description}</div>
            </div>
          </div>
          <DetailFooter />
        </>
      );
    }
    case "project": {
      const p = data.projects.find((x) => x.id === id);
      if (!p) return null;
      return (
        <>
          <ModalHeader icon={<BranchIcon size={17} strokeWidth={1.5} />} kicker="PROJECT" title={p.name} />
          <div className="p-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent-weak px-2.5 py-0.5 font-mono text-[9px] text-accent-text">{p.role}</span>
              <SourceBadge source={p.source} />
              {typeof p.stars === "number" ? (
                <span className="ml-auto font-mono text-[10px] text-fg-low">
                  <span className="text-warning">★</span> {p.stars}
                </span>
              ) : null}
            </div>
            <div className="mt-3 rounded-[10px] bg-reading px-3.5 py-3 text-[12.5px] leading-relaxed text-reading-ink">{p.desc}</div>
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {p.tags.map((t) => (
                <span key={t} className="rounded-[7px] border border-border bg-surface-2 px-2 py-1 font-mono text-[9px] text-fg-mid">
                  {t}
                </span>
              ))}
            </div>
            {p.url ? (
              <a
                href={`https://${p.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3.5 flex items-center justify-center gap-1.5 rounded-[9px] border border-border-strong bg-surface-2 py-2.5 text-[12px] text-accent-text transition-colors hover:border-accent"
              >
                <LinkIcon size={13} strokeWidth={1.6} /> {p.url}
              </a>
            ) : null}
          </div>
          <DetailFooter />
        </>
      );
    }
    case "education": {
      const ed = data.education.find((e) => e.id === id);
      if (!ed) return null;
      return (
        <>
          <ModalHeader icon={<CapIcon size={17} />} kicker="EDUCATION" title={ed.degree} />
          <div className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-semibold text-accent-text">{ed.school}</span>
              <SourceBadge source={ed.source} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ed.meta.split(" · ").map((m) => (
                <span key={m} className="rounded-[8px] border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-fg-mid">
                  {m}
                </span>
              ))}
            </div>
            {ed.courses.length ? (
              <div className="mt-3.5 border-t border-border pt-3.5">
                <div className="mb-2 font-mono text-[9px] tracking-[1px] text-fg-low">KEY COURSES</div>
                <div className="flex flex-col gap-0.5">
                  {ed.courses.map((c) => (
                    <div key={c} className="flex items-center justify-between border-b border-border py-1.5 text-[12px] text-fg-mid last:border-0">
                      <span>{c}</span>
                      <span className="font-mono text-[10px] text-accent-text">A</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <DetailFooter />
        </>
      );
    }
    case "language": {
      const lg = data.languages.find((l) => l.id === id);
      if (!lg) return null;
      return (
        <>
          <ModalHeader icon={<GlobeIcon size={17} />} kicker="LANGUAGE" title={lg.name} />
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[12.5px] font-semibold text-accent-text">{lg.level}</span>
              <SourceBadge source={lg.source} />
            </div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[9px] tracking-[1px] text-fg-low">PROFICIENCY</span>
              <span className="font-mono text-[11px] text-accent-text">{lg.pct}%</span>
            </div>
            <div className="h-[6px] overflow-hidden rounded-[3px] bg-input">
              <div className="h-full rounded-[3px]" style={{ width: `${lg.pct}%`, background: "var(--accent-grad)" }} />
            </div>
          </div>
          <DetailFooter />
        </>
      );
    }
    case "certificate": {
      const ct = data.certificates.find((c) => c.id === id);
      if (!ct) return null;
      return (
        <>
          <ModalHeader icon={<AwardIcon size={17} />} kicker="CERTIFICATE" title={ct.name} />
          <div className="p-4">
            <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface-2 px-3.5 py-3">
              <div>
                <div className="font-mono text-[9px] tracking-[1px] text-fg-low">ISSUER</div>
                <div className="mt-0.5 text-[13px] font-semibold text-fg">{ct.issuer}</div>
              </div>
              <SourceBadge source={ct.source} />
            </div>
          </div>
          <DetailFooter />
        </>
      );
    }
    case "training": {
      const tr = data.trainings.find((t) => t.id === id);
      if (!tr) return null;
      return (
        <>
          <ModalHeader icon={<BookIcon size={17} />} kicker="TRAINING" title={tr.name} />
          <div className="p-4">
            <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface-2 px-3.5 py-3">
              <div>
                <div className="font-mono text-[9px] tracking-[1px] text-fg-low">PROVIDER</div>
                <div className="mt-0.5 text-[13px] font-semibold text-fg">{tr.provider}</div>
              </div>
              <SourceBadge source={tr.source} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-[8px] bg-accent-weak px-2.5 py-1 text-[11px] text-accent-text">Completed {tr.completed}</span>
            </div>
            {tr.url ? (
              <a
                href={`https://${tr.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3.5 flex items-center justify-center gap-1.5 rounded-[9px] border border-border-strong bg-surface-2 py-2.5 text-[12px] text-accent-text transition-colors hover:border-accent"
              >
                <LinkIcon size={13} strokeWidth={1.6} /> {tr.url}
              </a>
            ) : null}
          </div>
          <DetailFooter />
        </>
      );
    }
    case "link": {
      const ln = data.links.find((l) => l.id === id);
      if (!ln) return null;
      return (
        <>
          <ModalHeader icon={<LinkIcon size={17} strokeWidth={1.6} />} kicker="LINK" title={ln.label} />
          <div className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <SourceBadge source={ln.source} />
            </div>
            <a
              href={`https://${ln.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-[9px] border border-border-strong bg-surface-2 py-2.5 font-mono text-[12px] text-accent-text transition-colors hover:border-accent"
            >
              <LinkIcon size={13} strokeWidth={1.6} /> {ln.url}
            </a>
          </div>
          <DetailFooter />
        </>
      );
    }
    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════
   AI complete empty fields — panel
   ══════════════════════════════════════════════════════════════════ */
type AiField = { key: string; label: string; note: string };
function emptyFields(data: ProfileData): AiField[] {
  const f: AiField[] = [];
  const id = data.identity;
  if (!id.email && !id.phone && !id.linkedin && !id.github)
    f.push({ key: "contact", label: "Contact details", note: "Pulled from your CV header." });
  if (!data.summary) f.push({ key: "summary", label: "Professional summary", note: "A 2-line summary grounded in your experience." });
  if (data.skills.length === 0) f.push({ key: "skills", label: "Skills", note: "Inferred from roles and projects." });
  if (data.experience.length === 0) f.push({ key: "experience", label: "Experience", note: "Parsed role by role from your CV." });
  if (data.education.length === 0) f.push({ key: "education", label: "Education", note: "Degrees and schools from your CV." });
  if (data.projects.length === 0) f.push({ key: "projects", label: "Projects", note: "Imported from your GitHub repos." });
  if (data.certificates.length === 0) f.push({ key: "certificates", label: "Certificates", note: "Detected in your CV." });
  if (data.trainings.length === 0) f.push({ key: "trainings", label: "Trainings", note: "Courses and trainings from your CV." });
  if (data.languages.length === 0) f.push({ key: "languages", label: "Languages", note: "Spoken languages from your CV." });
  if (data.links.length === 0) f.push({ key: "links", label: "Links", note: "Portfolio and profile URLs." });
  return f;
}

function AiCompleteModal({ data, onClose }: { data: ProfileData; onClose: () => void }) {
  const fields = emptyFields(data);
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(fields.map((f) => [f.key, true] as const)));
  const selectedCount = fields.filter((f) => checked[f.key]).length;

  return (
    <ModalShell onClose={onClose} width={520}>
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white" style={{ background: "var(--accent-grad)" }}>
          <SparkleIcon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-fg">AI complete empty fields</div>
          <div className="text-[11.5px] text-fg-mid">Fill the gaps, grounded in your CV & GitHub — nothing is sent externally.</div>
        </div>
      </div>

      <div className="max-h-[52vh] overflow-y-auto p-5">
        {fields.length === 0 ? (
          <div className="rounded-[11px] border border-dashed border-border-strong bg-input px-4 py-8 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[12px] bg-accent-weak text-accent-text">
              <SparkleIcon size={20} />
            </div>
            <div className="text-[13.5px] font-semibold text-fg">Your profile is complete.</div>
            <div className="mt-1 text-[12px] text-fg-mid">Every section already has content — nothing left to fill.</div>
          </div>
        ) : (
          <>
            <div className="mb-3 font-mono text-[9.5px] tracking-[1px] text-fg-low">{fields.length} EMPTY FIELDS FOUND</div>
            <div className="flex flex-col gap-2">
              {fields.map((f) => {
                const on = checked[f.key];
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setChecked((c) => ({ ...c, [f.key]: !c[f.key] }))}
                    className={cn(
                      "flex items-center gap-3 rounded-[11px] border px-3.5 py-3 text-left transition-colors",
                      on ? "border-accent bg-accent-weak" : "border-border bg-surface-2",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border",
                        on ? "border-transparent text-white" : "border-border-strong text-transparent",
                      )}
                      style={on ? { background: "var(--accent-grad)" } : undefined}
                    >
                      <CheckIcon size={12} strokeWidth={2.6} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-fg">{f.label}</div>
                      <div className="mt-0.5 text-[11.5px] text-fg-mid">{f.note}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[9px] border border-border-strong bg-transparent px-3.5 py-2 text-[12px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
        >
          Cancel
        </button>
        <Button variant="primary" size="sm" disabled={selectedCount === 0} onClick={onClose}>
          <SparkleIcon size={13} /> {selectedCount ? `Complete ${selectedCount} field${selectedCount > 1 ? "s" : ""}` : "Nothing to fill"}
        </Button>
      </div>
    </ModalShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Summary AI studio (the design's M1 generate modal)
   ══════════════════════════════════════════════════════════════════ */
function SummaryStudioModal({ onClose }: { onClose: () => void }) {
  const tones = ["Concise", "Technical", "Warmer"] as const;
  const [tone, setTone] = useState<(typeof tones)[number]>("Concise");
  return (
    <ModalShell onClose={onClose} width={460}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-white" style={{ background: "var(--accent-grad)" }}>
          <SparkleIcon size={16} strokeWidth={1.6} />
        </div>
        <div>
          <div className="text-[14px] font-semibold text-fg">Generate summary</div>
          <div className="text-[10.5px] text-fg-mid">2-line summary drafted from your CV</div>
        </div>
      </div>
      <div className="p-4">
        <div className="rounded-[10px] border border-border bg-reading px-3.5 py-3.5 text-[12.5px] leading-relaxed text-reading-ink">
          ML engineer focused on evaluation and reliability
          <span className="ml-px inline-block h-[13px] w-[6px] translate-y-0.5 bg-accent" style={{ animation: "cll-blink 1s step-end infinite" }} />
        </div>
        <div className="mt-3 flex gap-1.5">
          {tones.map((t) => {
            const active = t === tone;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={cn(
                  "rounded-[8px] border px-2.5 py-1.5 text-[11px] transition-colors",
                  active ? "border-accent bg-accent-weak text-accent-text" : "border-border-strong bg-surface-2 text-fg hover:border-accent",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border bg-surface-2 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[9px] border border-border-strong px-3 py-1.5 text-[12px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
        >
          Write myself
        </button>
        <Button variant="primary" size="sm" onClick={onClose}>
          Use this
        </Button>
      </div>
    </ModalShell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Inline icons (20×20, stroke = currentColor) — matching the design
   ══════════════════════════════════════════════════════════════════ */
type IconProps = { size?: number; strokeWidth?: number; className?: string };
function Svg({ size = 20, strokeWidth = 1.5, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}
function SparkleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 3l1.5 4L16 8l-4.5 1L10 13l-1.5-4L4 8l4.5-1z" />
    </Svg>
  );
}
function MailIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="14" height="10" rx="1.5" />
      <path d="M3 6l7 5 7-5" />
    </Svg>
  );
}
function PhoneIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 4h3l1 4-2 1a9 9 0 0 0 4 4l1-2 4 1v3a2 2 0 0 1-2 2A13 13 0 0 1 3 6a2 2 0 0 1 2-2z" />
    </Svg>
  );
}
function LinkedinIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M6 8v6M6 6v.5M10 14v-4M14 14v-2.5a1.5 1.5 0 0 0-3 0" />
    </Svg>
  );
}
function GithubIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10" cy="10" r="7" />
    </Svg>
  );
}
function PencilIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 16l1-4 8.5-8.5 3 3L8 15l-4 1z" />
    </Svg>
  );
}
function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 4v12M4 10h12" />
    </Svg>
  );
}
function CapIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 4l8 3.5-8 3.5-8-3.5z" />
      <path d="M5 9v4c0 1 2.5 2.5 5 2.5s5-1.5 5-2.5V9" />
    </Svg>
  );
}
function AwardIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10" cy="8" r="4" />
      <path d="M7.5 11.5L6 17l4-2 4 2-1.5-5.5" />
    </Svg>
  );
}
function BookIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 5C8.5 3.8 6.5 3.5 4 3.8v10.5c2.5-.3 4.5 0 6 1.2 1.5-1.2 3.5-1.5 6-1.2V3.8c-2.5-.3-4.5 0-6 1.2z" />
      <path d="M10 5v10.5" />
    </Svg>
  );
}
function LinkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 11a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4l-1 1" />
      <path d="M12 9a3 3 0 0 0-4 0l-2 2a3 3 0 0 0 4 4l1-1" />
    </Svg>
  );
}
function BranchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="15" r="2" />
      <circle cx="14" cy="8" r="2" />
      <path d="M6 7v6M6 11h5a3 3 0 0 0 3-3" />
    </Svg>
  );
}
function BriefcaseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="6" width="14" height="10" rx="1.5" />
      <path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h3A1.5 1.5 0 0 1 13 4.5V6" />
    </Svg>
  );
}
function GlobeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c2.2 2.4 2.2 11.6 0 14M10 3c-2.2 2.4-2.2 11.6 0 14" />
    </Svg>
  );
}
function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 10l4 4 8-9" />
    </Svg>
  );
}
