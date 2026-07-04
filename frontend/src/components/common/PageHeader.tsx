import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-ink">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[clamp(28px,4vw,40px)] font-bold leading-tight">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[15px] text-text-2">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
