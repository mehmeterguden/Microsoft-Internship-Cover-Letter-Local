import { cn } from "@/lib/utils";

/** Conic-gradient score dial (0–100). Color shifts by band. */
export function ScoreRing({
  value,
  size = 70,
  label,
  className,
}: {
  value: number;
  size?: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const color =
    clamped >= 75 ? "var(--good)" : clamped >= 50 ? "var(--gold)" : "var(--danger)";
  const inner = size - 16;

  return (
    <div
      className={cn("relative grid shrink-0 place-items-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} ${clamped * 3.6}deg, var(--bg-2) 0)`,
      }}
      role="img"
      aria-label={label ? `${label}: ${clamped}` : `Score ${clamped} of 100`}
    >
      <div
        className="grid place-items-center rounded-full bg-surface"
        style={{ width: inner, height: inner }}
      >
        <span className="font-display text-[19px] font-bold" style={{ color }}>
          {clamped}
        </span>
      </div>
    </div>
  );
}
