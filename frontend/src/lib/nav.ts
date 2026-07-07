import {
  FileUp,
  Home,
  Building2,
  UserRound,
  Github,
  AudioLines,
  PenLine,
  LayoutGrid,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavGroup = "home" | "setup" | "create" | "system";

export type NavItem = {
  to: string;
  label: string;
  hint: string; // short description shown under the label
  icon: LucideIcon;
  group: NavGroup;
};

/**
 * Primary navigation, split into two clear stages:
 *  • Setup — one-time: add your CV, profile, GitHub, and writing voice.
 *  • Write & apply — the ongoing loop: research, generate, track applications.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home", hint: "Overview", icon: Home, group: "home" },

  { to: "/onboarding", label: "Import CV", hint: "Add your CV", icon: FileUp, group: "setup" },
  { to: "/profile", label: "Profile & Skills", hint: "Your details", icon: UserRound, group: "setup" },
  { to: "/github", label: "GitHub", hint: "Import projects", icon: Github, group: "setup" },
  { to: "/voice", label: "Writing Voice", hint: "Learn your style", icon: AudioLines, group: "setup" },

  { to: "/research", label: "Company Research", hint: "Research a role", icon: Building2, group: "create" },
  { to: "/write", label: "Write Cover Letter", hint: "Generate & design", icon: PenLine, group: "create" },
  { to: "/applications", label: "Applications", hint: "Track & revisit", icon: LayoutGrid, group: "create" },

  { to: "/settings", label: "Settings", hint: "Model & keys", icon: Settings, group: "system" },
];

export const GROUP_LABELS: Record<NavGroup, string> = {
  home: "",
  setup: "1 · Set up your profile",
  create: "2 · Write & apply",
  system: "",
};
