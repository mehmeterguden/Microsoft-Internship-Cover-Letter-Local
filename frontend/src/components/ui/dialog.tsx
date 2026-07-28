import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Accessible modal (Radix) styled to the design tokens. */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[3px]"
        style={{ animation: "cll-backdrop .2s ease" }}
      />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-[71] w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-border-strong bg-surface p-6 shadow-elevated outline-none",
          className,
        )}
        style={{ animation: "cll-modal .22s cubic-bezier(.16,1,.3,1)" }}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-4 top-4 rounded-[8px] p-1 text-fg-low outline-none transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X size={16} />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("pr-6 text-[18px] font-bold tracking-[-0.01em] text-fg", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-1.5 text-[15px] leading-relaxed text-fg-mid", className)} {...props} />;
}
