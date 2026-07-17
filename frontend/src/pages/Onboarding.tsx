import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, LayoutGrid, PartyPopper, PenLine, SkipForward } from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CvStep } from "@/components/onboarding/CvStep";
import { GithubStep } from "@/components/onboarding/GithubStep";
import { VoiceStep } from "@/components/onboarding/VoiceStep";
import { LetterStep } from "@/components/onboarding/LetterStep";
import { StepRail } from "@/components/onboarding/StepRail";
import {
  completedFromDetected,
  detectProgress,
  EMPTY_DETECTED,
  markOnboardingComplete,
  STEPS,
  type Detected,
  type StepKey,
  type StepProps,
} from "@/components/onboarding/types";

const STEP_COMPONENTS: Record<StepKey, React.ComponentType<StepProps>> = {
  cv: CvStep,
  github: GithubStep,
  voice: VoiceStep,
  letter: LetterStep,
};

/**
 * Full-screen first-run wizard: import CV → connect GitHub → teach writing
 * voice → generate the first letter. It reuses the existing CV/GitHub/voice/
 * letter flows (no new backend), resumes from whatever's already on file, and
 * hands off to the workspace when done. Lives on its own top-level route so it
 * takes over the whole screen (no sidebar).
 */
export function Onboarding() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [detected, setDetected] = useState<Detected>(EMPTY_DETECTED);
  const [done, setDone] = useState<Set<StepKey>>(new Set());
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [letterJobId, setLetterJobId] = useState<number | null>(null);

  // Resume from existing data: mark satisfied steps done and land on the first
  // incomplete one (or the last step if everything is already set up).
  useEffect(() => {
    let alive = true;
    detectProgress()
      .then((d) => {
        if (!alive) return;
        setDetected(d);
        const doneSet = completedFromDetected(d);
        setDone(doneSet);
        if (d.jobs[0]?.id != null) setLetterJobId(d.jobs[0].id);
        const firstIncomplete = STEPS.findIndex((s) => !doneSet.has(s.key));
        setStep(firstIncomplete === -1 ? STEPS.length - 1 : firstIncomplete);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const meta = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const stepDone = done.has(meta.key);

  const markDone = (key: StepKey, jobId?: number) => {
    setDone((prev) => new Set(prev).add(key));
    if (jobId != null) setLetterJobId(jobId);
  };

  function next() {
    if (isLast) setFinished(true);
    else setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function goToWorkspace() {
    markOnboardingComplete();
    navigate(letterJobId != null ? `/write?job=${letterJobId}` : "/cover-letters");
  }

  const StepComponent = STEP_COMPONENTS[meta.key];
  const doneCount = done.size;

  const summary = useMemo(
    () => [
      { label: "CV imported", ok: done.has("cv") },
      { label: "GitHub connected", ok: done.has("github") },
      { label: "Writing voice learned", ok: done.has("voice") },
      { label: "First letter written", ok: done.has("letter") },
    ],
    [done],
  );

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg-2">
      {/* Atmosphere (this route lives outside the app shell) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 cll-grid opacity-60" />
      <div
        aria-hidden
        className="cll-mesh h-80 w-80 rounded-full"
        style={{ top: "-6rem", left: "-5rem", background: "var(--accent-soft)" }}
      />
      <div
        aria-hidden
        className="cll-mesh h-96 w-96 rounded-full"
        style={{ bottom: "-9rem", right: "-6rem", background: "var(--blue-soft)", animationDelay: "-11s" }}
      />

      {/* Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          {!finished && (
            <Button variant="ghost" size="sm" onClick={goToWorkspace}>
              Skip setup <SkipForward size={14} />
            </Button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="relative z-10 flex flex-col items-center gap-3 py-40 text-center">
          <Spinner size={34} />
          <p className="text-[14px] text-text-2">Getting things ready…</p>
        </div>
      ) : finished ? (
        <FinishScreen summary={summary} onWorkspace={goToWorkspace} hasLetter={letterJobId != null} navigate={navigate} />
      ) : (
        <>
          {/* Progress rail */}
          <div className="relative z-10 mx-auto w-full max-w-3xl px-5">
            <StepRail current={step} done={done} onJump={(i) => setStep(i)} />
          </div>

          {/* Step heading + body */}
          <main className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-32 pt-7">
            <div className="mb-5 flex items-start gap-3.5" style={{ animation: "cll-rise 0.3s both" }}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent-ink">
                <meta.icon size={22} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-text-3">
                    Step {step + 1} of {STEPS.length}
                  </p>
                  {meta.optional && <Badge tone="neutral">Optional</Badge>}
                  {stepDone && <Badge tone="success">Done</Badge>}
                </div>
                <h1 className="mt-0.5 text-[22px] font-extrabold tracking-tight text-text">{meta.title}</h1>
                <p className="mt-0.5 text-[13.5px] leading-snug text-text-2">{meta.subtitle}</p>
              </div>
            </div>

            <StepComponent
              detected={detected}
              done={stepDone}
              onDone={(payload) => markDone(meta.key, payload?.jobId)}
            />
          </main>

          {/* Sticky footer nav */}
          <footer className="sticky bottom-0 z-20 border-t border-border bg-bg-2/85 backdrop-blur">
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-4">
              <div>
                {step > 0 && (
                  <Button variant="ghost" onClick={back}>
                    <ArrowLeft size={16} /> Back
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden font-mono text-[11px] text-text-3 sm:inline">{doneCount}/{STEPS.length} done</span>
                {stepDone ? (
                  <Button onClick={next}>
                    {isLast ? (
                      <>
                        Finish <Check size={16} />
                      </>
                    ) : (
                      <>
                        Continue <ArrowRight size={16} />
                      </>
                    )}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={next}>
                    {isLast ? "Skip & finish" : "Skip for now"} <SkipForward size={14} />
                  </Button>
                )}
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

function FinishScreen({
  summary,
  onWorkspace,
  hasLetter,
  navigate,
}: {
  summary: { label: string; ok: boolean }[];
  onWorkspace: () => void;
  hasLetter: boolean;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <main className="relative z-10 mx-auto grid w-full max-w-lg gap-6 px-5 pb-24 pt-10 text-center" style={{ animation: "cll-rise 0.4s both" }}>
      <div className="grid justify-items-center gap-3">
        <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-accent text-on-accent shadow-soft">
          <PartyPopper size={30} />
        </span>
        <h1 className="text-[26px] font-extrabold tracking-tight text-text">You're all set!</h1>
        <p className="max-w-sm text-[14px] leading-relaxed text-text-2">
          Your workspace is ready. You can revisit any of these any time from the sidebar.
        </p>
      </div>

      <div className="grid gap-2 text-left">
        {summary.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-3 shadow-soft"
          >
            <span
              className={
                s.ok
                  ? "grid h-6 w-6 place-items-center rounded-full bg-accent text-on-accent"
                  : "grid h-6 w-6 place-items-center rounded-full border border-border-strong text-text-3"
              }
            >
              {s.ok ? <Check size={14} strokeWidth={3} /> : null}
            </span>
            <span className={s.ok ? "text-[13.5px] font-semibold text-text" : "text-[13.5px] text-text-3"}>
              {s.label}
              {!s.ok && " · skipped"}
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Button onClick={onWorkspace} className="w-full">
          {hasLetter ? (
            <>
              <PenLine size={16} /> Open my letter
            </>
          ) : (
            <>
              <PenLine size={16} /> Write a letter
            </>
          )}
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            markOnboardingComplete();
            navigate("/cover-letters");
          }}
        >
          <LayoutGrid size={16} /> Go to Cover Letters
        </Button>
      </div>
    </main>
  );
}
