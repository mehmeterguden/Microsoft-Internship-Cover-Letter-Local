import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  FileUp,
  AudioLines,
  PenLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { Reveal, Stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: FileUp, title: "Import your CV", body: "Extract and structure your experience locally — no upload to the cloud.", to: "/onboarding", tone: "text-accent-ink bg-accent-soft" },
  { icon: AudioLines, title: "Learn your voice", body: "We study your past letters and build a fingerprint of how you write and think.", to: "/voice", tone: "text-violet bg-violet-soft" },
  { icon: Building2, title: "Research the company", body: "Parallel agents gather a detailed, source-cited intelligence report.", to: "/research", tone: "text-blue bg-blue-soft" },
  { icon: PenLine, title: "Generate the letter", body: "A grounded, personalized letter streams in — in your own voice.", to: "/write", tone: "text-gold bg-gold-soft" },
];

const SAMPLE =
  "Dear hiring team,\n\nI've always been obsessed with making software feel effortless — the kind of tool that disappears into the work. That's exactly why your push toward on-device AI caught my attention.";

/** A small looping "letter being written" preview for the hero. */
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
    }, 42);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative">
      <div
        className="absolute -inset-3 -z-10 rounded-[24px] opacity-70 blur-2xl"
        style={{ background: "radial-gradient(60% 60% at 70% 20%, var(--accent-soft), transparent 70%)" }}
      />
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="rounded-[20px] border border-border bg-surface/80 p-5 shadow-elevated backdrop-blur-xl"
      >
        <div className="mb-3 flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-gold/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-good/70" />
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-text-3">
            letter.md · streaming
          </span>
        </div>
        <div className="min-h-44 rounded-[12px] bg-paper p-4">
          <p className="whitespace-pre-wrap font-serif text-[15px] leading-[1.7] text-text">
            {SAMPLE.slice(0, n)}
            <span
              className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-accent"
              style={{ animation: "cll-caret 1s step-end infinite" }}
            />
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-accent-ink">
            <AudioLines size={11} /> your voice
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-soft px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-blue">
            <Building2 size={11} /> grounded
          </span>
        </div>
      </motion.div>
    </div>
  );
}

export function Home() {
  return (
    <>
      <section className="grid items-center gap-10 pb-16 pt-2 lg:grid-cols-[1.15fr_0.85fr]">
        <Stagger stagger={0.09}>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-ink backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              Runs entirely on your machine
            </span>
          </Reveal>
          <Reveal>
            <h1 className="mt-5 text-[clamp(38px,5.4vw,64px)] font-bold leading-[1.02] tracking-tight">
              Write cover letters that sound like{" "}
              <span className="font-serif italic font-normal text-accent-ink">you</span>
              <span className="text-text-3">.</span>
            </h1>
          </Reveal>
          <Reveal>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-text-2">
              Cover Letter Local learns your writing voice, profiles your skills, researches the
              company, and generates a personalized letter. Nothing leaves your device.
            </p>
          </Reveal>
          <Reveal>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/onboarding"
                className="cll-sheen inline-flex items-center gap-2 rounded-[12px] bg-accent px-6 py-3.5 text-[15px] font-bold text-on-accent shadow-soft transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <Sparkles size={17} /> Get started
              </Link>
              <Link
                to="/write"
                className="group inline-flex items-center gap-2 rounded-[12px] border border-border bg-surface/60 px-6 py-3.5 text-[15px] font-semibold text-text backdrop-blur transition-colors hover:border-border-strong"
              >
                Write a letter
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>
          <Reveal>
            <div className="mt-6 flex items-center gap-2 text-[12.5px] text-text-3">
              <ShieldCheck size={14} className="text-accent-ink" />
              No account. No telemetry. Your CV never leaves this device.
            </div>
          </Reveal>
        </Stagger>

        <Reveal delay={0.35} className="hidden lg:block">
          <LiveLetterDemo />
        </Reveal>
      </section>

      <section>
        <div className="mb-5 flex items-center gap-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-3">
            How it works
          </p>
          <span className="h-px flex-1 bg-line" />
        </div>
        <Stagger stagger={0.08} className="grid gap-4 sm:grid-cols-2">
          {STEPS.map(({ icon: Icon, title, body, to, tone }, i) => (
            <Reveal key={title}>
              <Link to={to} className="group block focus-visible:outline-none">
                <motion.div
                  whileHover={{ y: -5 }}
                  transition={{ type: "spring", stiffness: 400, damping: 26 }}
                  className="relative h-full overflow-hidden rounded-[16px] border border-border bg-surface/70 p-5 shadow-soft backdrop-blur-sm transition-colors group-hover:border-border-strong group-hover:shadow-elevated"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                    style={{ background: "radial-gradient(circle, var(--accent-soft), transparent 70%)" }}
                  />
                  <div className="flex items-start gap-4">
                    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-[12px]", tone)}>
                      <Icon size={20} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-text-3">0{i + 1}</span>
                        <h3 className="text-[15.5px] font-bold">{title}</h3>
                      </div>
                      <p className="mt-1 text-[13.5px] leading-snug text-text-2">{body}</p>
                    </div>
                    <ArrowUpRight
                      size={17}
                      className="ml-auto mt-1 shrink-0 text-text-3 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent-ink"
                    />
                  </div>
                </motion.div>
              </Link>
            </Reveal>
          ))}
        </Stagger>
      </section>
    </>
  );
}
