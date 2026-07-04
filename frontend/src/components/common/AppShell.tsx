import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Sidebar } from "./Sidebar";

/** Two-column app frame: sticky sidebar + scrolling main content with atmosphere. */
export function AppShell() {
  const location = useLocation();
  return (
    <div className="relative flex min-h-dvh overflow-hidden bg-bg">
      {/* Ambient layers: drifting color mesh + faint grid + film grain. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div
          className="cll-mesh -left-32 -top-40 h-[46rem] w-[46rem] rounded-full"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 62%)", opacity: 0.16 }}
        />
        <div
          className="cll-mesh right-[-10rem] top-[10rem] h-[34rem] w-[34rem] rounded-full"
          style={{ background: "radial-gradient(circle, var(--violet) 0%, transparent 62%)", opacity: 0.14, animationDelay: "-9s" }}
        />
        <div className="absolute inset-0 cll-grid opacity-60" />
      </div>

      <Sidebar />

      <main className="relative z-10 min-w-0 flex-1 cll-grain">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.32, ease: [0.22, 0.7, 0.2, 1] }}
            className="relative z-10 mx-auto w-full max-w-5xl px-6 py-10 sm:px-10"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
