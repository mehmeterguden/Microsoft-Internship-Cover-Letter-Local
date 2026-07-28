import { useState } from "react";
import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { AlertTriangle, ChevronDown, Home, RotateCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [showDetails, setShowDetails] = useState(false);
  const Icon = notFound ? SearchX : AlertTriangle;

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-6 py-16">
      <div className="w-full max-w-lg">
        <div
          className="relative overflow-hidden rounded-[22px] border border-border bg-surface p-8 shadow-elevated"
          style={{ animation: "cll-rise 0.4s both" }}
        >
          {/* soft accent glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full"
            style={{ background: "var(--glow-1)", opacity: 0.4, filter: "blur(48px)" }}
          />

          <div className="relative">
            <span
              className={cn(
                "mb-5 grid h-14 w-14 place-items-center rounded-[16px]",
                notFound ? "bg-accent-weak text-accent-text" : "bg-danger-weak text-danger",
              )}
            >
              <Icon size={26} />
            </span>

            <h1 className="text-[28px] font-extrabold tracking-tight text-fg">{title}</h1>
            <p className="mt-2 text-[16px] leading-relaxed text-fg-mid">
              {notFound
                ? message
                : "The app hit an unexpected error. Your data is safe and stays on your machine — try reloading, or head back home."}
            </p>

            {!notFound && (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-fg-low transition-colors hover:text-fg-mid"
                >
                  <ChevronDown size={14} className={cn("transition-transform", showDetails && "rotate-180")} />
                  {showDetails ? "Hide" : "Show"} technical details
                </button>
                {showDetails && (
                  <pre className="mt-2 max-h-56 overflow-auto rounded-[12px] border border-border bg-surface-2 p-3 text-[13px] leading-relaxed text-fg-mid">
                    <code>{stack || message}</code>
                  </pre>
                )}
              </div>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {!notFound && (
                <Button onClick={() => window.location.reload()}>
                  <RotateCw size={16} /> Reload page
                </Button>
              )}
              <Button variant={notFound ? "primary" : "outline"} asChild>
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
