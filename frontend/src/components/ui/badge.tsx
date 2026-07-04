import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.04em]",
  {
    variants: {
      tone: {
        accent: "bg-accent-soft text-accent-ink",
        gold: "bg-gold-soft text-gold",
        blue: "bg-blue-soft text-blue",
        violet: "bg-violet-soft text-violet",
        danger: "bg-danger-soft text-danger",
        success: "bg-good-soft text-good",
        neutral: "bg-surface-2 text-text-2",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
