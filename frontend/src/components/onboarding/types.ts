import { FileUp, Fingerprint, Github, PenLine, type LucideIcon } from "lucide-react";
import { getProfile } from "@/api/profile";
import { getStyle, listPastLetters } from "@/api/style";
import { listSavedRepos } from "@/api/githubRepos";
import { listJobs } from "@/api/jobs";
import type { GithubRepo, Job, PastCoverLetter } from "@/api/types";

/** The four setup stages, in order. GitHub + Style are optional (skippable). */
export type StepKey = "cv" | "github" | "voice" | "letter";

export interface StepMeta {
  key: StepKey;
  /** Short label for the step rail. */
  label: string;
  /** Big heading shown above the step body. */
  title: string;
  /** One-line description under the heading. */
  subtitle: string;
  icon: LucideIcon;
  /** Optional steps can be finished without doing anything. */
  optional?: boolean;
}

export const STEPS: StepMeta[] = [
  {
    key: "cv",
    label: "Your CV",
    title: "Import your CV",
    subtitle: "Upload a PDF, Word doc, or image — the AI structures it live, on your machine.",
    icon: FileUp,
  },
  {
    key: "github",
    label: "GitHub",
    title: "Connect GitHub",
    subtitle: "Pull in your best repositories so letters can speak to real projects.",
    icon: Github,
    optional: true,
  },
  {
    key: "voice",
    label: "Your voice",
    title: "Teach your writing style",
    subtitle: "Add a letter or two you're proud of — we learn how you write.",
    icon: Fingerprint,
    optional: true,
  },
  {
    key: "letter",
    label: "First letter",
    title: "Write your first letter",
    subtitle: "Generate a grounded, personalized cover letter — in your own voice.",
    icon: PenLine,
  },
];

/** localStorage flag: set once the user finishes (or skips) the wizard, so the
 *  app can decide whether to auto-open onboarding on launch. */
export const ONBOARDING_DONE_KEY = "cll:onboarding-complete";

export function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_DONE_KEY, "1");
  } catch {
    /* storage unavailable (private mode) — non-fatal */
  }
}

/** What we already have on file — used to pre-complete steps and prefill inputs. */
export interface Detected {
  cv: { name: string; filename: string | null; at: string | null } | null;
  repos: GithubRepo[];
  letters: PastCoverLetter[];
  styleLearned: boolean;
  jobs: Job[];
  githubUsername: string | null;
}

export const EMPTY_DETECTED: Detected = {
  cv: null,
  repos: [],
  letters: [],
  styleLearned: false,
  jobs: [],
  githubUsername: null,
};

/** A GitHub URL or handle → a bare username, best-effort. */
function usernameFromGithub(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  const match = trimmed.match(/github\.com\/([^/]+)/i);
  if (match) return match[1];
  return trimmed.replace(/^@/, "").split("/").pop() ?? null;
}

/**
 * Inspect existing profile data so a returning user resumes where they left off.
 * Every call is independent — a failure (e.g. backend offline) never blocks the
 * wizard; that step just shows as not-yet-done.
 */
export async function detectProgress(): Promise<Detected> {
  const [profileR, reposR, styleR, lettersR, jobsR] = await Promise.allSettled([
    getProfile(),
    listSavedRepos(),
    getStyle(),
    listPastLetters(),
    listJobs(),
  ]);

  const profile = profileR.status === "fulfilled" ? profileR.value : null;
  const cvSource = profile
    ? Object.values(profile.field_sources ?? {}).find((s) => s?.source === "cv")
    : undefined;

  return {
    cv: cvSource
      ? {
          name: [profile?.name, profile?.surname].filter(Boolean).join(" ") || "Your profile",
          filename: cvSource.detail ?? null,
          at: cvSource.at ?? null,
        }
      : null,
    repos: reposR.status === "fulfilled" ? reposR.value : [],
    letters: lettersR.status === "fulfilled" ? lettersR.value : [],
    styleLearned:
      styleR.status === "fulfilled" && Boolean(styleR.value.style_profile?.enough_signal !== false && styleR.value.style_profile),
    jobs:
      jobsR.status === "fulfilled"
        ? jobsR.value.filter((j) => (j.letter?.text ?? "").trim().length > 0)
        : [],
    githubUsername: usernameFromGithub(profile?.github),
  };
}

/** Which steps are already satisfied by existing data. */
export function completedFromDetected(d: Detected): Set<StepKey> {
  const done = new Set<StepKey>();
  if (d.cv) done.add("cv");
  if (d.repos.length > 0) done.add("github");
  if (d.letters.length > 0) done.add("voice");
  if (d.jobs.length > 0) done.add("letter");
  return done;
}

export interface StepProps {
  detected: Detected;
  /** Whether this step counts as complete (detected or finished this session). */
  done: boolean;
  /** Mark the step complete. The letter step passes the saved job id. */
  onDone: (payload?: { jobId?: number }) => void;
}
