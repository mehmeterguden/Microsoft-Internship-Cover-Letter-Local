import { cn } from "@/lib/utils";

type Tone = "accent" | "gold" | "blue" | "danger";

const BAR: Record<Tone, string> = {
  accent: "bg-accent",
  gold: "bg-gold",
  blue: "bg-blue",
  danger: "bg-danger",
};

export function Progress({
  value,
  tone = "accent",
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  "aria-label"?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-bg-2", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", BAR[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
