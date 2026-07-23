import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  Activity,
  AlertTriangle,
  ClipboardCheck,
  Cpu,
  Eye,
  FileSearch,
  Lock,
  Scale,
  ShieldCheck,
  Check,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Reveal, Stagger, motion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Responsible AI — how Cover Letter Local maps to Microsoft's Responsible AI
 * Standard (six principles). This page states the honest story: what the app
 * genuinely does, and — just as importantly — what it does not claim.
 */

type Tone = "accent" | "blue" | "violet" | "gold";

const CHIP: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent-ink",
  blue: "bg-blue-soft text-blue",
  violet: "bg-violet-soft text-violet",
  gold: "bg-gold-soft text-gold",
};

const DOT: Record<Tone, string> = {
  accent: "bg-accent",
  blue: "bg-blue",
  violet: "bg-violet",
  gold: "bg-gold",
};

type Point = { lead: string; body: string };
type Tag = { label: string; tone: BadgeProps["tone"] };

type Principle = {
  n: string;
  name: string;
  icon: LucideIcon;
  tone: Tone;
  definition: string;
  points: Point[];
  tags: Tag[];
};

const PRINCIPLES: Principle[] = [
  {
    n: "01",
    name: "Accountability",
    icon: ClipboardCheck,
    tone: "gold",
    definition: "People stay answerable for how the system behaves and what it produces.",
    points: [
      { lead: "Per-field provenance", body: "every profile fact is tagged with its source and date, so any claim can be traced back to where it came from." },
      { lead: "You are the author", body: "the AI drafts; you review and edit every letter before it is ever used." },
      { lead: "Inspectable by design", body: "the app runs from source on your machine, and a DevInspector exposes the raw model output behind each page." },
    ],
    tags: [
      { label: "field_sources", tone: "gold" },
      { label: "ProvenanceBadge", tone: "neutral" },
      { label: "human-in-the-loop", tone: "neutral" },
    ],
  },
  {
    n: "02",
    name: "Transparency",
    icon: Eye,
    tone: "blue",
    definition: "People can understand how the system reached its output.",
    points: [
      { lead: "AI-generated is disclosed", body: "generated letters are presented as AI-drafted starting points meant for your review — never passed off as finished." },
      { lead: "Source-cited research", body: "each section of a company report carries the URLs it was actually built from." },
      { lead: "Quality signals surfaced", body: "research reports show completeness and confidence numbers rather than a single opaque verdict." },
    ],
    tags: [
      { label: "sources[]", tone: "blue" },
      { label: "meta.confidence", tone: "blue" },
      { label: "DevInspector", tone: "neutral" },
    ],
  },
  {
    n: "03",
    name: "Fairness",
    icon: Scale,
    tone: "violet",
    definition: "The system treats people equitably and avoids amplifying harmful bias.",
    points: [
      { lead: "Grounded in your evidence", body: "suggestions and letters are built strictly from your own CV, GitHub, and past letters — not from assumptions about who you are." },
      { lead: "Your words, your ratings", body: "skills carry the honest self-ratings you set; your writing voice is learned from letters you actually wrote." },
      { lead: "No automated judgement", body: "the app writes on your behalf; it makes no hiring or scoring decision about any person." },
    ],
    tags: [
      { label: "grounded suggestions", tone: "violet" },
      { label: "self-rated skills", tone: "neutral" },
    ],
  },
  {
    n: "04",
    name: "Reliability & Safety",
    icon: Activity,
    tone: "accent",
    definition: "The system performs dependably and safely under expected conditions.",
    points: [
      { lead: "Grounding over invention", body: "voice analysis refuses to fabricate on thin input and retries on malformed output; profile suggestions stay tied to your data." },
      { lead: "Groundedness gates", body: "research reconciles multiple agents, dedupes, and scores completeness and source coverage, flagging sections that are missing." },
      { lead: "Fails closed", body: "if an outbound request might leak private data, the privacy guard blocks it and sends nothing." },
    ],
    tags: [
      { label: "reconcile", tone: "accent" },
      { label: "completeness", tone: "accent" },
      { label: "real streaming", tone: "neutral" },
    ],
  },
  {
    n: "05",
    name: "Privacy & Security",
    icon: Lock,
    tone: "accent",
    definition: "The system protects data and respects privacy by default.",
    points: [
      { lead: "Local by default", body: "your CV, profile, and letters stay on your device; the default models (Foundry Local, Ollama) run fully offline." },
      { lead: "One narrow exception", body: "company research sends only public data — company name, role title, the employer's job text — never your CV or profile." },
      { lead: "A privacy firewall", body: "a single outbound choke point allowlists public fields and, as a backstop, scans every outgoing byte for your private identifiers before it leaves." },
      { lead: "Cloud is an explicit opt-in", body: "choosing a cloud model (OpenAI, Claude, Gemini) sends prompts to that provider — off by default, and clearly your choice." },
    ],
    tags: [
      { label: "outbound_guard", tone: "success" },
      { label: "no telemetry", tone: "success" },
      { label: "local SQLite + ChromaDB", tone: "neutral" },
    ],
  },
  {
    n: "06",
    name: "Inclusiveness",
    icon: Accessibility,
    tone: "blue",
    definition: "The system is usable by people of diverse abilities and circumstances.",
    points: [
      { lead: "Built for the keyboard", body: "visible focus rings (WCAG 2.2), semantic landmarks, and full keyboard navigation across the app." },
      { lead: "Respects your preferences", body: "light and dark themes, and motion that honours prefers-reduced-motion." },
      { lead: "Low barrier to entry", body: "works offline on modest local models, with no paid account required." },
    ],
    tags: [
      { label: "WCAG 2.2 focus", tone: "blue" },
      { label: "prefers-reduced-motion", tone: "neutral" },
      { label: "light + dark", tone: "neutral" },
    ],
  },
];

const QUICK_FACTS = [
  { icon: Cpu, label: "Local by default", value: "Runs on your machine" },
  { icon: ClipboardCheck, label: "Provenance", value: "Every field is sourced" },
  { icon: Lock, label: "Leaves the device", value: "Only a company name" },
];

const GATES = [
  { icon: ShieldCheck, title: "Privacy firewall", body: "Every outbound byte is checked; a request that could leak private data is blocked, not sent." },
  { icon: FileSearch, title: "Groundedness", body: "Suggestions and letters are constrained to your own material — the model works from evidence, not guesses." },
  { icon: Activity, title: "Research quality", body: "Completeness, source-cited ratio, and confidence are computed and shown; missing sections are flagged." },
  { icon: ClipboardCheck, title: "Provenance & review", body: "Each field carries its source and date, and every letter is yours to edit before it is used." },
];

const LIMITS = [
  "Language models can still be wrong or biased — read and edit before you send anything.",
  "Choosing a cloud provider sends your prompt off-device; that is your explicit opt-in, not the default.",
  "No formal Microsoft Responsible AI Impact Assessment has been completed — this is a learning project that follows the Standard, not a certified product.",
  "Accessibility has not yet been fully audited with assistive technology; it is an area we intend to keep improving.",
];

function PrincipleCard({ principle }: { principle: Principle }) {
  const { n, name, icon: Icon, tone, definition, points, tags } = principle;
  return (
    <Reveal className="h-full">
      <motion.article
        whileHover={{ y: -4 }}
        transition={{ type: "spring", stiffness: 400, damping: 26 }}
        className="relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-soft"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-2 -top-3 select-none font-display text-[64px] font-extrabold leading-none text-text opacity-[0.05]"
        >
          {n}
        </span>

        <div className="flex items-center gap-3">
          <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-[12px]", CHIP[tone])}>
            <Icon size={20} aria-hidden />
          </span>
          <h3 className="text-[17px] font-bold leading-tight">{name}</h3>
        </div>

        <p className="mt-3 text-[13.5px] leading-relaxed text-text-2">{definition}</p>

        <ul className="mt-4 space-y-2.5">
          {points.map((p) => (
            <li key={p.lead} className="flex gap-2.5">
              <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone])} aria-hidden />
              <p className="text-[13.5px] leading-snug text-text-2">
                <span className="font-semibold text-text">{p.lead}</span> — {p.body}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
          {tags.map((t) => (
            <Badge key={t.label} tone={t.tone}>
              {t.label}
            </Badge>
          ))}
        </div>
      </motion.article>
    </Reveal>
  );
}

export function ResponsibleAI() {
  return (
    <div>
      <PageHeader
        icon={ShieldCheck}
        eyebrow="Microsoft Responsible AI Standard"
        title="Responsible AI"
        description="How Cover Letter Local maps to the six principles of Microsoft's Responsible AI Standard — stated honestly, with the guarantees we enforce and the limits we don't hide."
      />

      {/* Quick facts */}
      <Stagger className="grid gap-3 sm:grid-cols-3" stagger={0.07}>
        {QUICK_FACTS.map(({ icon: Icon, label, value }) => (
          <Reveal key={label}>
            <div className="flex items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3.5 shadow-soft">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent-ink">
                <Icon size={18} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-text-3">{label}</span>
                <span className="block truncate text-[14px] font-semibold text-text">{value}</span>
              </span>
            </div>
          </Reveal>
        ))}
      </Stagger>

      {/* Six principles */}
      <section aria-labelledby="principles-heading" className="mt-12">
        <Reveal>
          <h2 id="principles-heading" className="text-[22px] font-extrabold tracking-tight">
            The six principles, in this app
          </h2>
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-text-2">
            Each principle below is paired with the concrete features and code paths that put it into practice — not
            aspirations, but what the app actually does today.
          </p>
        </Reveal>

        <Stagger className="mt-6 grid gap-4 lg:grid-cols-2" stagger={0.06}>
          {PRINCIPLES.map((p) => (
            <PrincipleCard key={p.n} principle={p} />
          ))}
        </Stagger>
      </section>

      {/* Release criteria — the gates we run */}
      <section aria-labelledby="gates-heading" className="mt-12">
        <Reveal>
          <div className="overflow-hidden rounded-[var(--radius-card)] bg-navy p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-white/10 text-accent-ink">
                <ShieldCheck size={20} aria-hidden />
              </span>
              <div>
                <h2 id="gates-heading" className="text-[20px] font-extrabold tracking-tight text-white">
                  Release criteria — the gates we actually run
                </h2>
                <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-white/70">
                  Responsible AI here is not a badge; it is the set of checks that run before output reaches you. These are
                  engineering guardrails — real, but not a substitute for your own judgement.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {GATES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-3 rounded-[13px] bg-white/[0.06] p-4 ring-1 ring-inset ring-white/10">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white/10 text-accent-ink">
                    <Icon size={17} aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-[14.5px] font-bold text-white">{title}</h3>
                    <p className="mt-1 text-[13px] leading-snug text-white/70">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* What we don't claim */}
      <section aria-labelledby="limits-heading" className="mt-12">
        <Reveal>
          <div className="rounded-[var(--radius-card)] border border-gold/30 bg-gold-soft/40 p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-gold-soft text-gold">
                <AlertTriangle size={19} aria-hidden />
              </span>
              <h2 id="limits-heading" className="text-[18px] font-extrabold tracking-tight">
                What we don't claim
              </h2>
            </div>
            <ul className="mt-4 space-y-2.5">
              {LIMITS.map((limit) => (
                <li key={limit} className="flex gap-2.5">
                  <Check size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden />
                  <p className="text-[14px] leading-snug text-text-2">{limit}</p>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      <p className="mt-10 text-[13px] leading-relaxed text-text-3">
        The same mapping, written for reviewers, lives in{" "}
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-text-2">docs/RESPONSIBLE_AI.md</code>.
      </p>
    </div>
  );
}
