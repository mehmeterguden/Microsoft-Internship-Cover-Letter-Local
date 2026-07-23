import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { AlertTriangle, Home, RotateCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorDetails } from "@/components/common/ErrorDetails";
import { cn } from "@/lib/utils";

/** Turn any thrown value from the router into a readable title + message + stack. */
function describe(error: unknown): { notFound: boolean; title: string; message: string; stack?: string } {
  if (isRouteErrorResponse(error)) {
    const notFound = error.status === 404;
    return {
      notFound,
      title: notFound ? "Page not found" : `${error.status} ${error.statusText}`,
      message: notFound
        ? "That page doesn't exist — it may have moved or the link is out of date."
        : (typeof error.data === "string" ? error.data : "The router returned an unexpected response."),
    };
  }
  if (error instanceof Error) {
    return { notFound: false, title: "Something went wrong on this page", message: error.message, stack: error.stack };
  }
  return { notFound: false, title: "Something went wrong on this page", message: String(error) };
}

/** Full-page, theme-aware error screen shown by the router's `errorElement`. */
export function RouteError() {
  const error = useRouteError();
  const { notFound, title, message, stack } = describe(error);
  const Icon = notFound ? SearchX : AlertTriangle;

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-6 py-16">
      <div className="w-full max-w-lg">
        <div
          className="relative overflow-hidden rounded-[22px] border border-border bg-surface p-8 shadow-elevated"
          style={{ animation: "cll-rise 0.4s both" }}
        >
          {/* soft accent glow */}
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-accent-soft blur-3xl" />

          <div className="relative">
            <span
              className={cn(
                "mb-5 grid h-14 w-14 place-items-center rounded-[16px]",
                notFound ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger",
              )}
            >
              <Icon size={26} />
            </span>

            <h1 className="text-[24px] font-extrabold tracking-tight text-text">{title}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-text-2">
              {notFound
                ? message
                : "The app hit an unexpected error. Your data is safe and stays on your machine — try reloading, or head back home."}
            </p>

            {!notFound && <ErrorDetails detail={stack || message} className="mt-5" />}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {!notFound && (
                <Button onClick={() => window.location.reload()}>
                  <RotateCw size={16} /> Reload page
                </Button>
              )}
              <Button variant={notFound ? "primary" : "secondary"} asChild>
                <Link to="/">
                  <Home size={16} /> Back to home
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
