import { useEffect, useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, FileText, Loader2, PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/feedback";
import type { CVExtraction, Profile } from "@/api/types";
import { JsonConsole } from "./JsonConsole";
import {
  DetailsEditor,
  SkillsEditor,
  ExperienceEditor,
  EducationEditor,
  ProjectsEditor,
  CertificatesEditor,
  TrainingEditor,
  LanguagesEditor,
  LinksEditor,
  type Item,
} from "./SectionEditors";

type SaveMode = "replace" | "merge";
type SectionKey = Exclude<keyof CVExtraction, "profile">;

const SECTIONS: { key: SectionKey; core?: boolean; Editor: ComponentType<{ items: Item[]; disabled?: boolean; onChange: (items: Item[]) => void }> }[] = [
  { key: "skills", core: true, Editor: SkillsEditor },
  { key: "experiences", core: true, Editor: ExperienceEditor },
  { key: "education", core: true, Editor: EducationEditor },
  { key: "projects", Editor: ProjectsEditor },
  { key: "certificates", Editor: CertificatesEditor },
  { key: "trainings", Editor: TrainingEditor },
  { key: "languages", Editor: LanguagesEditor },
  { key: "links", Editor: LinksEditor },
];

const enterCard = {
  initial: { opacity: 0, y: 14, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.12 } },
  transition: { type: "spring" as const, stiffness: 420, damping: 32 },
};

function totalCount(ex: CVExtraction): number {
  return SECTIONS.reduce((n, s) => n + (ex[s.key] as unknown[]).length, 0);
}

export function ReviewScreen({
  draft,
  streamText,
  file,
  filename,
  parsing,
  durationS,
  error,
  mode,
  saving,
  onModeChange,
  onEdit,
  onReset,
  onSave,
}: {
  draft: CVExtraction;
  streamText: string;
  file: File | null;
  filename: string | null;
  parsing: boolean;
  durationS: number | null;
  error: string | null;
  mode: SaveMode;
  saving: boolean;
  onModeChange: (m: SaveMode) => void;
  onEdit: (next: CVExtraction) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const [showJson, setShowJson] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!parsing) {
      setElapsed(0);
      return;
    }
    const id = window.setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => window.clearInterval(id);
  }, [parsing]);

  const editProfile = (patch: Partial<Profile>) => onEdit({ ...draft, profile: { ...draft.profile, ...patch } });
  const editSection = (key: SectionKey, items: Item[]) => onEdit({ ...draft, [key]: items } as unknown as CVExtraction);

  const hasProfile = Boolean(draft.profile.name || draft.profile.email || draft.profile.summary);
  const count = totalCount(draft);
  const has = count > 0 || hasProfile;
  const analyzing = parsing && !has;

  if (error) {
    return (
      <div className="mx-auto my-auto max-w-[520px]">
        <div className="cll-fade rounded-[14px] border border-danger-weak bg-surface p-6 text-center">
          <div className="mx-auto mb-3.5 flex h-11 w-11 items-center justify-center rounded-[12px] bg-danger-weak">
            <AlertTriangle size={20} className="text-danger" aria-hidden="true" />
          </div>
          <div className="text-[15px] font-semibold text-fg">We couldn't read that file</div>
          <div className="mx-auto mt-2 max-w-[460px] text-[12.5px] leading-[1.55] text-fg-mid">{error}</div>
          <Button variant="primary" className="mt-[18px]" onClick={onReset}>
            Try another file
          </Button>
        </div>
      </div>
    );
  }

  const statusTime = parsing ? elapsed.toFixed(1) : durationS != null ? durationS.toFixed(1) : "0.0";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-6 py-5">
      {/* TOP — file/status toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-3">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-weak">
          <FileText size={16} className="text-accent-text" aria-hidden="true" />
          {parsing ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent" style={{ animation: "cll-pulse 1.3s ease-in-out infinite" }} /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-fg">{filename ?? file?.name ?? "Your CV"}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px]">
            {parsing ? (
              <>
                <Loader2 size={12} className="animate-spin text-accent-text" aria-hidden="true" />
                <span className="text-fg-mid">Analyzing… turning your CV into an editable profile · {elapsed.toFixed(1)}s</span>
              </>
            ) : (
              <>
                <Check size={12} className="text-success" aria-hidden="true" />
                <span className="text-fg-mid">Extracted{durationS != null ? ` in ${durationS.toFixed(1)}s` : ""} · every field is editable</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          className="hidden items-center gap-1.5 rounded-[9px] border border-border-strong px-3 py-1.5 text-[12px] font-semibold text-fg-mid transition-colors hover:border-accent hover:text-fg lg:inline-flex"
        >
          {showJson ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          {showJson ? "Hide JSON" : "Show JSON"}
        </button>
      </div>

      {/* MIDDLE — two panes that fill the remaining height, each scrolls on its own */}
      <div className={`grid min-h-0 flex-1 gap-4 ${showJson ? "lg:grid-cols-[1fr_minmax(320px,400px)]" : ""}`}>
        {/* LEFT — details + sections */}
        <div className={`min-h-0 overflow-y-auto pr-0.5 ${saving ? "pointer-events-none opacity-70" : ""}`}>
          <div className="flex flex-col gap-4 pb-1">
            <CountRow draft={draft} />

            {analyzing ? (
              <AnalyzingState />
            ) : (
              <AnimatePresence initial={false}>
                {hasProfile || !parsing ? (
                  <motion.div key="details" layout {...enterCard}>
                    <DetailsEditor profile={draft.profile} disabled={saving} onChange={editProfile} />
                  </motion.div>
                ) : null}

                {SECTIONS.map(({ key, core, Editor }) => {
                  const items = draft[key] as unknown as Item[];
                  if (items.length === 0 && !(core && !parsing)) return null;
                  return (
                    <motion.div key={key} layout {...enterCard}>
                      <Editor items={items} disabled={saving} onChange={(next) => editSection(key, next)} />
                    </motion.div>
                  );
                })}

                {parsing ? (
                  <div key="more" className="flex items-center justify-center gap-2 rounded-[12px] border border-dashed border-border-strong bg-input py-6 text-[12px] text-fg-mid">
                    <Sparkles size={13} className="text-accent-text" /> Still reading — more fields incoming…
                  </div>
                ) : null}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* RIGHT — live JSON console (desktop) */}
        {showJson ? (
          <div className="hidden min-h-0 lg:flex">
            <JsonConsole text={streamText} parsing={parsing} statusTime={statusTime} />
          </div>
        ) : null}
      </div>

      {/* BOTTOM — pinned action bar */}
      <div className="shrink-0 rounded-[12px] border border-border bg-surface p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold tracking-[0.01em] text-fg-low">Saving mode</div>
            <div className="mt-0.5 text-[12px] leading-[1.45] text-fg-mid">
              {mode === "replace" ? "Replace your profile with this CV." : "Compare with your profile and review each change before saving."}
            </div>
          </div>
          <Segmented
            className="w-full shrink-0 sm:w-[210px]"
            options={[
              { value: "replace", label: "Replace" },
              { value: "merge", label: "Merge" },
            ]}
            value={mode}
            onChange={onModeChange}
          />
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onReset}
              disabled={saving}
              className="rounded-[10px] border border-border-strong bg-transparent px-4 py-[10px] text-[13px] text-fg-mid transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
            >
              {parsing ? "Cancel" : "Try another file"}
            </button>
            <Button variant="primary" onClick={onSave} loading={saving} disabled={saving || parsing || !has}>
              {saving ? "Working…" : mode === "merge" ? "Review changes" : "Save & finish"}
              {!saving ? <Check size={15} /> : null}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CountRow({ draft }: { draft: CVExtraction }) {
  const stats = [
    { label: "roles", n: draft.experiences.length },
    { label: "skills", n: draft.skills.length },
    { label: "projects", n: draft.projects.length },
    { label: "degrees", n: draft.education.length },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5 rounded-[9px] border border-border bg-surface px-2.5 py-1.5 text-[12px] text-fg-mid">
          <motion.b
            key={s.n}
            initial={{ scale: 1.35, color: "var(--accent-text)" }}
            animate={{ scale: 1, color: "var(--fg)" }}
            transition={{ type: "spring", stiffness: 500, damping: 24 }}
            className="font-bold tabular-nums"
          >
            {s.n}
          </motion.b>
          {s.label}
        </div>
      ))}
    </div>
  );
}

/* Task 5 — polished pre-stream analyzing state (before the first fields land). */
function AnalyzingState() {
  return (
    <div className="cll-fade flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface p-4">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]" style={{ background: "var(--accent-grad)", boxShadow: "0 12px 30px -10px var(--accent-shadow)" }}>
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5], scale: [0.96, 1, 0.96] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-[13px]"
            style={{ boxShadow: "0 0 0 2px var(--accent-weak)" }}
          />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 4h7l4 4v12H7z" />
            <path d="M14 4v4h4" />
            <path d="M9.5 13h5M9.5 16h3" />
          </svg>
        </div>
        <div>
          <div className="text-[13px] font-semibold text-fg">Reading your CV on-device…</div>
          <div className="mt-0.5 text-[11.5px] text-fg-mid">Structuring it into an editable profile. This starts in a moment.</div>
        </div>
      </div>
      {[0, 1, 2].map((c) => (
        <div key={c} className="rounded-[12px] border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-[7px]" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: c === 0 ? 3 : 2 }).map((_, r) => (
              <div key={r} className="grid grid-cols-1 gap-2.5 rounded-[10px] border border-border bg-input p-3 sm:grid-cols-2">
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
