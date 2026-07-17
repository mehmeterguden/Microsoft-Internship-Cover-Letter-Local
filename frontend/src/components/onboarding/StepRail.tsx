import { Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { STEPS, type StepKey } from "./types";

/**
 * Horizontal step rail + overall progress bar. Circles show done (check),
 * current (accent ring), or upcoming (muted). Labels collapse on narrow screens
 * so only the active step's title carries the context there.
 */
export function StepRail({
  current,
  done,
  onJump,
}: {
  current: number;
  done: Set<StepKey>;
  /** Jump to an already-visited/completed step. */
  onJump: (index: number) => void;
}) {
  const pct = Math.round((done.size / STEPS.length) * 100);

  return (
    <div className="grid gap-3">
      <ol className="flex items-center gap-1.5">
        {STEPS.map((step, i) => {
          const isDone = done.has(step.key);
          const isCurrent = i === current;
          const reachable = isDone || i <= current;
          return (
            <li key={step.key} className="flex flex-1 items-center gap-1.5">
              <button
                type="button"
                onClick={() => reachable && onJump(i)}
                disabled={!reachable}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${step.title}${isDone ? " (done)" : ""}`}
                className={cn(
                  "group flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-1 transition-colors sm:pr-3",
                  reachable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[13px] font-bold transition-colors",
                    isDone
                      ? "border-transparent bg-accent text-on-accent"
                      : isCurrent
                        ? "border-accent bg-accent-soft text-accent-ink"
                        : "border-border bg-surface text-text-3",
                  )}
                >
                  {isDone ? <Check size={16} strokeWidth={2.6} /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden truncate text-[12.5px] font-semibold sm:inline",
                    isCurrent ? "text-text" : isDone ? "text-text-2" : "text-text-3",
                  )}
                >
                  {step.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-px flex-1 rounded-full transition-colors",
                    done.has(step.key) ? "bg-accent/50" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      <Progress value={pct} aria-label={`Setup progress: ${pct}% complete`} />
    </div>
  );
}
