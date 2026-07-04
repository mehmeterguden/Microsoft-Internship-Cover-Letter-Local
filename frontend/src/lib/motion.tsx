import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

/**
 * Small motion primitives used across pages for orchestrated entrances.
 * Motion automatically honors `prefers-reduced-motion` at the system level,
 * and our global CSS also collapses animation durations, so these degrade
 * gracefully to a static layout.
 */

const EASE = [0.22, 0.7, 0.2, 1] as const;

export const riseItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

const container = (stagger: number, delay: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

/** Staggers its <Reveal> children into view on mount. */
export function Stagger({
  children,
  stagger = 0.08,
  delay = 0,
  className,
}: {
  children: ReactNode;
  stagger?: number;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      variants={container(stagger, delay)}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** A single item that rises in — either standalone or as a Stagger child. */
export function Reveal({
  children,
  className,
  delay,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      variants={riseItem}
      initial={delay != null ? "hidden" : undefined}
      animate={delay != null ? "show" : undefined}
      transition={delay != null ? { duration: 0.5, ease: EASE, delay } : undefined}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export { motion, EASE };
