import { Hammer } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";

/**
 * Temporary page body used during the scaffold PR. Real pages replace these in
 * the pages PR; the route + shell already work so navigation can be verified.
 */
export function Placeholder({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div
        className="flex items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface-2 px-5 py-4 text-text-2"
        style={{ animation: "cll-rise 0.4s both" }}
      >
        <Hammer size={18} className="text-accent-ink" />
        <p className="text-[14px]">This screen is coming together — building it out next.</p>
      </div>
    </>
  );
}
