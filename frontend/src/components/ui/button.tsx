import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] font-semibold transition-all disabled:pointer-events-none disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-on-accent shadow-soft hover:brightness-[1.06] active:brightness-95",
        secondary:
          "border border-border bg-surface text-text hover:border-border-strong hover:bg-surface-2",
        ghost: "text-text-2 hover:bg-surface-2 hover:text-text",
        dashed:
          "border-[1.5px] border-dashed border-border-strong bg-transparent text-text-2 hover:border-accent hover:text-accent-ink",
        danger:
          "bg-danger text-white shadow-soft hover:brightness-105 active:brightness-95",
        outline:
          "border border-border-strong bg-transparent text-text hover:bg-surface-2",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px]",
        md: "h-11 px-5 text-[14px]",
        lg: "h-[52px] px-7 text-[15.5px]",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    // When asChild, Radix Slot requires exactly one child element — so we must
    // not inject a sibling spinner. asChild links/anchors don't use `loading`.
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
