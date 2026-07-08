import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Sidebar } from "./Sidebar";

/** App frame for the tool pages: sticky theme-aware sidebar + content area. */
export function AppShell() {
  const location = useLocation();
  return (
    <div className="flex min-h-dvh bg-bg-2">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.22, 0.7, 0.2, 1] }}
            className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
