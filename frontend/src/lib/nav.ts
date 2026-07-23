import {
  FileUp,
  Home,
  Building2,
  UserRound,
  Github,
  Linkedin,
  Fingerprint,
  PenLine,
  LayoutGrid,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavGroup = "home" | "setup" | "create";

export type NavItem = {
  to: string;
  label: string;
  hint: string; // short description shown under the label
  icon: LucideIcon;
  group: NavGroup;
};

/**
 * Primary navigation, split into two clear stages:
 *  • Setup — one-time: add your CV, profile, GitHub, and writing style.
 *  • Write & apply — the ongoing loop: research, generate, track applications.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home", hint: "Overview", icon: Home, group: "home" },
  { to: "/responsible-ai", label: "Responsible AI", hint: "Our principles", icon: ShieldCheck, group: "home" },

  { to: "/onboarding", label: "CV", hint: "Your CV", icon: FileUp, group: "setup" },
  { to: "/profile", label: "Profile & Skills", hint: "Your details", icon: UserRound, group: "setup" },
  { to: "/github", label: "GitHub", hint: "Import projects", icon: Github, group: "setup" },
  { to: "/linkedin", label: "LinkedIn", hint: "Import profile", icon: Linkedin, group: "setup" },
  { to: "/voice", label: "Writing Style", hint: "Learn how you write", icon: Fingerprint, group: "setup" },

  { to: "/research", label: "Company Research", hint: "Research a role", icon: Building2, group: "create" },
  { to: "/write", label: "Write Cover Letter", hint: "Generate & edit", icon: PenLine, group: "create" },
  { to: "/cover-letters", label: "Cover Letters", hint: "Drafts & completed", icon: LayoutGrid, group: "create" },
];

export const GROUP_LABELS: Record<NavGroup, string> = {
  home: "",
  setup: "1 · Set up your profile",
  create: "2 · Write & apply",
};
