import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** visual weight: flat surface, elevated gradient panel, or borderless */
  variant?: "default" | "panel" | "bare";
  /** lift + brighten border on hover (for clickable cards) */
  hoverable?: boolean;
  /** render a soft accent glow orb in the top-right corner */
  glow?: boolean;
};

/**
 * Surface container matching the design's card language. `panel` is the
 * elevated look (surface-2→surface gradient, stronger border); `glow`
 * drops a blurred accent orb behind the content.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", hoverable = false, glow = false, style, children, ...props }, ref) => {
    const panelStyle =
      variant === "panel"
        ? { background: "linear-gradient(135deg, var(--surface-2), var(--surface))", ...style }
        : style;
    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-[16px]",
          variant !== "bare" && "border shadow-soft",
          variant === "panel" ? "border-border-strong" : "border-border",
          variant !== "panel" && variant !== "bare" && "bg-surface",
          hoverable &&
            "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated",
          className,
        )}
        style={panelStyle}
        {...props}
      >
        {glow ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-24 h-56 w-72 rounded-full"
            style={{ background: "var(--glow-1)", opacity: 0.28, filter: "blur(60px)" }}
          />
        ) : null}
        {glow ? <div className="relative">{children}</div> : children}
      </div>
    );
  },
);
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5 p-5", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-[15px] font-bold leading-tight tracking-[-0.01em] text-fg", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-[13px] leading-relaxed text-fg-mid", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center gap-2 border-t border-border p-5", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";
