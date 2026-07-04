import { forwardRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Native checkbox styled to the design system (no extra dependency). */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => (
  <span className="relative inline-flex">
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[6px] border border-border-strong bg-surface transition-colors",
        "checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-55",
        className,
      )}
      {...props}
    />
    <Check
      size={13}
      strokeWidth={3}
      className="pointer-events-none absolute left-[2.5px] top-[2.5px] text-on-accent opacity-0 peer-checked:opacity-100"
    />
  </span>
));
Checkbox.displayName = "Checkbox";
