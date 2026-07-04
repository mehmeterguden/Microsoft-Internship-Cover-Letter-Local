import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "inline-flex items-center gap-2 rounded-[11px] px-3 py-2.5 text-[12.5px] font-semibold transition-colors",
        inverted
          ? "border border-white/15 text-white/70 hover:border-white/30 hover:text-white"
          : "border border-border bg-surface text-text-2 hover:border-border-strong hover:text-text",
        className,
      )}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
