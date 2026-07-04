import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { GROUP_LABELS, NAV_ITEMS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const GROUP_ORDER: NavItem["group"][] = ["start", "prepare", "create", "system"];

/** App navigation — a fixed dark-navy rail, independent of the light/dark theme. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 z-20 flex h-dvh w-[260px] shrink-0 flex-col bg-navy text-white/90">
      <div className="px-5 pt-6 pb-5">
        <Logo inverted />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Primary">
        {GROUP_ORDER.map((group) => {
          const items = NAV_ITEMS.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-5">
              <p className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/35">
                {GROUP_LABELS[group]}
              </p>
              <ul className="space-y-0.5">
                {items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink to={to} end={to === "/"} className="block focus-visible:outline-none">
                      {({ isActive }) => (
                        <span
                          className={cn(
                            "group relative flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[14px] font-medium transition-colors",
                            isActive ? "text-white" : "text-white/60 hover:text-white",
                          )}
                        >
                          {isActive && (
                            <motion.span
                              layoutId="nav-active"
                              className="absolute inset-0 rounded-[11px] bg-accent/20 ring-1 ring-inset ring-accent/40"
                              transition={{ type: "spring", stiffness: 520, damping: 42 }}
                            />
                          )}
                          <Icon
                            size={18}
                            className={cn("relative z-10 shrink-0", isActive && "text-accent-ink")}
                          />
                          <span className="relative z-10">{label}</span>
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-3 flex items-start gap-2 rounded-[11px] bg-white/5 px-3 py-2.5">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent-ink" />
          <p className="text-[11.5px] leading-snug text-white/60">
            Runs on your machine. Your data never leaves the device.
          </p>
        </div>
        <ThemeToggle inverted className="w-full justify-center" />
      </div>
    </aside>
  );
}
