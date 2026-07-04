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

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Short mono caption shown under the section group. */
  group: "start" | "prepare" | "create" | "system";
};

/** Primary navigation — the whole product surface, grouped by workflow stage. */
export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Home", icon: Home, group: "start" },
  { to: "/onboarding", label: "Import CV", icon: FileUp, group: "start" },
  { to: "/profile", label: "Profile & Skills", icon: UserRound, group: "prepare" },
  { to: "/github", label: "GitHub", icon: Github, group: "prepare" },
  { to: "/voice", label: "Writing Voice", icon: AudioLines, group: "prepare" },
  { to: "/research", label: "Company Research", icon: Building2, group: "create" },
  { to: "/write", label: "Generate Letter", icon: PenLine, group: "create" },
  { to: "/applications", label: "Applications", icon: LayoutGrid, group: "create" },
  { to: "/settings", label: "Settings", icon: Settings, group: "system" },
];

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  start: "Get started",
  prepare: "Build your profile",
  create: "Apply",
  system: "System",
};
