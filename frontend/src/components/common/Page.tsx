import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  /** small breadcrumb, Title Case, e.g. "Generate / Write Letter" */
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

/** The header bar used at the top of every page (mono eyebrow + title + actions). */
export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-7 py-5">
      <div className="min-w-0">
        <div className="text-[12px] font-semibold tracking-[0.01em] text-fg-mid">
          {eyebrow.split("/").map((part, i) => (
            <span key={i}>
              {i > 0 ? <span className="px-1.5 text-fg-low">/</span> : null}
              {part.trim()}
            </span>
          ))}
        </div>
        <h1 className="mt-1.5 truncate text-[22px] font-bold leading-tight tracking-[-0.02em] text-fg">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 truncate text-[13px] text-fg-mid">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}

type PageProps = PageHeaderProps & {
  children: ReactNode;
  /** override padding / layout of the scroll body */
  bodyClassName?: string;
  /** render children directly in the scroll area without default padding */
  bare?: boolean;
};

/** Standard page scaffold: sticky header + scrollable, padded body. */
export function Page({ eyebrow, title, subtitle, actions, children, bodyClassName, bare }: PageProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} />
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          !bare && "px-7 py-6",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
