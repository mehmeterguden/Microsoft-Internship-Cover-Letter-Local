import type { ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Spinner } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

type AsyncLike<T> = { data: T | null; loading: boolean; error: string | null; reload?: () => void };

type AsyncBoundaryProps<T> = {
  state: AsyncLike<T>;
  children: (data: T) => ReactNode;
  /** treat this data as "empty" (e.g. [] ) and render emptyView instead */
  isEmpty?: (data: T) => boolean;
  emptyView?: ReactNode;
  /** custom skeleton while loading */
  skeleton?: ReactNode;
};

/** Renders loading / error(+retry) / empty / content around an async result. */
export function AsyncBoundary<T>({ state, children, isEmpty, emptyView, skeleton }: AsyncBoundaryProps<T>) {
  if (state.loading) {
    return <>{skeleton ?? <div className="flex items-center justify-center py-20 text-fg-mid"><Spinner size={22} /></div>}</>;
  }
  if (state.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-[14px] bg-danger-weak text-danger">
          <AlertTriangle size={22} />
        </div>
        <div>
          <div className="text-[15px] font-bold text-fg">Something went wrong</div>
          <div className="mt-1 max-w-md text-[13px] text-fg-mid">{state.error}</div>
        </div>
        {state.reload ? (
          <Button variant="outline" size="sm" onClick={state.reload}>
            <RotateCw size={14} /> Try again
          </Button>
        ) : null}
      </div>
    );
  }
  if (state.data == null || (isEmpty && isEmpty(state.data))) {
    return <>{emptyView ?? null}</>;
  }
  return <>{children(state.data)}</>;
}
