import { AlertTriangle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { ErrorDetails } from "@/components/common/ErrorDetails";
import { parseError, type AppError } from "@/api/errors";

/** Shows a spinner while loading, an error card with retry on failure, else children. */
export function AsyncBoundary({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean;
  error: AppError | string | null;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <Spinner size={32} />
        <p className="text-[13.5px] text-text-2">Loading…</p>
      </div>
    );
  }
  if (error) {
    const e: AppError = typeof error === "string" ? parseError(error) : error;
    return (
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-danger/25 bg-danger-soft px-6 py-12 text-center">
        <AlertTriangle size={24} className="text-danger" />
        <div className="max-w-md">
          <p className="text-[15px] font-semibold text-text">{e.title}</p>
          <p className="mt-1 text-[13.5px] text-text-2">{e.message}</p>
          <ErrorDetails detail={e.detail} code={e.code} className="mt-3 flex flex-col items-center" />
        </div>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }
  return <>{children}</>;
}
