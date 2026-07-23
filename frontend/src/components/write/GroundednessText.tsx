import { type ReactNode } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScoreRing } from "@/components/common/ScoreRing";
import type { GroundednessResult } from "./letterTools";

/**
 * [1] Groundedness view — renders the letter with unsupported sentences flagged
 * in red; hovering a flag reveals why it was flagged / its evidence. A header
 * summarises how much of the letter is backed by the profile & research.
 */
export function GroundednessText({
  text,
  result,
}: {
  text: string;
  result: GroundednessResult;
}) {
  const claims = [...result.claims]
    .filter((c) => c.span)
    .sort((a, b) => (a.span![0] - b.span![0]));
  const flagged = result.claims.filter((c) => !c.supported).length;
  const total = result.claims.length;
  const groundedPct = total === 0 ? 100 : Math.round(((total - flagged) / total) * 100);

  // Rebuild the letter, wrapping flagged sentences and leaving the rest verbatim.
  const parts: ReactNode[] = [];
  let cursor = 0;
  claims.forEach((c, i) => {
    const [s, e] = c.span!;
    if (s < cursor) return; // skip any overlap defensively
    if (s > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, s)}</span>);
    const fragment = text.slice(s, e);
    if (c.supported) {
      parts.push(<span key={`s${i}`}>{fragment}</span>);
    } else {
      parts.push(
        <Tooltip key={`f${i}`}>
          <TooltipTrigger asChild>
            <mark className="cursor-help rounded-[3px] bg-danger-soft px-0.5 text-danger decoration-danger/50 decoration-dotted underline-offset-2 [text-decoration-line:underline]">
              {fragment}
            </mark>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <span className="flex items-start gap-1.5">
              <ShieldAlert size={13} className="mt-0.5 shrink-0 text-danger" />
              <span>{c.evidence ?? "No supporting evidence found."}</span>
            </span>
          </TooltipContent>
        </Tooltip>,
      );
    }
    cursor = e;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 p-3">
        <ScoreRing value={groundedPct} size={54} label="Grounded" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
            {flagged === 0 ? (
              <>
                <ShieldCheck size={15} className="text-good" /> Every statement looks grounded
              </>
            ) : (
              <>
                <ShieldAlert size={15} className="text-danger" /> {flagged} statement{flagged === 1 ? "" : "s"} need a source
              </>
            )}
          </p>
          <p className="mt-0.5 text-[12.5px] text-text-2">
            Hover a highlighted sentence to see why it was flagged. Switch back to Edit to fix it.
          </p>
        </div>
      </div>

      <div className="min-h-[52vh] whitespace-pre-wrap rounded-[10px] border border-border bg-surface p-4 font-serif text-[15px] leading-relaxed text-text">
        {parts.length > 0 ? parts : <span className="text-text-3">Nothing to check yet.</span>}
      </div>
    </div>
  );
}
