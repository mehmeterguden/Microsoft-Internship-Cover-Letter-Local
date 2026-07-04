import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface-2 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent-ink">
        <Icon size={22} />
      </span>
      <div>
        <p className="text-[15px] font-semibold text-text">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-text-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}
