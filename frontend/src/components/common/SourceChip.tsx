import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** A cited research source — links out, shows whether the fetch succeeded. */
export function SourceChip({
  label,
  url,
  ok = true,
  className,
}: {
  label: string;
  url?: string;
  ok?: boolean;
  className?: string;
}) {
  const content = (
    <>
      {ok ? (
        <CheckCircle2 size={12} className="shrink-0 text-good" />
      ) : (
        <XCircle size={12} className="shrink-0 text-danger" />
      )}
      <span className="truncate">{label}</span>
      {url && <ExternalLink size={11} className="shrink-0 text-text-3" />}
    </>
  );

  const base = cn(
    "inline-flex max-w-56 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[10.5px] text-text-2",
    url && "transition-colors hover:border-border-strong hover:text-text",
    className,
  );

  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={base}>
      {content}
    </a>
  ) : (
    <span className={base}>{content}</span>
  );
}
