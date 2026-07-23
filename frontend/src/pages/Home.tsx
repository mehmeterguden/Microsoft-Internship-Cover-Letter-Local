import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Fingerprint,
  Building2,
  Cpu,
  FileUp,
  LayoutGrid,
  Lock,
  PenLine,
  Settings as SettingsIcon,
  Sparkles,
  Star,
  WifiOff,
} from "lucide-react";
import { motion } from "motion/react";
import { Reveal, Stagger } from "@/lib/motion";
import { MarketingNav } from "@/components/common/MarketingNav";
import { Logo } from "@/components/common/Logo";
import { cn } from "@/lib/utils";

const SAMPLE =
  "Dear hiring team,\n\nI've always been obsessed with making software feel effortless — the kind of tool that disappears into the work. That's exactly why your push toward on-device AI caught my attention.";

function LiveLetterDemo() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(SAMPLE.length);
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i = i >= SAMPLE.length ? 0 : i + 1;
      setN(i);
    }, 44);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Green blob backdrop */}
      <div
        aria-hidden
        className="absolute -inset-6 -z-10"
        style={{
          background: "radial-gradient(60% 55% at 60% 40%, var(--accent-soft), transparent 72%)",
          filter: "blur(10px)",
        }}
      />
      {/* Faint doc cards behind for depth */}
      <div aria-hidden className="absolute -right-6 top-8 h-56 w-40 rotate-6 rounded-[16px] border border-border bg-surface shadow-soft" />
      <div aria-hidden className="absolute -left-5 top-4 h-52 w-36 -rotate-6 rounded-[16px] border border-border bg-surface shadow-soft" />

      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="relative rounded-[20px] border border-border bg-surface p-5 shadow-elevated"
      >
        <div className="mb-3 flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-gold/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-good/70" />
          <span className="ml-auto text-[11px] font-medium text-text-3">letter.md</span>
        </div>
        <div className="min-h-44 rounded-[12px] bg-surface-2 p-4">
          <p className="whitespace-pre-wrap text-[14.5px] leading-[1.7] text-text">
            {SAMPLE.slice(0, n)}
            <span
              className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-accent"
              style={{ animation: "cll-caret 1s step-end infinite" }}
            />
          </p>
        </div>
      </motion.div>

      {/* Generate-with-AI pill */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 300, damping: 18 }}
        className="absolute -bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-navy px-4 py-2.5 text-[13px] font-semibold text-white shadow-elevated"
      >
        <Sparkles size={15} className="text-accent-ink" /> Generate with AI
      </motion.div>
    </div>
  );
}

const TRUST = [
  { icon: WifiOff, label: "Works offline" },
  { icon: Lock, label: "No account, no telemetry" },
  { icon: Cpu, label: "Runs on local models" },
];

const FEATURES = [
  { icon: FileUp, label: "CV Import", to: "/onboarding" },
  { icon: Fingerprint, label: "Writing Style", to: "/voice" },
  { icon: Building2, label: "Company Research", to: "/research" },
  { icon: PenLine, label: "Cover Letter", to: "/write" },
  { icon: LayoutGrid, label: "Cover Letters", to: "/cover-letters" },
  { icon: SettingsIcon, label: "Settings", to: "/settings" },
];

const STEPS = [
  { icon: FileUp, title: "Import your CV", body: "Extract and structure your experience locally — nothing is uploaded.", tone: "text-accent-ink bg-accent-soft" },
  { icon: Fingerprint, title: "Learn your style", body: "We study your past letters and build a fingerprint of how you write.", tone: "text-violet bg-violet-soft" },
  { icon: Building2, title: "Research the company", body: "Parallel agents gather a detailed, source-cited report.", tone: "text-blue bg-blue-soft" },
  { icon: PenLine, title: "Generate the letter", body: "A grounded, personalized letter streams in — in your own voice.", tone: "text-gold bg-gold-soft" },
];

export function Home() {
  return (
    <div className="min-h-dvh bg-surface">
      <MarketingNav />

      {/* Hero */}
      <section className="bg-bg-2">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <Stagger stagger={0.09}>
            <Reveal>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {["A", "M", "K"].map((c, i) => (
                    <span
                      key={c}
                      className={cn(
                        "grid h-8 w-8 place-items-center rounded-full border-2 border-surface text-[12px] font-bold text-white",
                        ["bg-accent", "bg-violet", "bg-blue"][i],
                      )}
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <span className="text-[14px] font-semibold text-text-2">
                  <span className="text-text">Private by design</span> — your data stays with you
                </span>
              </div>
            </Reveal>
            <Reveal>
              <h1 className="mt-5 text-[clamp(38px,5.4vw,60px)] font-extrabold leading-[1.04] tracking-tight text-text">
                Write cover letters that sound like{" "}
                <span className="text-accent-ink">you</span>, in minutes
              </h1>
            </Reveal>
            <Reveal>
              <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-text-2">
                Cover Letter Local learns your writing style, profiles your skills, researches the company,
                and generates a personalized letter — all on your machine, with your choice of local AI.
              </p>
            </Reveal>
            <Reveal>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/onboarding"
                  className="inline-flex items-center gap-2 rounded-[12px] bg-accent px-7 py-3.5 text-[15.5px] font-semibold text-on-accent shadow-soft transition-all hover:brightness-[1.06]"
                >
                  <Sparkles size={17} /> Get started
                </Link>
                <Link
                  to="/write"
                  className="group inline-flex items-center gap-2 rounded-[12px] border border-border bg-surface px-7 py-3.5 text-[15.5px] font-semibold text-text transition-colors hover:border-border-strong"
                >
                  Write a letter
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </Reveal>
            <Reveal>
              <div className="mt-6 flex items-center gap-2">
                <span className="flex text-gold">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} size={16} className="fill-gold" />
                  ))}
                </span>
                <span className="text-[13.5px] font-medium text-text-2">Local-first &amp; open — no lock-in</span>
              </div>
            </Reveal>
          </Stagger>

          <Reveal delay={0.35}>
            <LiveLetterDemo />
          </Reveal>
        </div>
      </section>

      {/* Navy trust band */}
      <section className="bg-navy">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-6 py-6 sm:justify-between">
          <span className="text-[14px] font-semibold text-white/70">Built to keep your data yours:</span>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {TRUST.map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-2 text-[14px] font-medium text-white/90">
                <Icon size={17} className="text-accent-ink" /> {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Everything you need */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <h2 className="text-center text-[clamp(28px,3.6vw,42px)] font-extrabold leading-tight tracking-tight">
          Everything you need to land interviews
          <br />
          <span className="text-accent-ink">in one place</span>
        </h2>

        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          {FEATURES.map(({ icon: Icon, label, to }, i) => (
            <Link
              key={label}
              to={to}
              className={cn(
                "inline-flex items-center gap-2 rounded-[12px] border px-4 py-2.5 text-[14px] font-semibold transition-colors",
                i === 0
                  ? "border-accent/40 bg-accent-soft text-accent-ink"
                  : "border-border bg-surface text-text-2 hover:border-border-strong hover:text-text",
              )}
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
        </div>

        <Stagger stagger={0.08} className="mt-12 grid gap-4 sm:grid-cols-2">
          {STEPS.map(({ icon: Icon, title, body, tone }, i) => (
            <Reveal key={title}>
              <motion.div
                whileHover={{ y: -5 }}
                transition={{ type: "spring", stiffness: 400, damping: 26 }}
                className="flex h-full items-start gap-4 rounded-[18px] border border-border bg-surface p-5 shadow-soft"
              >
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-[12px]", tone)}>
                  <Icon size={20} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-text-3">Step {i + 1}</span>
                  </div>
                  <h3 className="text-[16px] font-bold">{title}</h3>
                  <p className="mt-1 text-[14px] leading-snug text-text-2">{body}</p>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </Stagger>

        {/* CTA */}
        <div className="mt-14 overflow-hidden rounded-[24px] bg-navy px-8 py-12 text-center">
          <h3 className="text-[clamp(24px,3vw,34px)] font-extrabold text-white">
            Your next cover letter, in your own voice
          </h3>
          <p className="mx-auto mt-3 max-w-lg text-[15px] text-white/70">
            No account. No cloud. Just you and a local model that writes like you do.
          </p>
          <Link
            to="/onboarding"
            className="mt-7 inline-flex items-center gap-2 rounded-[12px] bg-accent px-7 py-3.5 text-[15.5px] font-semibold text-on-accent shadow-soft transition-all hover:brightness-[1.06]"
          >
            <Sparkles size={17} /> Get started free
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
          <Logo />
          <p className="text-[13px] text-text-3">Runs entirely on your machine · No data leaves the device</p>
        </div>
      </footer>
    </div>
  );
}
