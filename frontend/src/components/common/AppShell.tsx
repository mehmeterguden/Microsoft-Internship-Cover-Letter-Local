import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Sidebar } from "./Sidebar";

/**
 * App frame: the drifting-glow + faint-grid atmosphere from the design,
 * a fixed sidebar, and a scrollable content area that renders the active
 * page. Each page supplies its own header via the <Page> component.
 */
export function AppShell() {
  const location = useLocation();
  return (
    <div className="relative flex h-dvh overflow-hidden bg-bg text-fg">
      {/* atmosphere */}
      <div
        aria-hidden
        className="cll-orb"
        style={{
          top: -190,
          left: -130,
          width: 640,
          height: 640,
          background: "var(--glow-1)",
          filter: "blur(95px)",
          opacity: 0.6,
          animation: "cll-drift 24s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="cll-orb"
        style={{
          bottom: -230,
          right: -110,
          width: 720,
          height: 720,
          background: "var(--glow-2)",
          filter: "blur(115px)",
          opacity: 0.55,
          animation: "cll-drift2 29s ease-in-out infinite",
        }}
      />
      <div aria-hidden className="cll-grid pointer-events-none absolute inset-0" />

      <Sidebar />

      <main className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.22, 0.7, 0.2, 1] }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
