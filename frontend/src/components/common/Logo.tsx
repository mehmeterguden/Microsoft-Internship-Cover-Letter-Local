import { cn } from "@/lib/utils";

/** Wordmark: a small on-device glyph + the product name. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-[9px] bg-accent text-on-accent shadow-soft"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
          <path d="M14 4v6h6" />
          <path d="M8 14h8M8 17.5h5" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-[15px] font-bold tracking-tight text-text">
          Cover Letter
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-ink">
          Local
        </span>
      </span>
    </span>
  );
}
