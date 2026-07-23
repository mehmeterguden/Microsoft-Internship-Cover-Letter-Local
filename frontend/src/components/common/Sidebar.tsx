import { NavLink, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Cpu, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { GROUP_LABELS, NAV_ITEMS, type NavItem } from "@/lib/nav";
import { getSettings } from "@/api/settings";
import { useAsync } from "@/lib/useAsync";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const PROVIDER_LABEL: Record<string, string> = {
  foundry_local: "Foundry Local",
  ollama: "Ollama",
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
};
const LOCAL = new Set(["foundry_local", "ollama"]);
const MICROSOFT = new Set(["foundry_local", "azure_openai"]);

function NavRow({ item }: { item: NavItem }) {
  const { to, label, hint, icon: Icon } = item;
  return (
    <li>
      <NavLink to={to} end={to === "/"} className="block focus-visible:outline-none">
        {({ isActive }) => (
          <span
            className={cn(
              "group relative flex items-center gap-3 rounded-[11px] px-3 py-2.5 transition-colors",
              isActive ? "text-text" : "text-text-2 hover:text-text",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-[11px] bg-accent-soft ring-1 ring-inset ring-accent/30"
                transition={{ type: "spring", stiffness: 520, damping: 42 }}
              />
            )}
            <span
              className={cn(
                "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-[9px] transition-colors",
                isActive ? "bg-accent text-on-accent shadow-soft" : "bg-surface-2 text-text-2 group-hover:text-text",
              )}
            >
              <Icon size={16} />
            </span>
            <span className="relative z-10 min-w-0">
              <span className="block text-[13.5px] font-semibold leading-tight">{label}</span>
              <span className={cn("block text-[11px] leading-tight", isActive ? "text-accent-ink" : "text-text-3")}>{hint}</span>
            </span>
          </span>
        )}
      </NavLink>
    </li>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();
  const home = NAV_ITEMS.filter((i) => i.group === "home");
  const setup = NAV_ITEMS.filter((i) => i.group === "setup");
  const create = NAV_ITEMS.filter((i) => i.group === "create");

  // Re-read on navigation so the footer reflects a just-changed model.
  const settings = useAsync(getSettings, [pathname]);
  const provider = settings.data?.llm_provider ?? "";
  const model = settings.data?.llm_model ?? "";
  const providerLabel = PROVIDER_LABEL[provider] ?? provider;

  return (
    <aside className="sticky top-0 z-20 flex h-dvh w-[272px] shrink-0 flex-col border-r border-border bg-surface text-text">
      <div className="px-5 pt-6 pb-4">
        <Logo />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Primary">
        <ul className="space-y-1">
          {home.map((i) => <NavRow key={i.to} item={i} />)}
        </ul>

        {/* Stage 1 — Setup */}
        <div className="mt-5 rounded-[14px] bg-surface-2 p-2 ring-1 ring-border">
          <p className="px-2 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent-ink">
            {GROUP_LABELS.setup}
          </p>
          <ul className="space-y-0.5">
            {setup.map((i) => <NavRow key={i.to} item={i} />)}
          </ul>
        </div>

        {/* Stage 2 — Write & apply */}
        <div className="mt-4 rounded-[14px] bg-surface-2 p-2 ring-1 ring-border">
          <p className="px-2 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent-ink">
            {GROUP_LABELS.create}
          </p>
          <ul className="space-y-0.5">
            {create.map((i) => <NavRow key={i.to} item={i} />)}
          </ul>
        </div>
      </nav>

      {/* Footer: privacy · current model · settings + theme */}
      <div className="space-y-2.5 border-t border-border p-3">
        <div className="flex items-start gap-2 rounded-[11px] bg-surface-2 px-3 py-2">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent-ink" />
          <p className="text-[11px] leading-snug text-text-3">Runs on your machine — your data never leaves the device.</p>
        </div>

        {/* Current model — click to change in Settings */}
        <NavLink
          to="/settings"
          title="Change model in Settings"
          className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5 transition-colors hover:border-border-strong focus-visible:outline-none"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-ink">
            <Cpu size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-3">Current model</span>
              {MICROSOFT.has(provider) && (
                <span className="rounded-full bg-accent-soft px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-accent-ink">
                  Microsoft
                </span>
              )}
            </span>
            <span className="block truncate text-[13px] font-semibold text-text">
              {model || (settings.loading ? "…" : "Not set")}
            </span>
            {provider && (
              <span className="block text-[11px] text-text-3">
                {providerLabel} · {LOCAL.has(provider) ? "on-device" : "cloud"}
              </span>
            )}
          </span>
          <span className={cn("h-2 w-2 shrink-0 rounded-full", provider ? "bg-accent" : "bg-text-3/50")} />
        </NavLink>

        {/* Settings + theme toggle */}
        <div className="flex gap-2">
          <NavLink to="/settings" className="flex-1 focus-visible:outline-none">
            {({ isActive }) => (
              <span
                className={cn(
                  "flex items-center justify-center gap-2 rounded-[11px] px-3 py-2.5 text-[13px] font-semibold transition-colors",
                  isActive
                    ? "bg-accent-soft text-accent-ink ring-1 ring-inset ring-accent/30"
                    : "border border-border text-text-2 hover:border-border-strong hover:text-text",
                )}
              >
                <SettingsIcon size={15} /> Settings
              </span>
            )}
          </NavLink>
          <ThemeToggle compact />
        </div>
      </div>
    </aside>
  );
}
