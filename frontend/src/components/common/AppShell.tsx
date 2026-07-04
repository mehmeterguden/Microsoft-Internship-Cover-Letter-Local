import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

/** Two-column app frame: sticky sidebar + scrolling main content. */
export function AppShell() {
  return (
    <div className="flex min-h-dvh bg-bg">
      <Sidebar />
      <main className="relative min-w-0 flex-1">
        {/* Ambient accent glow, purely decorative. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-60"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, var(--accent-soft), transparent 70%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-5xl px-6 py-10 sm:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
