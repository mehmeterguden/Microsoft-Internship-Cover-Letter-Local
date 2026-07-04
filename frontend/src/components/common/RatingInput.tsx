import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** 1–5 star rating control (matches the backend Rating type). */
export function RatingInput({
  value,
  onChange,
  readOnly = false,
  className,
}: {
  value: number | null;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-0.5", className)} role={readOnly ? "img" : "radiogroup"} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value != null && n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            aria-pressed={filled}
            onClick={() => onChange?.(n)}
            className={cn(
              "rounded p-0.5 transition-transform",
              !readOnly && "hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              readOnly && "cursor-default",
            )}
          >
            <Star
              size={18}
              className={filled ? "fill-gold text-gold" : "text-border-strong"}
            />
          </button>
        );
      })}
    </div>
  );
}
