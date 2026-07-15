/**
 * Primary navigation for the app shell, matching the Claude Design layout:
 *  • a prominent "New Cover Letter" CTA (→ /write)
 *  • a main group: Home · Profile & Skills · Cover Letters
 *  • a "Setup" group: Add CV · Writing Voice · GitHub Import
 *
 * Company Research is reached contextually from the writing flow, and
 * Settings + theme live in the sidebar footer — so neither is a nav row.
 * Icons are rendered in the Sidebar (keyed by `icon`) to stay faithful to
 * the design's custom glyphs.
 */
export type NavIcon = "home" | "profile" | "letters" | "addcv" | "voice" | "github";

export type NavItem = {
  to: string;
  label: string;
  icon: NavIcon;
  /** optional key for a trailing count badge (resolved in the Sidebar) */
  count?: "letters";
};

export const MAIN_NAV: NavItem[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/profile", label: "Profile & Skills", icon: "profile" },
  { to: "/cover-letters", label: "Cover Letters", icon: "letters", count: "letters" },
];

export const SETUP_NAV: NavItem[] = [
  { to: "/onboarding", label: "Add CV", icon: "addcv" },
  { to: "/voice", label: "Writing Voice", icon: "voice" },
  { to: "/github", label: "GitHub Import", icon: "github" },
];
