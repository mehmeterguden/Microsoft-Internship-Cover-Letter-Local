import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { GROUP_LABELS, NAV_ITEMS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

function NavRow({ item }: { item: NavItem }) {
  const { to, label, hint, icon: Icon } = item;
  return (
    <li>
      <NavLink to={to} end={to === "/"} className="block focus-visible:outline-none">
        {({ isActive }) => (
          <span
            className={cn(
              "group relative flex items-center gap-3 rounded-[11px] px-3 py-2.5 transition-colors",
              isActive ? "text-white" : "text-white/65 hover:text-white",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-[11px] bg-accent/20 ring-1 ring-inset ring-accent/40"
                transition={{ type: "spring", stiffness: 520, damping: 42 }}
              />
            )}
            <span
              className={cn(
                "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-[9px] transition-colors",
                isActive ? "bg-accent text-on-accent" : "bg-white/5 text-white/70 group-hover:bg-white/10",
              )}
            >
              <Icon size={16} />
            </span>
            <span className="relative z-10 min-w-0">
              <span className="block text-[13.5px] font-semibold leading-tight">{label}</span>
              <span className={cn("block text-[11px] leading-tight", isActive ? "text-white/70" : "text-white/40")}>{hint}</span>
            </span>
          </span>
        )}
      </NavLink>
    </li>
  );
}

export function Sidebar() {
  const home = NAV_ITEMS.filter((i) => i.group === "home");
  const setup = NAV_ITEMS.filter((i) => i.group === "setup");
  const create = NAV_ITEMS.filter((i) => i.group === "create");
  const system = NAV_ITEMS.filter((i) => i.group === "system");

  return (
    <aside className="sticky top-0 z-20 flex h-dvh w-[272px] shrink-0 flex-col bg-navy text-white">
      <div className="px-5 pt-6 pb-4">
        <Logo inverted />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Primary">
        <ul className="space-y-1">
          {home.map((i) => <NavRow key={i.to} item={i} />)}
        </ul>

        {/* Stage 1 — Setup */}
        <div className="mt-5 rounded-[14px] bg-white/[0.03] p-2 ring-1 ring-white/5">
          <p className="px-2 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent-ink">
            {GROUP_LABELS.setup}
          </p>
          <ul className="space-y-0.5">
            {setup.map((i) => <NavRow key={i.to} item={i} />)}
          </ul>
        </div>

        {/* Stage 2 — Write & apply */}
        <div className="mt-4 rounded-[14px] bg-white/[0.03] p-2 ring-1 ring-white/5">
          <p className="px-2 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent-ink">
            {GROUP_LABELS.create}
          </p>
          <ul className="space-y-0.5">
            {create.map((i) => <NavRow key={i.to} item={i} />)}
          </ul>
        </div>

        <ul className="mt-4 space-y-0.5">
          {system.map((i) => <NavRow key={i.to} item={i} />)}
        </ul>
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-3 flex items-start gap-2 rounded-[11px] bg-white/5 px-3 py-2.5">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent-ink" />
          <p className="text-[11.5px] leading-snug text-white/60">Runs on your machine. Your data never leaves the device.</p>
        </div>
        <ThemeToggle inverted className="w-full justify-center" />
      </div>
    </aside>
  );
}
