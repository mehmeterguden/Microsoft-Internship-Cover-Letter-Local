import { type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

/**
 * The setup intro header — an accent icon tile + title + subtitle + on-device
 * privacy chip. Every setup page drops this at the top of its body so the four
 * screens (Add CV, Voice, GitHub, LinkedIn) read as one consistent template.
 */
export function SetupIntro({
  icon,
  title,
  subtitle,
  privacyNote = "Runs on-device · nothing leaves your machine",
  actions,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  privacyNote?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("cll-fade flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex items-start gap-3.5">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-white"
          style={{ background: "var(--accent-grad)", boxShadow: "0 12px 30px -10px var(--accent-shadow)" }}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold tracking-[-0.3px] text-fg">{title}</h2>
          <p className="mt-0.5 max-w-[560px] text-[13px] leading-[1.5] text-fg-mid">{subtitle}</p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10.5px] font-semibold text-fg-mid">
            <ShieldCheck size={12} className="text-success" aria-hidden="true" /> {privacyNote}
          </span>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

/**
 * Centered-column setup shell (intro + content), used by the Add-CV upload
 * screen. Other setup pages compose {@link SetupIntro} directly at their body top.
 */
export function SetupScaffold({
  icon,
  title,
  subtitle,
  privacyNote,
  actions,
  className,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  privacyNote?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("cll-fade mx-auto flex w-full max-w-[880px] flex-col gap-6", className)}>
      <SetupIntro icon={icon} title={title} subtitle={subtitle} privacyNote={privacyNote} actions={actions} />
      {children}
    </div>
  );
}

/** Standardized setup empty state — a bordered dashed panel around EmptyState. */
export function SetupEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className="rounded-[16px] border border-dashed border-border-strong"
      style={{ background: "radial-gradient(120% 120% at 50% -10%, var(--accent-weak), transparent 55%), var(--surface)" }}
    >
      <EmptyState icon={icon} title={title} description={description} action={action} className="py-14" />
    </div>
  );
}
