import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 0.7, 0.2, 1] }}
      className={cn("mb-8 flex flex-wrap items-start justify-between gap-4", className)}
    >
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <span className="mt-1 grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent-ink">
            <Icon size={24} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {eyebrow}
            </p>
          )}
          <h1 className="text-[clamp(26px,3.6vw,38px)] font-extrabold leading-tight tracking-tight">{title}</h1>
          {description && (
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-text-2">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </motion.header>
  );
}
