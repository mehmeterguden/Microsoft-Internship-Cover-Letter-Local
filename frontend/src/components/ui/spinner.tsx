import { cn } from "@/lib/utils";

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-block animate-spin rounded-full border-[3px] border-accent-soft border-t-accent", className)}
      style={{ width: size, height: size }}
    />
  );
}
