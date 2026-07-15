import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const toneText: Record<Tone, string> = {
  neutral: "text-fg-mid",
  accent: "text-accent-text",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};
const toneSoftBg: Record<Tone, string> = {
  neutral: "bg-surface-2",
  accent: "bg-accent-weak",
  success: "bg-success-weak",
  warning: "bg-warning-weak",
  danger: "bg-danger-weak",
};
const toneDot: Record<Tone, string> = {
  neutral: "var(--text-low)",
  accent: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

/* ── Pill / badge ───────────────────────────────────────────────── */
export function Pill({
  tone = "neutral",
  dot = false,
  mono = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium",
        toneSoftBg[tone],
        toneText[tone],
        mono && "font-mono tracking-[0.3px]",
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneDot[tone] }} /> : null}
      {children}
    </span>
  );
}

/* ── Status dot (optionally pulsing) ────────────────────────────── */
export function StatDot({ tone = "accent", pulse = false, size = 7, glow = false, className }: {
  tone?: Tone;
  pulse?: boolean;
  size?: number;
  glow?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: toneDot[tone],
        boxShadow: glow ? `0 0 8px ${toneDot[tone]}` : undefined,
        animation: pulse ? "cll-pulse 1.8s ease-in-out infinite" : undefined,
      }}
    />
  );
}

/* ── Spinner ────────────────────────────────────────────────────── */
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-block rounded-full border-2 border-border-strong border-t-accent", className)}
      style={{ width: size, height: size, animation: "cll-spin 0.7s linear infinite" }}
      role="status"
      aria-label="Loading"
    />
  );
}

/* ── Skeleton (shimmer) ─────────────────────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      className={cn("block rounded-[8px]", className)}
      style={{
        background: "linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2))",
        backgroundSize: "500px 100%",
        animation: "cll-shimmer 1.4s ease-in-out infinite",
      }}
    />
  );
}

/* ── Progress bar ───────────────────────────────────────────────── */
export function ProgressBar({ value, tone = "accent", className }: { value: number; tone?: Tone; className?: string }) {
  const fill =
    tone === "accent"
      ? "var(--accent-grad)"
      : toneDot[tone];
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-input", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: fill }}
      />
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────── */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {icon ? (
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] border border-border-strong bg-surface-2 text-accent-text"
          style={{ boxShadow: "0 0 30px -12px var(--accent-shadow)" }}
        >
          {icon}
        </div>
      ) : null}
      <h3 className="text-[18px] font-bold text-fg">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-fg-mid">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
