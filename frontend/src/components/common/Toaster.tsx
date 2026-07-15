import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from "lucide-react";
import { useToastStore, type ToastTone } from "@/store/toast";
import { cn } from "@/lib/utils";

const TONE: Record<ToastTone, { icon: LucideIcon; color: string }> = {
  info: { icon: Info, color: "text-accent-text" },
  success: { icon: CheckCircle2, color: "text-success" },
  warning: { icon: AlertTriangle, color: "text-warning" },
  danger: { icon: XCircle, color: "text-danger" },
};

const AUTO_DISMISS_MS = 4500;

function ToastCard({ id, tone, title, description }: { id: number; tone: ToastTone; title: string; description?: string }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const { icon: Icon, color } = TONE[tone];

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [id, dismiss]);

  return (
    <div
      role="status"
      className="flex w-80 items-start gap-3 rounded-[12px] border border-border bg-surface p-3.5 shadow-elevated"
      style={{ animation: "cll-rise 0.28s both" }}
    >
      <Icon size={18} className={cn("mt-0.5 shrink-0", color)} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-fg">{title}</p>
        {description && <p className="mt-0.5 text-[13px] text-fg-mid">{description}</p>}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(id)}
        className="rounded-[6px] p-0.5 text-fg-low transition-colors hover:text-fg"
      >
        <X size={15} />
      </button>
    </div>
  );
}

/** Fixed toast viewport — mount once near the app root. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2.5">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard {...t} />
        </div>
      ))}
    </div>
  );
}
