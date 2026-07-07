import { FileText, Github, Linkedin, PencilLine, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Source } from "@/api/types";

interface SourceStyle {
  label: string;
  icon: LucideIcon;
  /** Tailwind classes for the pill (bg + text). */
  pill: string;
  /** Human sentence used in the tooltip. */
  verb: string;
}

const SOURCES: Record<Source, SourceStyle> = {
  cv: { label: "CV", icon: FileText, pill: "bg-accent-soft text-accent-ink", verb: "Extracted from your CV" },
  github: { label: "GitHub", icon: Github, pill: "bg-violet-soft text-violet", verb: "Imported from GitHub" },
  linkedin: { label: "LinkedIn", icon: Linkedin, pill: "bg-blue-soft text-blue", verb: "Imported from LinkedIn" },
  manual: { label: "Manual", icon: PencilLine, pill: "bg-surface-2 text-text-2", verb: "Added by you" },
};

/** Format an ISO date (YYYY-MM-DD) as a short, readable label. */
function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A compact chip showing where a piece of profile data came from. Hover reveals
 * the full provenance: the exact origin (e.g. the CV filename) and the date.
 */
export function ProvenanceBadge({
  source = "manual",
  detail,
  at,
  className,
}: {
  source?: Source;
  detail?: string | null;
  at?: string | null;
  className?: string;
}) {
  const style = SOURCES[source] ?? SOURCES.manual;
  const Icon = style.icon;
  const date = formatDate(at);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em]",
            style.pill,
            className,
          )}
        >
          <Icon size={11} className="shrink-0" />
          {style.label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-semibold">{style.verb}</p>
        {detail && <p className="mt-0.5 text-text-2">{detail}</p>}
        {date && <p className="mt-0.5 text-text-3">{date}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
