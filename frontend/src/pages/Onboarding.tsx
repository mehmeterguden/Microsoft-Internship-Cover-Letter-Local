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
import { AlertTriangle, Check, FileText, Loader2, Plus, X } from "lucide-react";
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
import type { CVExtraction, Profile } from "@/api/types";
import { toast } from "@/store/toast";

/* ── State model ─────────────────────────────────────────────────
   Add CV is a three-step flow: upload → review (the model streams and
   the profile fills in live; every field is editable) → done. Parse and
   review are one screen — sections appear as they're extracted and you can
   correct anything before saving. */
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

  // The editable working copy. While streaming it mirrors the live parse; once
  // the user edits anything (`dirty`), the stream stops overwriting their work.
  const [draft, setDraft] = useState<CVExtraction>(EMPTY);
  const dirtyRef = useRef(false);
  const accRef = useRef("");

  const [saveMode, setSaveMode] = useState<SaveMode>("replace");
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // OCR availability (gates image selection) + any CV already on the profile.
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

  // While streaming, re-parse the accumulating JSON a few times a second and fill
  // the draft — so sections appear progressively without waiting for valid JSON.
  useEffect(() => {
    if (!parsing) return;
    const id = window.setInterval(() => {
      if (dirtyRef.current) return; // user took over — don't clobber their edits
      const parsed = parsePartial(accRef.current);
      if (parsed) setDraft(toExtraction(parsed));
    }, 120);
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
    setParseError(null);
    setParsing(false);
    setDurationS(null);
    setState("upload");
  }, []);

  // Any edit marks the draft dirty (freezes stream-driven updates) and updates it.
  const edit = useCallback((next: CVExtraction) => {
    dirtyRef.current = true;
    setDraft(next);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await saveExtraction(draft, saveMode === "replace", meta?.filename);
      const total = Object.values(res.saved).reduce((a, b) => a + b, 0);
      toast.success(
        "Saved to profile",
        saveMode === "replace"
          ? `Replaced your profile with ${total} item${total === 1 ? "" : "s"}.`
          : `Merged ${total} item${total === 1 ? "" : "s"} into your profile.`,
      );
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
      <div className="mx-auto flex w-full max-w-[880px] flex-col">
        <Stepper steps={RAIL_STEPS} current={STEP_INDEX[state]} className="mb-7" />

        {state === "upload" ? (
          <UploadState onChoose={startStream} ocrEnabled={ocrEnabled} existing={existing} />
        ) : null}

        {state === "review" ? (
          <ReviewState
            draft={draft}
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
   The model streams a JSON object token by token. To show sections as they
   arrive (before the JSON is valid), balance the open brackets/strings of the
   longest parseable prefix and JSON.parse that. */
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
  // Try the full prefix, dropping trailing (incomplete) characters until it parses.
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

/** Coerce a (possibly partial) parsed object into a CVExtraction-shaped draft. */
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

/** Ensure every array key exists (the validated payload always does, but be safe). */
function withArrays(ex: CVExtraction): CVExtraction {
  return { ...EMPTY, ...ex, profile: ex.profile ?? {} };
}

function friendlyDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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

/* ── State 2 · Review (live + editable) ──────────────────────────── */
type ItemField = { key: string; placeholder: string; wide?: boolean; textarea?: boolean };
type SectionSpec = {
  key: Exclude<keyof CVExtraction, "profile">;
  title: string;
  singular: string;
  core?: boolean; // shown even when empty (once done) so the user can add
  fields: ItemField[];
};

const SECTIONS: SectionSpec[] = [
  { key: "skills", title: "Skills", singular: "skill", core: true, fields: [{ key: "name", placeholder: "Skill" }, { key: "category", placeholder: "Category" }] },
  {
    key: "experiences",
    title: "Experience",
    singular: "role",
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
    fields: [
      { key: "name", placeholder: "Name" },
      { key: "role", placeholder: "Role" },
      { key: "description", placeholder: "Description", wide: true, textarea: true },
    ],
  },
  { key: "certificates", title: "Certificates", singular: "certificate", fields: [{ key: "name", placeholder: "Name" }, { key: "issuer", placeholder: "Issuer" }] },
  { key: "trainings", title: "Training", singular: "training", fields: [{ key: "name", placeholder: "Name" }, { key: "provider", placeholder: "Provider" }] },
  { key: "languages", title: "Languages", singular: "language", fields: [{ key: "name", placeholder: "Language" }, { key: "proficiency", placeholder: "Level" }] },
  { key: "links", title: "Links", singular: "link", fields: [{ key: "label", placeholder: "Label" }, { key: "url", placeholder: "https://" }] },
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

function ReviewState({
  draft,
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
      {/* Live status bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-weak">
          <FileText size={16} className="text-accent-text" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-fg">{meta?.filename ?? file?.name ?? "Your CV"}</div>
          <div className="mt-0.5 font-mono text-[10px] text-fg-low">
            {file ? formatBytes(file.size) : ""}
            {meta ? ` · ${meta.source_type.toUpperCase()} · ${meta.num_pages} pp` : ""}
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[12px]">
          {parsing ? (
            <>
              <Loader2 size={14} className="animate-spin text-accent-text" aria-hidden="true" />
              <span className="text-fg-mid">Reading your CV… {elapsed.toFixed(1)}s</span>
            </>
          ) : (
            <>
              <Check size={14} className="text-success" aria-hidden="true" />
              <span className="text-fg-mid">Extracted{durationS != null ? ` in ${durationS.toFixed(1)}s` : ""} · edit anything</span>
            </>
          )}
        </span>
      </div>

      {/* Profile — editable basics */}
      <SectionShell title="Details">
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

      {/* Every list section — editable, appears as it's extracted */}
      {SECTIONS.map((spec) => {
        const items = draft[spec.key] as unknown as Record<string, unknown>[];
        if (items.length === 0 && !(spec.core && !parsing)) return null;
        return (
          <SectionEditor
            key={spec.key}
            spec={spec}
            items={items}
            disabled={saving}
            onChange={(next) => editSection(spec.key, next)}
          />
        );
      })}

      {/* Save mode */}
      <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-fg">Saving mode</div>
          <div className="mt-1 text-[12px] leading-[1.5] text-fg-mid">
            {mode === "replace" ? "Replace your profile with this CV." : "Merge into your profile, keeping current entries."}
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
          {saving ? "Saving…" : "Save to profile"}
        </Button>
      </div>
    </div>
  );
}

function SectionShell({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-fg">{title}</span>
        {action}
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
  const setField = (i: number, key: string, value: string) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, [key]: value || null } : it));
    onChange(next);
  };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, {}]);

  return (
    <SectionShell
      title={`${spec.title}${items.length ? ` · ${items.length}` : ""}`}
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
          {items.map((item, i) => (
            <div key={i} className="relative grid grid-cols-1 gap-2.5 rounded-[10px] border border-border bg-input p-3 sm:grid-cols-2">
              {spec.fields.map((f) => {
                const value = typeof item[f.key] === "string" ? (item[f.key] as string) : "";
                return (
                  <div key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
                    {f.textarea ? (
                      <Textarea
                        className="min-h-[64px]"
                        value={value}
                        placeholder={f.placeholder}
                        disabled={disabled}
                        onChange={(e) => setField(i, f.key, e.target.value)}
                      />
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
            </div>
          ))}
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
  const summary = parts.length
    ? `${mode === "replace" ? "Imported" : "Merged in"} ${parts.join(", ")}.`
    : "Your profile is saved.";

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
