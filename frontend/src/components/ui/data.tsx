import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── ScoreRing (conic progress ring with a centered value) ──────── */
export function ScoreRing({
  value,
  size = 64,
  thickness = 6,
  color = "var(--accent)",
  track = "var(--input)",
  bg = "var(--surface)",
  label,
  className,
}: {
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  track?: string;
  bg?: string;
  label?: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("relative grid shrink-0 place-items-center rounded-full", className)}
      style={{ width: size, height: size, background: `conic-gradient(${color} 0 ${v}%, ${track} ${v}% 100%)` }}
    >
      <div className="absolute rounded-full" style={{ inset: thickness, background: bg }} />
      <div className="relative flex flex-col items-center leading-none">
        <span className="font-bold tracking-[-0.5px] text-fg" style={{ fontSize: size * 0.3 }}>
          {Math.round(v)}
        </span>
        {label ? (
          <span className="mt-0.5 font-semibold text-fg-low" style={{ fontSize: Math.max(8, size * 0.11), letterSpacing: 0.2 }}>
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ── SourceChip (cited source / provenance pill) ────────────────── */
export function SourceChip({
  label,
  href,
  tone = "accent",
  className,
}: {
  label: ReactNode;
  href?: string;
  tone?: "accent" | "warning" | "neutral";
  className?: string;
}) {
  const color = tone === "warning" ? "var(--warning)" : tone === "neutral" ? "var(--text-low)" : "var(--accent-text)";
  const cls = cn(
    "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-input px-2.5 py-[3px] font-mono text-[12px] leading-none",
    className,
  );
  const inner = (
    <>
      {tone !== "warning" ? <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: color }} /> : null}
      <span className="truncate" style={{ color }}>
        {label}
      </span>
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  return <span className={cls}>{inner}</span>;
}

/* ── Stepper (horizontal step rail) ─────────────────────────────── */
export type Step = { label: string; hint?: string };

export function Stepper({ steps, current, className }: { steps: Step[]; current: number; className?: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={step.label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-[13px] font-semibold transition-colors",
                  done && "border-transparent text-on-accent",
                  active && "border-accent text-accent-text",
                  !done && !active && "border-border bg-surface-2 text-fg-low",
                )}
                style={done ? { background: "var(--accent-grad)" } : active ? { background: "var(--accent-weak)" } : undefined}
              >
                {done ? <Check size={14} strokeWidth={2.6} /> : i + 1}
              </span>
              <div className="leading-tight">
                <div className={cn("text-[13px] font-medium", active || done ? "text-fg" : "text-fg-low")}>{step.label}</div>
                {step.hint ? <div className="text-[12px] text-fg-low">{step.hint}</div> : null}
              </div>
            </div>
            {i < steps.length - 1 ? (
              <div className="mx-3 h-px flex-1 rounded" style={{ background: done ? "var(--accent)" : "var(--border)" }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
