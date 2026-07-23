import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from "lucide-react";
import { useToastStore, type Toast, type ToastTone } from "@/store/toast";
import { ErrorDetails } from "@/components/common/ErrorDetails";
import { cn } from "@/lib/utils";

const TONE: Record<ToastTone, { icon: LucideIcon; color: string }> = {
  info: { icon: Info, color: "text-blue" },
  success: { icon: CheckCircle2, color: "text-good" },
  warning: { icon: AlertTriangle, color: "text-gold" },
  danger: { icon: XCircle, color: "text-danger" },
};

const AUTO_DISMISS_MS = 4500;
const DANGER_DISMISS_MS = 9000; // errors linger longer so they can be read/expanded

function ToastCard({ id, tone, title, description, detail, code, action, sticky }: Toast) {
  const dismiss = useToastStore((s) => s.dismiss);
  const { icon: Icon, color } = TONE[tone];

  // Errors (and anything explicitly sticky) stay until dismissed; others auto-close.
  useEffect(() => {
    if (sticky) return;
    const ms = tone === "danger" ? DANGER_DISMISS_MS : AUTO_DISMISS_MS;
    const timer = window.setTimeout(() => dismiss(id), ms);
    return () => window.clearTimeout(timer);
  }, [id, dismiss, tone, sticky]);

  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className="flex w-80 items-start gap-3 rounded-[12px] border border-border bg-surface p-3.5 shadow-elevated"
      style={{ animation: "cll-rise 0.28s both" }}
    >
      <Icon size={18} className={cn("mt-0.5 shrink-0", color)} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-text">{title}</p>
        {description && <p className="mt-0.5 text-[12.5px] text-text-2">{description}</p>}
        {(detail || code) && <ErrorDetails detail={detail} code={code} className="mt-2" />}
        {action && (
          <button
            type="button"
            onClick={() => {
              action.onClick();
              dismiss(id);
            }}
            className="mt-2 text-[12.5px] font-semibold text-accent-ink transition-colors hover:text-accent"
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(id)}
        className="rounded-[6px] p-0.5 text-text-3 transition-colors hover:text-text"
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
