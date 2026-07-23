import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A "Show technical details" disclosure — the raw error string (and optional code)
 * revealed on demand, so users see a friendly message by default but can always dig
 * into what actually happened. Shared by the route error screen, toasts, the async
 * boundary, and inline error cards. Renders nothing when there's nothing to show.
 */
export function ErrorDetails({
  detail,
  code,
  className,
}: {
  detail?: string | null;
  code?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!detail && !code) return null;

  const body = [code ? `code: ${code}` : null, detail].filter(Boolean).join("\n\n");

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-text-3 transition-colors hover:text-text-2"
      >
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
        {open ? "Hide" : "Show"} technical details
      </button>
      {open && (
        <pre className="mt-2 max-h-56 overflow-auto rounded-[10px] border border-border bg-surface-2 p-3 text-[11.5px] leading-relaxed text-text-2">
          <code>{body}</code>
        </pre>
      )}
    </div>
  );
}
