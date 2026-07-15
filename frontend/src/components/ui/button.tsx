import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold outline-none transition-[filter,transform,box-shadow,background,border-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-accent-weak focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px",
  {
    variants: {
      variant: {
        // colorful gradient hero CTA (white text)
        primary: "overflow-hidden text-white hover:brightness-[1.07]",
        // the everyday action button — solid accent with dark ink
        solid: "bg-accent text-on-accent hover:brightness-[1.07]",
        // quiet bordered button
        outline: "border border-border-strong bg-surface text-fg hover:bg-surface-2",
        // borderless
        ghost: "text-fg-mid hover:bg-surface-2 hover:text-fg",
        // filled but muted
        subtle: "bg-surface-2 text-fg hover:brightness-110",
        danger: "bg-danger text-white hover:brightness-[1.07]",
        warning:
          "border border-[color:var(--warning)]/30 bg-warning-weak text-warning hover:brightness-110",
      },
      size: {
        xs: "h-8 px-3 text-[12px]",
        sm: "h-9 px-3.5 text-[12.5px]",
        md: "h-10 px-4 text-[13px]",
        lg: "h-11 px-5 text-[14px]",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: { variant: "solid", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
    /** primary variant only: animated sheen sweep */
    sheen?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, sheen = true, children, disabled, style, ...props }, ref) => {
    const isPrimary = variant === "primary";
    const primaryStyle = isPrimary
      ? { background: "var(--accent-grad)", boxShadow: "0 8px 22px -10px var(--accent-shadow)", ...style }
      : style;

    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} style={primaryStyle} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        style={primaryStyle}
        disabled={disabled || loading}
        {...props}
      >
        {isPrimary && sheen ? <span className="cll-sheen-el" aria-hidden /> : null}
        {loading ? <Loader2 size={15} className="relative animate-spin" /> : null}
        <span className="relative inline-flex items-center gap-2">{children}</span>
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
