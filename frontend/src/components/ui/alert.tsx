import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, { wrap: string; icon: LucideIcon; iconColor: string }> = {
  info: { wrap: "bg-blue-soft border-blue/25", icon: Info, iconColor: "text-blue" },
  success: { wrap: "bg-good-soft border-good/25", icon: CheckCircle2, iconColor: "text-good" },
  warning: { wrap: "bg-gold-soft border-gold/25", icon: AlertTriangle, iconColor: "text-gold" },
  danger: { wrap: "bg-danger-soft border-danger/25", icon: XCircle, iconColor: "text-danger" },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { wrap, icon: Icon, iconColor } = TONES[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-[12px] border px-4 py-3.5", wrap, className)}
    >
      <Icon size={18} className={cn("mt-0.5 shrink-0", iconColor)} />
      <div className="min-w-0 text-[13.5px] leading-snug text-text">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-text-2")}>{children}</div>}
      </div>
    </div>
  );
}
