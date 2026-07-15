import { NavLink } from "react-router-dom";
import { useTheme } from "@/lib/theme";
import { MAIN_NAV, SETUP_NAV, type NavIcon, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/mehmeterguden/Microsoft-Internship-Cover-Letter-Local";

// TODO(backend wiring): replace with live data from getSettings() / jobs count.
const CURRENT_MODEL = "Llama 3.1 · 8B";
const LETTERS_COUNT = 3;

const svgBase = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function NavGlyph({ name }: { name: NavIcon }) {
  switch (name) {
    case "home":
      return (
        <svg width="17" height="17" viewBox="0 0 20 20" {...svgBase}>
          <path d="M3 9l7-5.5L17 9v8H12v-5H8v5H3z" />
        </svg>
      );
    case "profile":
      return (
        <svg width="17" height="17" viewBox="0 0 20 20" {...svgBase}>
          <circle cx="10" cy="7" r="3" />
          <path d="M4 17c0-3.2 3-5 6-5s6 1.8 6 5" />
        </svg>
      );
    case "letters":
      return (
        <svg width="17" height="17" viewBox="0 0 20 20" {...svgBase}>
          <rect x="3" y="5" width="14" height="10" rx="1.8" />
          <path d="M3.5 6l6.5 4.5L16.5 6" />
        </svg>
      );
    case "addcv":
      return (
        <svg width="17" height="17" viewBox="0 0 20 20" {...svgBase}>
          <path d="M5 3h6l4 4v10H5z" />
          <path d="M11 3v4h4" />
          <path d="M8.5 12.5h3M10 11v3" />
        </svg>
      );
    case "voice":
      return (
        <svg width="17" height="17" viewBox="0 0 20 20" {...svgBase}>
          <path d="M4 10h1.5M8 6v8M12 4v12M16 8v4" />
        </svg>
      );
    case "github":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
      );
  }
}

function NavRow({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.to === "/"} className="block outline-none">
      {({ isActive }) => (
        <span
          className={cn(
            "relative flex items-center gap-3 rounded-[9px] px-2.5 py-2 text-[13px] transition-colors",
            isActive ? "bg-accent-weak font-medium text-fg" : "text-fg-mid hover:bg-surface-2 hover:text-fg",
          )}
        >
          {isActive && (
            <span
              className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full"
              style={{ background: "var(--accent-grad)" }}
            />
          )}
          <span className={cn("grid shrink-0 place-items-center", isActive && "text-accent-text")}>
            <NavGlyph name={item.icon} />
          </span>
          <span className="flex-1 truncate">{item.label}</span>
          {item.count === "letters" && LETTERS_COUNT > 0 ? (
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-low">
              {LETTERS_COUNT}
            </span>
          ) : null}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { theme, toggle } = useTheme();

  return (
    <aside
      className="relative z-10 flex w-[258px] shrink-0 flex-col border-r border-border px-3.5 pb-4 pt-[18px]"
      style={{ background: "linear-gradient(180deg, rgba(150,190,230,.045), transparent 34%), var(--sidebar)" }}
    >
      {/* top glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[120px]"
        style={{ background: "var(--glow-1)", opacity: 0.16, filter: "blur(46px)" }}
      />

      {/* logo */}
      <div className="relative flex items-center gap-[11px] px-1.5">
        <img
          src="/favicon.svg"
          alt="Cover Letter Local"
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-[11px]"
          style={{ boxShadow: "0 6px 16px -8px var(--accent-shadow)" }}
        />
        <div className="min-w-0 leading-tight">
          <div className="text-[14px] font-bold tracking-[-0.2px] text-fg">Cover Letter Local</div>
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 py-[3px] pl-[7px] pr-[9px]">
            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="var(--accent-text)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="9" width="10" height="7" rx="1.5" />
              <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
            </svg>
            <span className="text-[9.5px] font-semibold tracking-[0.4px] text-accent-text">Private · on-device</span>
          </div>
        </div>
      </div>

      {/* primary CTA */}
      <NavLink
        to="/write"
        className="relative mt-4 flex items-center gap-2.5 overflow-hidden rounded-[12px] px-3 py-2.5 text-[13px] font-semibold text-on-accent outline-none"
        style={{ background: "var(--accent-grad)", boxShadow: "0 8px 22px -8px var(--accent-shadow)" }}
      >
        <span className="cll-sheen-el" />
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="relative shrink-0">
          <path d="M4 16l1-4 8.5-8.5 3 3L8 15l-4 1z" />
          <path d="M12 5l3 3" />
        </svg>
        <span className="relative flex-1 text-left">New Cover Letter</span>
      </NavLink>

      <div className="mx-1.5 mt-4 h-px bg-border" />

      {/* navigation */}
      <nav className="relative mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="Primary">
        <div className="flex flex-col gap-0.5">
          {MAIN_NAV.map((item) => (
            <NavRow key={item.to} item={item} />
          ))}
        </div>
        <div className="mx-1 my-3.5 h-px bg-border" />
        <div className="mb-2 px-[11px] text-[10px] font-semibold uppercase tracking-[0.09em] text-fg-low">Setup</div>
        <div className="flex flex-col gap-0.5">
          {SETUP_NAV.map((item) => (
            <NavRow key={item.to} item={item} />
          ))}
        </div>
      </nav>

      {/* footer */}
      <div className="relative mt-3 flex flex-col gap-2.5">
        {/* star on github */}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex items-center gap-[11px] overflow-hidden rounded-[13px] border border-border-strong px-3 py-[11px] no-underline transition hover:-translate-y-px hover:border-accent"
          style={{ background: "linear-gradient(135deg, var(--surface-2), var(--surface))" }}
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-border-strong bg-input text-fg">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1.5">
              <span className="text-[12.5px] font-semibold text-fg">Star on GitHub</span>
              <svg width="11" height="11" viewBox="0 0 20 20" fill="var(--warning)" stroke="var(--warning)" strokeWidth="1.4" strokeLinejoin="round">
                <path d="M10 3l2 4.5 5 .5-3.8 3.3 1.2 4.9L10 13.7 5.6 16.2l1.2-4.9L3 8l5-.5z" />
              </svg>
            </span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <rect x="0" y="0" width="4.4" height="4.4" fill="#F25022" />
                <rect x="5.6" y="0" width="4.4" height="4.4" fill="#7FBA00" />
                <rect x="0" y="5.6" width="4.4" height="4.4" fill="#00A4EF" />
                <rect x="5.6" y="5.6" width="4.4" height="4.4" fill="#FFB900" />
              </svg>
              <span className="text-[10px] text-fg-low">Microsoft internship · open source</span>
            </span>
          </span>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="relative shrink-0 text-fg-low transition group-hover:text-accent-text">
            <path d="M7 5h8v8M15 5l-9 9" />
          </svg>
        </a>

        {/* current model → settings */}
        <NavLink
          to="/settings"
          title="Change model in Settings"
          className="group relative flex items-center gap-[11px] overflow-hidden rounded-[13px] border border-border bg-surface px-3 py-[11px] outline-none transition hover:border-border-strong"
        >
          <span
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-border-strong bg-accent-weak text-accent-text"
            style={{ boxShadow: "0 0 14px -6px var(--accent-shadow)" }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2.5l6 2.5v4c0 3.6-2.5 6.4-6 7.5-3.5-1.1-6-3.9-6-7.5V5z" />
              <path d="M7.5 10l1.8 1.8L13 8" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[12.5px] font-semibold text-fg">{CURRENT_MODEL}</span>
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: "var(--success)", boxShadow: "0 0 8px var(--success)", animation: "cll-pulse 2.4s ease-in-out infinite" }}
              />
            </span>
            <span className="mt-0.5 block text-[10px] text-fg-low">Local model · nothing leaves your device</span>
          </span>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-fg-low">
            <path d="M8 5l4 5-4 5" />
          </svg>
        </NavLink>

        {/* settings row + theme toggle */}
        <div className="flex gap-2">
          <NavLink to="/settings" className="flex-1 outline-none">
            {({ isActive }) => (
              <span
                className={cn(
                  "flex items-center justify-center gap-2 rounded-[9px] px-3 py-2.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-accent-weak text-accent-text"
                    : "border border-border text-fg-mid hover:border-border-strong hover:text-fg",
                )}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M4 7h9M4 13h5" />
                  <circle cx="15" cy="7" r="2" />
                  <circle cx="11" cy="13" r="2" />
                </svg>
                Settings
              </span>
            )}
          </NavLink>
          <button
            type="button"
            onClick={toggle}
            title="Toggle theme"
            aria-label="Toggle theme"
            className="flex w-[42px] shrink-0 items-center justify-center rounded-[9px] border border-border text-fg-low transition-colors hover:border-border-strong hover:text-fg"
          >
            {theme === "dark" ? (
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 11a5 5 0 1 1-6-6 4 4 0 0 0 6 6z" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="10" r="3.5" />
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
