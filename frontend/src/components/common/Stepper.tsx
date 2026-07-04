import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type Step = { key: string; label: string };

/** Vertical step rail for multi-step flows (onboarding, generation). */
export function Stepper({
  steps,
  current,
  className,
}: {
  steps: Step[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn("flex flex-col gap-0.5", className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step.key} className="flex items-center gap-3 py-1.5">
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[12px] font-semibold transition-colors",
                done && "border-accent bg-accent text-on-accent",
                active && "border-accent bg-accent-soft text-accent-ink",
                !done && !active && "border-border text-text-3",
              )}
            >
              {done ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={cn(
                "text-[13.5px]",
                active ? "font-semibold text-text" : done ? "text-text-2" : "text-text-3",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
