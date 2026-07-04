import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { GROUP_LABELS, NAV_ITEMS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const GROUP_ORDER: NavItem["group"][] = ["start", "prepare", "create", "system"];

export function Sidebar() {
  return (
    <aside className="sticky top-0 z-20 flex h-dvh w-[264px] shrink-0 flex-col border-r border-border bg-bg-2/70 backdrop-blur-xl">
      <div className="px-5 pt-6 pb-4">
        <Logo />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Primary">
        {GROUP_ORDER.map((group) => {
          const items = NAV_ITEMS.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-5">
              <p className="px-3 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">
                {GROUP_LABELS[group]}
              </p>
              <ul className="space-y-0.5">
                {items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink to={to} end={to === "/"} className="block focus-visible:outline-none">
                      {({ isActive }) => (
                        <span
                          className={cn(
                            "group relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-medium transition-colors",
                            isActive ? "text-accent-ink" : "text-text-2 hover:text-text",
                          )}
                        >
                          {isActive && (
                            <motion.span
                              layoutId="nav-active"
                              className="absolute inset-0 rounded-[10px] bg-accent-soft ring-1 ring-inset ring-accent/20"
                              transition={{ type: "spring", stiffness: 520, damping: 42 }}
                            />
                          )}
                          <Icon
                            size={17}
                            className={cn(
                              "relative z-10 shrink-0 transition-transform group-hover:scale-110",
                              isActive && "scale-110",
                            )}
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

      <div className="border-t border-border p-3">
        <div className="mb-3 flex items-start gap-2 rounded-[10px] bg-accent-soft px-3 py-2.5">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent-ink" />
          <p className="text-[11.5px] leading-snug text-text-2">
            Runs on your machine. Your data never leaves the device.
          </p>
        </div>
        <ThemeToggle className="w-full justify-center" />
      </div>
    </aside>
  );
}
