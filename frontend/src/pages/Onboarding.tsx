import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Award,
  Braces,
  Check,
  FileText,
  FolderGit2,
  GraduationCap,
  Languages as LanguagesIcon,
  Link2,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Sparkles,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Stepper } from "@/components/ui/data";
import { Pill } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { streamImportCv, saveExtraction, type CvImportEvent } from "@/api/cv";
import { getSettings } from "@/api/settings";
import { getProfile } from "@/api/profile";
import { errorMessage } from "@/api/client";
import { planReconcile, type ReconcilePlan } from "@/api/reconcile";
import { ReconcileReview } from "@/components/common/ReconcileReview";
import type { CVExtraction, Profile } from "@/api/types";
import { toast } from "@/store/toast";

/* ── State model ─────────────────────────────────────────────────
   Add CV is a three-step flow: upload -> review (the model streams; the raw JSON
   flows on the right while, on the left, each field turns into an editable card
   the moment it's parsed) -> done. Parse and review are one live screen. */
type OnbState = "upload" | "review" | "ready";
type SaveMode = "replace" | "merge";

const RAIL_STEPS = [{ label: "Upload" }, { label: "Review" }, { label: "Done" }];
const STEP_INDEX: Record<OnbState, number> = { upload: 0, review: 1, ready: 2 };

const DOC_ACCEPT = ".pdf,.doc,.docx,.txt";
const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.tiff,.bmp";
const IMAGE_RE = /\.(png|jpe?g|webp|tiff?|bmp|heic|gif)$/i;

interface ImportMeta {
  filename: string;
  source_type: string;
  num_pages: number;
  char_count: number;
}

const EMPTY: CVExtraction = {
  profile: {},
  skills: [],
  experiences: [],
  education: [],
  projects: [],
  certificates: [],
  trainings: [],
  languages: [],
  links: [],
};

/* ── Page ────────────────────────────────────────────────────────── */
export function Onboarding() {
  const [state, setState] = useState<OnbState>("upload");
  const [ocrEnabled, setOcrEnabled] = useState<boolean | null>(null);
  const [existing, setExisting] = useState<{ filename: string | null; at: string | null } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<ImportMeta | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [durationS, setDurationS] = useState<number | null>(null);

  // The live raw JSON (right pane) and the editable working copy (left pane).
  const [streamText, setStreamText] = useState("");
  const [draft, setDraft] = useState<CVExtraction>(EMPTY);
  const dirtyRef = useRef(false);
  const accRef = useRef("");

  const [saveMode, setSaveMode] = useState<SaveMode>("replace");
  const [plan, setPlan] = useState<ReconcilePlan | null>(null);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((s) => alive && setOcrEnabled(Boolean(s.ocr_enabled)))
      .catch(() => alive && setOcrEnabled(null));
    getProfile()
      .then((p) => {
        const src = Object.values(p.field_sources ?? {}).find((f) => f?.source === "cv");
        if (alive && src) setExisting({ filename: src.detail ?? null, at: src.at ?? null });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  // While streaming, a few times a second: push the raw text to the JSON pane and
  // re-parse the partial JSON so the left cards fill in -- every couple of items,
  // not only when the whole document is valid.
  useEffect(() => {
    if (!parsing) return;
    const id = window.setInterval(() => {
      setStreamText(accRef.current);
      if (dirtyRef.current) return; // user took over -- don't clobber their edits
      const parsed = parsePartial(accRef.current);
      if (parsed) setDraft(toExtraction(parsed));
    }, 110);
    return () => window.clearInterval(id);
  }, [parsing]);

  const onEvent = useCallback((event: CvImportEvent) => {
    switch (event.type) {
      case "meta":
        setMeta({
          filename: event.filename,
          source_type: event.source_type,
          num_pages: event.num_pages,
          char_count: event.char_count,
        });
        break;
      case "token":
        accRef.current += event.text;
        break;
      case "done":
        setParsing(false);
        setStreamText(accRef.current);
        setDurationS(event.duration_s);
        if (event.ok && event.structured) {
          if (!dirtyRef.current) setDraft(withArrays(event.structured));
        } else {
          const msg = event.error ?? "The model couldn't structure this CV.";
          setParseError(msg);
          toast.danger("Couldn't read that CV", msg);
        }
        break;
      case "fatal":
        setParsing(false);
        setParseError(event.error);
        toast.danger("Import failed", event.error);
        break;
    }
  }, []);

  const startStream = useCallback(
    (f: File) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      dirtyRef.current = false;
      accRef.current = "";
      setFile(f);
      setMeta(null);
      setDraft(EMPTY);
      setStreamText("");
      setDurationS(null);
      setParseError(null);
      setParsing(true);
      setState("review");

      streamImportCv(f, onEvent, ctrl.signal).catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const msg = errorMessage(err);
        setParsing(false);
        setParseError(msg);
        toast.danger("Couldn't parse that file", msg);
      });
    },
    [onEvent],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dirtyRef.current = false;
    accRef.current = "";
    setFile(null);
    setMeta(null);
    setDraft(EMPTY);
    setStreamText("");
    setParseError(null);
    setParsing(false);
    setDurationS(null);
    setState("upload");
  }, []);

  const edit = useCallback((next: CVExtraction) => {
    dirtyRef.current = true;
    setDraft(next);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (saveMode === "merge") {
        // Smart merge: compare with the saved profile and let the user resolve
        // conflicts (never blindly overwrite). Opens the reconcile review below.
        setPlan(await planReconcile(draft));
        return;
      }
      const res = await saveExtraction(draft, true, meta?.filename);
      const total = Object.values(res.saved).reduce((a, b) => a + b, 0);
      toast.success("Saved to profile", `Replaced your profile with ${total} item${total === 1 ? "" : "s"}.`);
      setState("ready");
    } catch (err) {
      toast.danger("Couldn't save", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [draft, saveMode, meta]);

  return (
    <Page
      eyebrow="Setup / Add CV"
      title="Add your CV"
      actions={
        <Link
          to="/"
          className="rounded-[9px] border border-border-strong bg-transparent px-4 py-[9px] text-[13px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
        >
          Skip for now
        </Link>
      }
      bodyClassName="px-7 py-7"
    >
      <div className={`mx-auto flex w-full flex-col ${state === "review" ? "max-w-[1160px]" : "max-w-[880px]"}`}>
        <Stepper steps={RAIL_STEPS} current={STEP_INDEX[state]} className="mb-7" />

        {state === "upload" ? (
          <UploadState onChoose={startStream} ocrEnabled={ocrEnabled} existing={existing} />
        ) : null}

        {state === "review" && plan ? (
          <div className="mx-auto w-full max-w-[760px]">
            <ReconcileReview
              plan={plan}
              source="cv"
              sourceDetail={meta?.filename}
              onApplied={() => {
                setPlan(null);
                setState("ready");
              }}
              onDiscard={() => setPlan(null)}
            />
          </div>
        ) : state === "review" ? (
          <ReviewState
            draft={draft}
            streamText={streamText}
            file={file}
            meta={meta}
            parsing={parsing}
            durationS={durationS}
            error={parseError}
            mode={saveMode}
            saving={saving}
            onModeChange={setSaveMode}
            onEdit={edit}
            onReset={reset}
            onSave={handleSave}
          />
        ) : null}

        {state === "ready" ? <ReadyState draft={draft} mode={saveMode} /> : null}
      </div>
    </Page>
  );
}

/* ── Incremental JSON ────────────────────────────────────────────
   Balance the open brackets/strings of the longest parseable prefix and JSON.parse
   that, so sections render before the whole document is valid. */
function closeAndParse(prefix: string): unknown {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      if (!stack.length) return undefined;
      stack.pop();
    }
  }
  let out = prefix;
  if (inStr) out += '"';
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  try {
    return JSON.parse(out);
  } catch {
    return undefined;
  }
}

function parsePartial(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  const s = raw.slice(start);
  const floor = Math.max(1, s.length - 600);
  for (let end = s.length; end >= floor; end--) {
    const v = closeAndParse(s.slice(0, end));
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return null;
}

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    : [];
}

function toExtraction(o: Record<string, unknown>): CVExtraction {
  const profile = o.profile && typeof o.profile === "object" && !Array.isArray(o.profile) ? (o.profile as unknown as Profile) : {};
  return {
    profile,
    skills: objectArray(o.skills) as unknown as CVExtraction["skills"],
    experiences: objectArray(o.experiences) as unknown as CVExtraction["experiences"],
    education: objectArray(o.education) as unknown as CVExtraction["education"],
    projects: objectArray(o.projects) as unknown as CVExtraction["projects"],
    certificates: objectArray(o.certificates) as unknown as CVExtraction["certificates"],
    trainings: objectArray(o.trainings) as unknown as CVExtraction["trainings"],
    languages: objectArray(o.languages) as unknown as CVExtraction["languages"],
    links: objectArray(o.links) as unknown as CVExtraction["links"],
  };
}

function withArrays(ex: CVExtraction): CVExtraction {
  return { ...EMPTY, ...ex, profile: ex.profile ?? {} };
}

function friendlyDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/* ── State 1 · Upload ────────────────────────────────────────────── */
function UploadState({
  onChoose,
  ocrEnabled,
  existing,
}: {
  onChoose: (file: File) => void;
  ocrEnabled: boolean | null;
  existing: { filename: string | null; at: string | null } | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const ocrOff = ocrEnabled === false;
  const accept = ocrOff ? DOC_ACCEPT : `${DOC_ACCEPT},${IMAGE_ACCEPT}`;

  const pick = useCallback(
    (f: File | undefined | null) => {
      if (!f) return;
      if (ocrOff && IMAGE_RE.test(f.name)) {
        toast.warning("Image files need OCR", "Turn on OCR in Settings to read scanned images, or upload a PDF/DOCX/TXT.");
        return;
      }
      onChoose(f);
    },
    [ocrOff, onChoose],
  );

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    pick(e.target.files?.[0]);
    e.target.value = "";
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const f = Array.from(e.clipboardData.files)[0];
    if (f) {
      e.preventDefault();
      pick(f);
    }
  };

  return (
    <div className="cll-fade flex flex-col items-center">
      {existing ? (
        <div className="mb-5 flex w-full max-w-[560px] items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-weak">
            <FileText size={16} className="text-accent-text" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] font-semibold text-fg">{existing.filename || "Imported CV"}</span>
              <Pill tone="success">On file</Pill>
            </div>
            <div className="mt-0.5 text-[11.5px] text-fg-mid">
              {existing.at ? `Imported ${friendlyDate(existing.at)} · ` : ""}in your profile
            </div>
          </div>
          <Link
            to="/profile"
            className="shrink-0 rounded-[9px] border border-border-strong px-3 py-1.5 text-[12px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
          >
            View
          </Link>
        </div>
      ) : null}

      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onInputChange} />
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        className={`flex w-full max-w-[560px] cursor-pointer flex-col items-center rounded-[18px] border-[1.5px] border-dashed px-8 py-10 text-center transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent ${
          dragging ? "-translate-y-0.5 border-accent" : "border-border-strong"
        }`}
        style={{
          background: "radial-gradient(130% 120% at 50% -10%, var(--accent-weak), transparent 58%), var(--input)",
        }}
      >
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-[16px]"
          style={{ background: "var(--accent-grad)", boxShadow: "0 14px 32px -8px var(--accent-shadow)" }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 4h7l4 4v12H7z" />
            <path d="M14 4v4h4" />
            <path d="M12 11v6M9 14l3-3 3 3" />
          </svg>
        </div>
        <div className="text-[17px] font-bold tracking-[-0.3px] text-fg">
          {dragging ? "Drop it here" : existing ? "Add a new CV" : "Drop your CV here"}
        </div>
        <div className="mt-1.5 text-[12.5px] text-fg-mid">Drag &amp; drop, paste, or</div>
        <Button
          variant="primary"
          size="lg"
          className="mt-3 rounded-[11px]"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          Choose file
        </Button>
        <div className="mt-4 font-mono text-[10.5px] text-fg-low">
          {ocrOff ? "PDF · DOCX · TXT" : "PDF · DOCX · TXT · images"} · read on-device, nothing uploaded
        </div>
      </div>

      {ocrOff ? (
        <div className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-fg-mid">
          <AlertTriangle size={13} className="text-warning" aria-hidden="true" />
          <span>
            Scanned images are off —{" "}
            <Link to="/settings" className="text-accent-text underline-offset-2 hover:underline">
              enable OCR in Settings
            </Link>
            .
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* ── State 2 · Review (live, two-pane) ───────────────────────────── */
type ItemField = { key: string; placeholder: string; wide?: boolean; textarea?: boolean };
type SectionSpec = {
  key: Exclude<keyof CVExtraction, "profile">;
  title: string;
  singular: string;
  icon: LucideIcon;
  core?: boolean;
  fields: ItemField[];
};

const SECTIONS: SectionSpec[] = [
  { key: "skills", title: "Skills", singular: "skill", icon: Wrench, core: true, fields: [{ key: "name", placeholder: "Skill" }, { key: "category", placeholder: "Category" }] },
  {
    key: "experiences",
    title: "Experience",
    singular: "role",
    icon: FileText,
    core: true,
    fields: [
      { key: "title", placeholder: "Title" },
      { key: "company", placeholder: "Company" },
      { key: "start_date", placeholder: "Start" },
      { key: "end_date", placeholder: "End" },
      { key: "description", placeholder: "What you did", wide: true, textarea: true },
    ],
  },
  {
    key: "education",
    title: "Education",
    singular: "entry",
    icon: GraduationCap,
    core: true,
    fields: [
      { key: "institution", placeholder: "Institution" },
      { key: "degree", placeholder: "Degree" },
      { key: "field", placeholder: "Field" },
      { key: "start_date", placeholder: "Start" },
      { key: "end_date", placeholder: "End" },
    ],
  },
  {
    key: "projects",
    title: "Projects",
    singular: "project",
    icon: FolderGit2,
    fields: [
      { key: "name", placeholder: "Name" },
      { key: "role", placeholder: "Role" },
      { key: "description", placeholder: "Description", wide: true, textarea: true },
    ],
  },
  { key: "certificates", title: "Certificates", singular: "certificate", icon: Award, fields: [{ key: "name", placeholder: "Name" }, { key: "issuer", placeholder: "Issuer" }] },
  { key: "trainings", title: "Training", singular: "training", icon: Award, fields: [{ key: "name", placeholder: "Name" }, { key: "provider", placeholder: "Provider" }] },
  { key: "languages", title: "Languages", singular: "language", icon: LanguagesIcon, fields: [{ key: "name", placeholder: "Language" }, { key: "proficiency", placeholder: "Level" }] },
  { key: "links", title: "Links", singular: "link", icon: Link2, fields: [{ key: "label", placeholder: "Label" }, { key: "url", placeholder: "https://" }] },
];

const PROFILE_FIELDS: { key: keyof Profile; label: string; placeholder: string; type?: string; wide?: boolean; textarea?: boolean }[] = [
  { key: "name", label: "First name", placeholder: "Jane" },
  { key: "surname", label: "Last name", placeholder: "Doe" },
  { key: "email", label: "Email", placeholder: "jane@example.com", type: "email" },
  { key: "phone", label: "Phone", placeholder: "+1 555 0100", type: "tel" },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/jane" },
  { key: "github", label: "GitHub", placeholder: "github.com/jane" },
  { key: "summary", label: "Summary", placeholder: "A short professional summary…", wide: true, textarea: true },
];

function totalCount(ex: CVExtraction): number {
  return SECTIONS.reduce((n, s) => n + ex[s.key].length, 0) + (ex.profile.name || ex.profile.email ? 1 : 0);
}

const enterCard = {
  initial: { opacity: 0, y: 14, scale: 0.97, boxShadow: "0 0 0 2px var(--accent-weak)" },
  animate: { opacity: 1, y: 0, scale: 1, boxShadow: "0 0 0 0px transparent" },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.12 } },
  transition: { type: "spring" as const, stiffness: 420, damping: 32 },
};

function ReviewState({
  draft,
  streamText,
  file,
  meta,
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
  meta: ImportMeta | null;
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
  const editSection = (key: SectionSpec["key"], items: Record<string, unknown>[]) =>
    onEdit({ ...draft, [key]: items } as unknown as CVExtraction);

  const has = totalCount(draft) > 0;
  const hasProfile = Boolean(draft.profile.name || draft.profile.email || draft.profile.summary);

  if (error) {
    return (
      <div className="cll-fade rounded-[12px] border border-danger-weak bg-surface p-6 text-center">
        <div className="mx-auto mb-3.5 flex h-11 w-11 items-center justify-center rounded-[12px] bg-danger-weak">
          <AlertTriangle size={20} className="text-danger" aria-hidden="true" />
        </div>
        <div className="text-[15px] font-semibold text-fg">We couldn't read that file</div>
        <div className="mx-auto mt-2 max-w-[460px] text-[12.5px] leading-[1.55] text-fg-mid">{error}</div>
        <Button variant="primary" className="mt-[18px]" onClick={onReset}>
          Try another file
        </Button>
      </div>
    );
  }

  return (
    <div className="cll-fade flex flex-col gap-4">
      {/* Status / toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-3">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-weak">
          <FileText size={16} className="text-accent-text" aria-hidden="true" />
          {parsing ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent" style={{ animation: "cll-pulse 1.3s ease-in-out infinite" }} /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-fg">{meta?.filename ?? file?.name ?? "Your CV"}</div>
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
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-border-strong px-3 py-1.5 text-[12px] font-semibold text-fg-mid transition-colors hover:border-accent hover:text-fg"
        >
          {showJson ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          {showJson ? "Hide JSON" : "Show JSON"}
        </button>
      </div>

      {/* Two-pane: left cards, right live JSON */}
      <div className={showJson ? "grid gap-4 lg:grid-cols-[1fr_minmax(300px,380px)]" : "grid gap-4"}>
        {/* LEFT — live editable containers */}
        <div className="flex min-w-0 flex-col gap-4">
          <CountRow draft={draft} />

          <AnimatePresence initial={false}>
            {hasProfile || !parsing ? (
              <motion.div key="profile" layout initial={enterCard.initial} animate={enterCard.animate} exit={enterCard.exit} transition={enterCard.transition}>
                <SectionShell title="Details" icon={UserRound}>
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    {PROFILE_FIELDS.map((f) => (
                      <Field key={f.key} label={f.label} htmlFor={`p-${f.key}`} className={f.wide ? "sm:col-span-2" : undefined}>
                        {f.textarea ? (
                          <Textarea
                            id={`p-${f.key}`}
                            value={(draft.profile[f.key] as string | null | undefined) ?? ""}
                            placeholder={f.placeholder}
                            disabled={saving}
                            onChange={(e) => editProfile({ [f.key]: e.target.value || null } as Partial<Profile>)}
                          />
                        ) : (
                          <Input
                            id={`p-${f.key}`}
                            type={f.type ?? "text"}
                            value={(draft.profile[f.key] as string | null | undefined) ?? ""}
                            placeholder={f.placeholder}
                            disabled={saving}
                            onChange={(e) => editProfile({ [f.key]: e.target.value || null } as Partial<Profile>)}
                          />
                        )}
                      </Field>
                    ))}
                  </div>
                </SectionShell>
              </motion.div>
            ) : null}

            {SECTIONS.map((spec) => {
              const items = draft[spec.key] as unknown as Record<string, unknown>[];
              if (items.length === 0 && !(spec.core && !parsing)) return null;
              return (
                <motion.div key={spec.key} layout initial={enterCard.initial} animate={enterCard.animate} exit={enterCard.exit} transition={enterCard.transition}>
                  <SectionEditor spec={spec} items={items} disabled={saving} onChange={(next) => editSection(spec.key, next)} />
                </motion.div>
              );
            })}
          </AnimatePresence>

          {parsing && !has ? (
            <div className="flex items-center justify-center gap-2 rounded-[12px] border border-dashed border-border-strong bg-input py-10 text-[12.5px] text-fg-mid">
              <Sparkles size={14} className="text-accent-text" /> Waiting for the first fields to arrive…
            </div>
          ) : null}
        </div>

        {/* RIGHT — live JSON stream */}
        {showJson ? <JsonConsole text={streamText} parsing={parsing} durationS={durationS} elapsed={elapsed} /> : null}
      </div>

      {/* Save bar */}
      <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-fg">Saving mode</div>
          <div className="mt-1 text-[12px] leading-[1.5] text-fg-mid">
            {mode === "replace"
              ? "Replace your profile with this CV."
              : "Compare with your profile and review each change before saving."}
          </div>
        </div>
        <Segmented
          className="w-full shrink-0 sm:w-[220px]"
          options={[
            { value: "replace", label: "Replace" },
            { value: "merge", label: "Merge" },
          ]}
          value={mode}
          onChange={onModeChange}
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onReset}
          disabled={saving}
          className="rounded-[10px] border border-border-strong bg-transparent px-[18px] py-[11px] text-[13px] text-fg-mid transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
        >
          {parsing ? "Cancel" : "Try another file"}
        </button>
        <Button variant="primary" onClick={onSave} loading={saving} disabled={saving || parsing || !has}>
          {saving ? "Working…" : mode === "merge" ? "Review changes" : "Save & finish"}
          {!saving ? <Check size={15} /> : null}
        </Button>
      </div>
    </div>
  );
}

function CountRow({ draft }: { draft: CVExtraction }) {
  const stats: { label: string; n: number }[] = [
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
            className="tabular-nums font-bold"
          >
            {s.n}
          </motion.b>
          {s.label}
        </div>
      ))}
    </div>
  );
}

function JsonConsole({ text, parsing, durationS, elapsed }: { text: string; parsing: boolean; durationS: number | null; elapsed: number }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current && parsing) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text, parsing]);
  const time = parsing ? elapsed.toFixed(1) : durationS != null ? durationS.toFixed(1) : "0.0";
  return (
    <div className="flex min-h-[280px] flex-col overflow-hidden rounded-[12px] border border-border bg-reading lg:sticky lg:top-2 lg:max-h-[calc(100dvh-160px)]">
      <div className="flex items-center gap-2 border-b border-border/60 px-3.5 py-2.5">
        <Braces size={14} className="text-accent-text" aria-hidden="true" />
        <span className="font-mono text-[11px] font-semibold text-reading-ink">response.json</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-accent-text">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: parsing ? "var(--accent)" : "var(--success)", animation: parsing ? "cll-pulse 1.3s ease-in-out infinite" : undefined }} />
          {parsing ? "streaming" : "done"} · {time}s
        </span>
      </div>
      <pre ref={ref} className="flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[11.5px] leading-[1.7] text-reading-ink">
        {text || (parsing ? "Waiting for the model to respond…" : "")}
        {parsing ? <span className="cll-caret" /> : null}
      </pre>
    </div>
  );
}

function SectionShell({ title, icon: Icon, action, children }: { title: string; icon: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-accent-weak">
          <Icon size={13} className="text-accent-text" aria-hidden="true" />
        </span>
        <span className="text-[12px] font-semibold text-fg">{title}</span>
        <span className="ml-auto">{action}</span>
      </div>
      {children}
    </div>
  );
}

function SectionEditor({
  spec,
  items,
  disabled,
  onChange,
}: {
  spec: SectionSpec;
  items: Record<string, unknown>[];
  disabled: boolean;
  onChange: (items: Record<string, unknown>[]) => void;
}) {
  const setField = (i: number, key: string, value: string) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, [key]: value || null } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, {}]);

  return (
    <SectionShell
      title={`${spec.title}${items.length ? ` · ${items.length}` : ""}`}
      icon={spec.icon}
      action={
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-text transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          <Plus size={13} /> Add
        </button>
      }
    >
      {items.length === 0 ? (
        <p className="text-[12px] text-fg-low">Nothing yet — add {spec.singular === "entry" ? "an" : "a"} {spec.singular}.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          <AnimatePresence initial={false}>
            {items.map((item, i) => (
              <motion.div
                key={i}
                layout
                initial={{ opacity: 0, y: 10, scale: 0.97, boxShadow: "0 0 0 2px var(--accent-weak)" }}
                animate={{ opacity: 1, y: 0, scale: 1, boxShadow: "0 0 0 0px transparent" }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
                transition={{ type: "spring", stiffness: 460, damping: 34 }}
                className="relative grid grid-cols-1 gap-2.5 rounded-[10px] border border-border bg-input p-3 sm:grid-cols-2"
              >
                {spec.fields.map((f) => {
                  const value = typeof item[f.key] === "string" ? (item[f.key] as string) : "";
                  return (
                    <div key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
                      {f.textarea ? (
                        <Textarea className="min-h-[64px]" value={value} placeholder={f.placeholder} disabled={disabled} onChange={(e) => setField(i, f.key, e.target.value)} />
                      ) : (
                        <Input value={value} placeholder={f.placeholder} disabled={disabled} onChange={(e) => setField(i, f.key, e.target.value)} />
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={disabled}
                  aria-label={`Remove ${spec.singular}`}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-[7px] text-fg-low transition-colors hover:bg-danger-weak hover:text-danger disabled:opacity-50"
                >
                  <X size={13} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </SectionShell>
  );
}

/* ── State 3 · Ready ─────────────────────────────────────────────── */
function ReadyState({ draft, mode }: { draft: CVExtraction; mode: SaveMode }) {
  const parts = useMemo(() => {
    const out: string[] = [];
    const add = (n: number, w: string) => n > 0 && out.push(`${n} ${w}${n === 1 ? "" : "s"}`);
    add(draft.experiences.length, "role");
    add(draft.skills.length, "skill");
    add(draft.projects.length, "project");
    add(draft.education.length, "degree");
    return out;
  }, [draft]);
  const summary = parts.length ? `${mode === "replace" ? "Imported" : "Merged in"} ${parts.join(", ")}.` : "Your profile is saved.";

  return (
    <div className="cll-fade flex flex-col items-center py-[30px] text-center">
      <div
        className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full"
        style={{ background: "conic-gradient(var(--accent) 0 100%, var(--border) 0)", boxShadow: "0 0 30px -6px var(--accent-shadow)" }}
      >
        <div className="absolute inset-[6px] rounded-full bg-bg" />
        <svg width="30" height="30" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative" aria-hidden="true">
          <path d="M4 10l4 4 8-9" />
        </svg>
      </div>
      <div className="mt-[18px] text-[21px] font-bold tracking-[-0.4px] text-fg">Your profile is ready</div>
      <div className="mt-2.5 max-w-[460px] text-[13.5px] leading-[1.65] text-fg-mid">
        {summary} You can refine anything from your profile, or jump straight into writing.
      </div>
      <div className="mt-[22px] flex gap-2.5">
        <Button asChild variant="outline">
          <Link to="/profile">Go to profile</Link>
        </Button>
        <Button asChild variant="primary">
          <Link to="/write">Write a letter</Link>
        </Button>
      </div>
    </div>
  );
}
