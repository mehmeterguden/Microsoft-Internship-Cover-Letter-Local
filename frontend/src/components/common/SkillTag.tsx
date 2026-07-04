import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mono chip for a skill/technology, optionally removable. */
export function SkillTag({
  children,
  onRemove,
  className,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[7px] border border-border bg-surface-2 px-2.5 py-1 font-mono text-[11px] text-text-2",
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove"
          onClick={onRemove}
          className="-mr-0.5 rounded-full p-0.5 text-text-3 transition-colors hover:text-danger"
        >
          <X size={11} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}
