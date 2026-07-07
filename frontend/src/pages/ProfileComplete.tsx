import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  Award,
  BookOpen,
  Briefcase,
  CheckCircle2,
  FolderGit2,
  GraduationCap,
  Languages as LangIcon,
  Link2,
  Sparkles,
  User,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  GenerativeField,
  LanguagesCard,
  ProjectsCard,
  ScalarField,
  SkillsCard,
} from "@/components/profile/complete/Fields";
import { errorMessage } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { toast } from "@/store/toast";
import {
  applyCompletion,
  getCompletionPlan,
  suggestCompletion,
  type Answer,
  type ApplyPayload,
  type CompletionStep,
  type LangEntry,
  type RepoPick,
  type SkillEntry,
  type Suggestions,
} from "@/api/profileCompletion";

const SECTION_ICON: Record<string, LucideIcon> = {
  identity: User,
  skills: Wrench,
  languages: LangIcon,
  experiences: Briefcase,
  projects: FolderGit2,
  education: GraduationCap,
  certificates: Award,
  trainings: BookOpen,
  links: Link2,
};

const EMPTY_SUGGESTIONS: Suggestions = {
  identity: {},
  languages: [],
  skills_categories: {},
  skills_ratings: {},
  skills_new: [],
  items: {},
  drafts: {},
};

// Seed one collected answer per step from the AI suggestions.
function seedAnswers(steps: CompletionStep[], s: Suggestions): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const step of steps) {
    if (step.kind === "generative") {
      out[step.id] = { text: s.drafts[step.id] ?? "" };
    } else if (step.kind === "short_text" || step.kind === "enum" || step.kind === "date") {
      out[step.id] = step.section === "identity" && step.field ? s.identity[step.field] ?? "" : s.items[step.id] ?? "";
    } else if (step.kind === "languages") {
      const existing: LangEntry[] = (step.extra?.existing ?? []).map((e) => ({ id: e.id, name: e.name, proficiency: e.proficiency ?? null }));
      const have = new Set(existing.map((e) => e.name.toLowerCase()));
      const suggested = (s.languages ?? []).filter((l) => !have.has(l.name.toLowerCase())).map((l) => ({ name: l.name, proficiency: l.proficiency }));
      out[step.id] = [...existing, ...suggested];
    } else if (step.kind === "skills") {
      const existing: SkillEntry[] = (step.extra?.existing ?? []).map((x) => ({
        id: x.id,
        name: x.name,
        category: x.category ?? s.skills_categories[x.name] ?? null,
        self_rating: x.self_rating ?? s.skills_ratings[x.name] ?? null,
        isNew: false,
        include: true,
      }));
      const have = new Set(existing.map((x) => x.name.toLowerCase()));
      const fresh: SkillEntry[] = (s.skills_new ?? [])
        .filter((x) => !have.has(x.name.toLowerCase()))
        .map((x) => ({ name: x.name, category: x.category ?? null, self_rating: x.self_rating ?? 3, isNew: true, include: true }));
      out[step.id] = [...existing, ...fresh];
    } else if (step.kind === "projects_from_github") {
      out[step.id] = (step.extra?.repos ?? []).map((r) => ({
        github_repo_id: r.github_repo_id,
        name: r.name,
        description: r.purpose,
        technologies: r.technologies,
        url: r.url,
        picked: true,
      }));
    }
  }
  return out;
}

function isStepFilled(step: CompletionStep, a: Answer): boolean {
  if (a == null) return false;
  switch (step.kind) {
    case "generative":
      return Boolean((a as { text?: string }).text?.trim());
    case "languages":
      return (a as LangEntry[]).length > 0 && (a as LangEntry[]).every((e) => e.proficiency);
    case "skills": {
      const inc = (a as SkillEntry[]).filter((e) => e.include);
      return inc.length > 0 && inc.every((e) => e.category && e.self_rating);
    }
    case "projects_from_github":
      return (a as RepoPick[]).some((p) => p.picked);
    default:
      return Boolean(String(a).trim());
  }
}

function buildPayload(steps: CompletionStep[], answers: Record<string, Answer>): ApplyPayload {
  const profile: Record<string, string> = {};
  const item_updates: NonNullable<ApplyPayload["item_updates"]> = [];
  const languages_new: NonNullable<ApplyPayload["languages_new"]> = [];
  const skills_updates: NonNullable<ApplyPayload["skills_updates"]> = [];
  const skills_new: NonNullable<ApplyPayload["skills_new"]> = [];
  const new_projects: NonNullable<ApplyPayload["new_projects"]> = [];

  for (const step of steps) {
    const a = answers[step.id];
    if (a == null) continue;

    if (step.kind === "generative") {
      const text = ((a as { text?: string }).text ?? "").trim();
      if (!text) continue;
      if (step.table === "profile" && step.field) profile[step.field] = text;
      else if (step.table && step.entity_id != null && step.field) item_updates.push({ table: step.table, id: step.entity_id, field: step.field, value: text });
    } else if (step.kind === "short_text" || step.kind === "enum" || step.kind === "date") {
      const v = String(a ?? "").trim();
      if (!v) continue;
      if (step.section === "identity" && step.field) profile[step.field] = v;
      else if (step.table && step.entity_id != null && step.field) item_updates.push({ table: step.table, id: step.entity_id, field: step.field, value: v });
    } else if (step.kind === "languages") {
      for (const e of a as LangEntry[]) {
        if (e.id !== undefined) {
          if (e.proficiency) item_updates.push({ table: "languages", id: e.id, field: "proficiency", value: e.proficiency });
        } else {
          languages_new.push({ name: e.name, proficiency: e.proficiency });
        }
      }
    } else if (step.kind === "skills") {
      for (const e of a as SkillEntry[]) {
        if (!e.include) continue;
        if (e.isNew) skills_new.push({ name: e.name, category: e.category, self_rating: e.self_rating });
        else if (e.id !== undefined) skills_updates.push({ id: e.id, category: e.category, self_rating: e.self_rating });
      }
    } else if (step.kind === "projects_from_github") {
      for (const p of a as RepoPick[]) {
        if (p.picked) new_projects.push({ name: p.name, description: p.description, technologies: p.technologies, url: p.url, github_repo_id: p.github_repo_id });
      }
    }
  }

  const payload: ApplyPayload = {};
  if (Object.keys(profile).length) payload.profile = profile;
  if (item_updates.length) payload.item_updates = item_updates;
  if (languages_new.length) payload.languages_new = languages_new;
  if (skills_updates.length) payload.skills_updates = skills_updates;
  if (skills_new.length) payload.skills_new = skills_new;
  if (new_projects.length) payload.new_projects = new_projects;
  return payload;
}

function countChanges(p: ApplyPayload): number {
  return (
    Object.keys(p.profile ?? {}).length +
    (p.item_updates?.length ?? 0) +
    (p.languages_new?.length ?? 0) +
    (p.skills_updates?.length ?? 0) +
    (p.skills_new?.length ?? 0) +
    (p.new_projects?.length ?? 0)
  );
}

interface CardGroup {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  steps: CompletionStep[];
}

export function ProfileComplete() {
  const navigate = useNavigate();
  const plan = useAsync(getCompletionPlan, []);
  const steps = useMemo(() => plan.data?.steps ?? [], [plan.data]);

  const [phase, setPhase] = useState<"preparing" | "review">("preparing");
  const [suggestions, setSuggestions] = useState<Suggestions>(EMPTY_SUGGESTIONS);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [saving, setSaving] = useState(false);
  const ranRef = useRef(false);

  // On entry: one batch call drafts every free-text field and suggests every value.
  useEffect(() => {
    if (ranRef.current || !steps.length) return;
    ranRef.current = true;
    suggestCompletion(steps)
      .then((r) => {
        const s = r.ok && r.suggestions ? r.suggestions : EMPTY_SUGGESTIONS;
        if (!r.ok) toast.warning("AI suggestions unavailable", "You can still fill everything in by hand.");
        setSuggestions(s);
        setAnswers(seedAnswers(steps, s));
      })
      .catch((err) => {
        toast.warning("AI suggestions unavailable", errorMessage(err));
        setAnswers(seedAnswers(steps, EMPTY_SUGGESTIONS));
      })
      .finally(() => setPhase("review"));
  }, [steps]);

  const setAnswer = (id: string, value: Answer) => setAnswers((prev) => ({ ...prev, [id]: value }));

  const groups = useMemo<CardGroup[]>(() => {
    const out: CardGroup[] = [];
    const byKey = new Map<string, CardGroup>();
    for (const s of steps) {
      const icon = SECTION_ICON[s.section] ?? Sparkles;
      if (s.kind === "languages" || s.kind === "skills" || s.kind === "projects_from_github") {
        out.push({ key: s.id, icon, title: s.label, steps: [s] });
        continue;
      }
      const key = s.section === "identity" ? "identity" : `${s.table}.${s.entity_id}`;
      let g = byKey.get(key);
      if (!g) {
        g = {
          key,
          icon,
          title: s.section === "identity" ? "Identity" : s.context_label || s.section_label,
          subtitle: s.section === "identity" ? undefined : s.section_label,
          steps: [],
        };
        byKey.set(key, g);
        out.push(g);
      }
      g.steps.push(s);
    }
    return out;
  }, [steps]);

  const filled = steps.filter((s) => isStepFilled(s, answers[s.id])).length;

  async function save() {
    const payload = buildPayload(steps, answers);
    const n = countChanges(payload);
    if (n === 0) {
      toast.info("Nothing to save", "Fill in at least one field first.");
      return;
    }
    setSaving(true);
    try {
      await applyCompletion(payload);
      toast.success("Profile updated", `${n} field${n === 1 ? "" : "s"} saved.`);
      navigate("/profile");
    } catch (err) {
      toast.danger("Couldn't save", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function renderField(step: CompletionStep) {
    switch (step.kind) {
      case "generative":
        return (
          <GenerativeField
            step={step}
            suggested={suggestions.drafts[step.id] ?? ""}
            value={(answers[step.id] as { text?: string } | undefined)?.text ?? ""}
            onChange={(t) => setAnswer(step.id, { text: t })}
          />
        );
      case "languages":
        return <LanguagesCard step={step} value={(answers[step.id] as LangEntry[]) ?? []} onChange={(v) => setAnswer(step.id, v)} />;
      case "skills":
        return <SkillsCard value={(answers[step.id] as SkillEntry[]) ?? []} onChange={(v) => setAnswer(step.id, v)} />;
      case "projects_from_github":
        return <ProjectsCard value={(answers[step.id] as RepoPick[]) ?? []} onChange={(v) => setAnswer(step.id, v)} />;
      default: {
        const suggested = step.section === "identity" && step.field ? suggestions.identity[step.field] ?? "" : suggestions.items[step.id] ?? "";
        return <ScalarField step={step} suggested={suggested} value={(answers[step.id] as string) ?? ""} onChange={(v) => setAnswer(step.id, v)} />;
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-28">
      <div className="mb-6 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] text-accent-ink">
          <Sparkles size={16} /> Complete with AI
        </span>
        <button
          type="button"
          onClick={() => navigate("/profile")}
          aria-label="Close"
          className="grid h-9 w-9 place-items-center rounded-full text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
        >
          <X size={18} />
        </button>
      </div>

      <AsyncBoundary loading={plan.loading} error={plan.error} onRetry={plan.reload}>
        {steps.length === 0 ? (
          <Done navigate={navigate} />
        ) : phase === "preparing" ? (
          <Preparing count={steps.length} />
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-[24px] font-extrabold tracking-tight text-text">Review what the AI filled in</h1>
              <p className="mt-1.5 text-[14.5px] text-text-2">
                Everything empty is highlighted below with a draft from your CV & GitHub. Edit any of it directly — nothing saves until you do.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <Progress value={(filled / steps.length) * 100} aria-label="Filled" className="flex-1" />
                <span className="shrink-0 text-[12.5px] font-semibold text-text-2">
                  {filled} / {steps.length} filled
                </span>
              </div>
            </div>

            <div className="grid gap-4">
              {groups.map((g, i) => (
                <motion.section
                  key={g.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
                  className="rounded-[18px] border border-border bg-surface p-5 shadow-soft"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent-ink">
                      <g.icon size={19} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-[16.5px] font-bold text-text">{g.title}</h2>
                      {g.subtitle && <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-3">{g.subtitle}</p>}
                    </div>
                  </div>
                  <div className="grid gap-4">{g.steps.map((s) => <div key={s.id}>{renderField(s)}</div>)}</div>
                </motion.section>
              ))}
            </div>

            {/* Sticky save bar */}
            <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 rounded-[16px] border border-border bg-surface/95 px-5 py-3.5 shadow-elevated backdrop-blur">
              <span className="text-[13px] text-text-2">
                <strong className="text-text">{filled}</strong> of {steps.length} filled
              </span>
              <Button size="lg" onClick={save} loading={saving}>
                Save to profile
              </Button>
            </div>
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}

function Preparing({ count }: { count: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[20px] border border-border bg-surface p-10 text-center shadow-soft"
    >
      <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-accent-soft text-accent-ink">
        <Sparkles size={30} />
      </span>
      <h1 className="text-[24px] font-extrabold tracking-tight text-text">Reading your CV & GitHub…</h1>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-text-2">
        The AI is drafting answers for the <strong className="text-text">{count}</strong> empty field{count === 1 ? "" : "s"} in your profile. This takes a few seconds.
      </p>
      <div className="mt-6 flex justify-center">
        <Spinner size={26} />
      </div>
    </motion.div>
  );
}

function Done({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div className="rounded-[20px] border border-border bg-surface p-10 text-center shadow-soft">
      <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-good-soft text-good">
        <CheckCircle2 size={32} />
      </span>
      <h1 className="text-[24px] font-extrabold tracking-tight text-text">Your profile is complete</h1>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-text-2">
        There's nothing left for the AI to fill in. You can always edit any section by hand on the profile page.
      </p>
      <div className="mt-7">
        <Button size="lg" onClick={() => navigate("/profile")}>
          Back to profile
        </Button>
      </div>
    </div>
  );
}
