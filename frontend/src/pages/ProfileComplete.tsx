import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, X } from "lucide-react";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StepView, type Answer } from "@/components/profile/complete/StepView";
import type { LangEntry, RepoPick, SkillEntry } from "@/components/profile/complete/StepView";
import { errorMessage } from "@/api/client";
import { useAsync } from "@/lib/useAsync";
import { toast } from "@/store/toast";
import {
  applyCompletion,
  getCompletionPlan,
  suggestCompletion,
  type ApplyPayload,
  type CompletionStep,
  type Suggestions,
} from "@/api/profileCompletion";

const STRUCTURED = new Set(["short_text", "enum", "date", "languages", "skills"]);

// Build the apply payload from the collected answers.
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
      else if (step.table && step.entity_id != null && step.field)
        item_updates.push({ table: step.table, id: step.entity_id, field: step.field, value: text });
    } else if (step.kind === "short_text" || step.kind === "enum" || step.kind === "date") {
      const v = String(a ?? "").trim();
      if (!v) continue;
      if (step.section === "identity" && step.field) profile[step.field] = v;
      else if (step.table && step.entity_id != null && step.field)
        item_updates.push({ table: step.table, id: step.entity_id, field: step.field, value: v });
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
        if (p.picked)
          new_projects.push({
            name: p.name,
            description: p.description,
            technologies: p.technologies,
            url: p.url,
            github_repo_id: p.github_repo_id,
          });
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

export function ProfileComplete() {
  const navigate = useNavigate();
  const plan = useAsync(getCompletionPlan, []);
  const steps = plan.data?.steps ?? [];

  const [phase, setPhase] = useState<"intro" | "step" | "review">("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [sugLoading, setSugLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const suggestedRef = useRef(false);

  // One background call fills every short/enumerated suggestion at once.
  useEffect(() => {
    if (suggestedRef.current || !steps.length) return;
    const structured = steps.filter((s) => STRUCTURED.has(s.kind));
    if (!structured.length) return;
    suggestedRef.current = true;
    setSugLoading(true);
    suggestCompletion(structured)
      .then((r) => {
        if (r.ok && r.suggestions) setSuggestions(r.suggestions);
      })
      .catch(() => {
        /* suggestions are best-effort; the user can still type */
      })
      .finally(() => setSugLoading(false));
  }, [steps]);

  const sections = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of steps) map.set(s.section_label, (map.get(s.section_label) ?? 0) + 1);
    return [...map.entries()].map(([label, n]) => ({ label, n }));
  }, [steps]);

  const setAnswer = (id: string, value: Answer) => setAnswers((prev) => ({ ...prev, [id]: value }));

  const step = steps[index];
  const isLast = index === steps.length - 1;

  function next() {
    if (isLast) setPhase("review");
    else setIndex((i) => i + 1);
  }
  function back() {
    if (index === 0) setPhase("intro");
    else setIndex((i) => i - 1);
  }

  async function save() {
    const payload = buildPayload(steps, answers);
    if (countChanges(payload) === 0) {
      toast.info?.("Nothing to save", "You didn't fill anything in.");
      navigate("/profile");
      return;
    }
    setSaving(true);
    try {
      await applyCompletion(payload);
      toast.success("Profile updated", `${countChanges(payload)} field${countChanges(payload) === 1 ? "" : "s"} saved.`);
      navigate("/profile");
    } catch (err) {
      toast.danger("Couldn't save", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const pendingPayload = phase === "review" ? buildPayload(steps, answers) : null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Top bar */}
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
        ) : phase === "intro" ? (
          <Intro sections={sections} total={steps.length} onStart={() => setPhase("step")} onSkip={() => navigate("/profile")} />
        ) : phase === "step" && step ? (
          <>
            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between text-[12.5px] font-semibold text-text-2">
                <span>
                  Step {index + 1} of {steps.length}
                </span>
                <span>{step.section_label}</span>
              </div>
              <Progress value={((index + 1) / steps.length) * 100} aria-label="Progress" />
            </div>

            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 0.7, 0.2, 1] }}
              className="rounded-[18px] border border-border bg-surface p-6 shadow-soft"
            >
              <div className="mb-4">
                {step.context_label && (
                  <Badge tone="neutral" className="mb-2">
                    {step.context_label}
                  </Badge>
                )}
                <h2 className="text-[20px] font-extrabold tracking-tight text-text">{step.label}</h2>
              </div>
              <StepView
                step={step}
                suggestions={suggestions}
                suggestionsLoading={sugLoading}
                answer={answers[step.id]}
                onChange={(v) => setAnswer(step.id, v)}
              />
            </motion.div>

            <div className="mt-6 flex items-center justify-between">
              <Button variant="ghost" onClick={back}>
                <ArrowLeft size={16} /> Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={next}>
                  Skip
                </Button>
                <Button onClick={next}>
                  {isLast ? "Review" : "Continue"} <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Review payload={pendingPayload!} saving={saving} onSave={save} onBack={() => setPhase("step")} />
        )}
      </AsyncBoundary>
    </div>
  );
}

// ── Sub-screens ───────────────────────────────────────────────────

function Intro({
  sections,
  total,
  onStart,
  onSkip,
}: {
  sections: { label: string; n: number }[];
  total: number;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 0.7, 0.2, 1] }}
      className="rounded-[20px] border border-border bg-surface p-8 text-center shadow-soft"
    >
      <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-accent-soft text-accent-ink">
        <Sparkles size={30} />
      </span>
      <h1 className="text-[26px] font-extrabold tracking-tight text-text">Let's finish your profile</h1>
      <p className="mx-auto mt-2 max-w-lg text-[15px] leading-relaxed text-text-2">
        The AI reads your CV and GitHub work to suggest answers for the{" "}
        <strong className="text-text">{total}</strong> thing{total === 1 ? "" : "s"} that are still empty. You accept,
        tweak, or rewrite each one — nothing is saved until you say so.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {sections.map((s) => (
          <span key={s.label} className="rounded-full bg-surface-2 px-3.5 py-1.5 text-[13px] font-semibold text-text-2">
            {s.label} <span className="text-text-3">· {s.n}</span>
          </span>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-center gap-3">
        <Button variant="ghost" onClick={onSkip}>
          Maybe later
        </Button>
        <Button size="lg" onClick={onStart}>
          <Sparkles size={17} /> Start
        </Button>
      </div>
      <p className="mt-5 text-[12px] text-text-3">Runs through your selected model. Your data stays on your machine unless you chose a cloud provider.</p>
    </motion.div>
  );
}

function Review({ payload, saving, onSave, onBack }: { payload: ApplyPayload; saving: boolean; onSave: () => void; onBack: () => void }) {
  const rows = [
    { label: "Identity fields", n: Object.keys(payload.profile ?? {}).length },
    { label: "New languages", n: payload.languages_new?.length ?? 0 },
    { label: "Skills updated", n: payload.skills_updates?.length ?? 0 },
    { label: "New skills", n: payload.skills_new?.length ?? 0 },
    { label: "Item fields filled", n: payload.item_updates?.length ?? 0 },
    { label: "New projects", n: payload.new_projects?.length ?? 0 },
  ].filter((r) => r.n > 0);
  const total = countChanges(payload);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-[20px] border border-border bg-surface p-8 shadow-soft"
    >
      <h1 className="text-[24px] font-extrabold tracking-tight text-text">Ready to save</h1>
      <p className="mt-2 text-[15px] text-text-2">
        {total > 0 ? `${total} change${total === 1 ? "" : "s"} will be written to your profile.` : "You haven't filled anything in yet."}
      </p>

      {rows.length > 0 && (
        <div className="mt-5 grid gap-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between rounded-[12px] bg-surface-2 px-4 py-2.5">
              <span className="text-[14px] text-text-2">{r.label}</span>
              <Badge tone="accent">{r.n}</Badge>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </Button>
        <Button size="lg" onClick={onSave} loading={saving} disabled={total === 0}>
          {saving ? "Saving…" : "Save to profile"}
        </Button>
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
