import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small uppercase mono label, matching the design's field kickers. */
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-fg-mid", className)}
      {...props}
    />
  );
}

const fieldBase =
  "w-full rounded-[9px] border border-border bg-input text-[13px] text-fg placeholder:text-fg-low outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-2 focus:ring-accent-weak disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, "h-10 px-3", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, "min-h-[92px] resize-y px-3 py-2.5 leading-relaxed", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

type FieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
};

/** label + control + optional hint, stacked. */
export function Field({ label, hint, htmlFor, children, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {hint ? <p className="text-[11px] leading-snug text-fg-low">{hint}</p> : null}
    </div>
  );
}
