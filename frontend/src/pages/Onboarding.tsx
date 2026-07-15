import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Stepper } from "@/components/ui/data";
import { streamImportCv, saveExtraction, type CvImportEvent } from "@/api/cv";
import { getSettings } from "@/api/settings";
import { errorMessage } from "@/api/client";
import type { CVExtraction } from "@/api/types";
import { toast } from "@/store/toast";

/* ── State model ─────────────────────────────────────────────────
   "Add CV" is a four-step flow wired to the real import pipeline:
   upload → streamImportCv (live tokens) → review the extracted
   CVExtraction → saveExtraction → done. The stepper mirrors these
   states; everything below `state` derives from the SSE stream and
   the settings fetch (OCR availability). */
type OnbState = "upload" | "parse" | "review" | "ready";
type SaveMode = "replace" | "merge";

const RAIL_STEPS = [{ label: "Upload" }, { label: "Parse" }, { label: "Review" }, { label: "Done" }];
const STEP_INDEX: Record<OnbState, number> = { upload: 0, parse: 1, review: 2, ready: 3 };

const ACCEPT = ".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp,.tiff,.bmp";

/** Metadata emitted by the first SSE frame (`meta`). */
interface ImportMeta {
  filename: string;
  source_type: string;
  num_pages: number;
  char_count: number;
}

/* ── Page ────────────────────────────────────────────────────────── */
export function Onboarding() {
  const [state, setState] = useState<OnbState>("upload");

  // OCR availability (drives the "images need OCR" note). null = unknown.
  const [ocrEnabled, setOcrEnabled] = useState<boolean | null>(null);

  // Import stream state.
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<ImportMeta | null>(null);
  const [streamText, setStreamText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [durationS, setDurationS] = useState<number | null>(null);
  const [extraction, setExtraction] = useState<CVExtraction | null>(null);

  // Save state.
  const [saveMode, setSaveMode] = useState<SaveMode>("replace");
  const [saving, setSaving] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Fetch OCR availability once; a failure just leaves the note hidden.
  useEffect(() => {
    let alive = true;
    getSettings()
      .then((s) => alive && setOcrEnabled(Boolean(s.ocr_enabled)))
      .catch(() => alive && setOcrEnabled(null));
    return () => {
      alive = false;
    };
  }, []);

  // Abort any in-flight import on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

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
        setStreamText((t) => t + event.text);
        break;
      case "done":
        setParsing(false);
        setDurationS(event.duration_s);
        if (event.ok && event.structured) {
          setExtraction(event.structured);
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

      setFile(f);
      setMeta(null);
      setStreamText("");
      setExtraction(null);
      setDurationS(null);
      setParseError(null);
      setParsing(true);
      setState("parse");

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
    setFile(null);
    setMeta(null);
    setStreamText("");
    setExtraction(null);
    setParseError(null);
    setParsing(false);
    setDurationS(null);
    setState("upload");
  }, []);

  const handleSave = useCallback(async () => {
    if (!extraction) return;
    setSaving(true);
    try {
      const res = await saveExtraction(extraction, saveMode === "replace", meta?.filename);
      const total = Object.values(res.saved).reduce((a, b) => a + b, 0);
      toast.success(
        "Saved to profile",
        saveMode === "replace"
          ? `Replaced your profile with ${total} imported item${total === 1 ? "" : "s"}.`
          : `Merged ${total} item${total === 1 ? "" : "s"} into your profile.`,
      );
      setState("ready");
    } catch (err) {
      toast.danger("Couldn't save", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [extraction, saveMode, meta]);

  return (
    <Page
      eyebrow="SETUP / ADD CV"
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
      <div className="mx-auto flex w-full max-w-[860px] flex-col">
        <Stepper steps={RAIL_STEPS} current={STEP_INDEX[state]} className="mb-7" />

        {state === "upload" ? <UploadState onChoose={startStream} ocrEnabled={ocrEnabled} /> : null}
        {state === "parse" ? (
          <ParseState
            file={file}
            meta={meta}
            streamText={streamText}
            parsing={parsing}
            extraction={extraction}
            error={parseError}
            durationS={durationS}
            onContinue={() => setState("review")}
            onReset={reset}
          />
        ) : null}
        {state === "review" && extraction ? (
          <ReviewState
            extraction={extraction}
            mode={saveMode}
            onModeChange={setSaveMode}
            saving={saving}
            onReset={reset}
            onSave={handleSave}
          />
        ) : null}
        {state === "ready" && extraction ? <ReadyState extraction={extraction} mode={saveMode} /> : null}
      </div>
    </Page>
  );
}

/* ── Extraction helpers ──────────────────────────────────────────── */
function countExtraction(ex: CVExtraction) {
  return {
    roles: ex.experiences.length,
    skills: ex.skills.length,
    projects: ex.projects.length,
    degrees: ex.education.length,
    certificates: ex.certificates.length,
    languages: ex.languages.length,
    trainings: ex.trainings.length,
    links: ex.links.length,
  };
}

function previewNames(names: (string | null | undefined)[]): string {
  const clean = names.filter((n): n is string => Boolean(n && n.trim()));
  if (!clean.length) return "—";
  const head = clean.slice(0, 2).join(", ");
  const rest = clean.length - 2;
  return rest > 0 ? `${head}, +${rest}` : head;
}

function chipPreview(names: (string | null | undefined)[]): string[] {
  const clean = names.filter((n): n is string => Boolean(n && n.trim()));
  const head = clean.slice(0, 3);
  const rest = clean.length - head.length;
  return rest > 0 ? [...head, `+${rest}`] : head;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── State 1 · Upload ────────────────────────────────────────────── */
function UploadState({ onChoose, ocrEnabled }: { onChoose: (file: File) => void; ocrEnabled: boolean | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (file: File | undefined | null) => {
    if (file) onChoose(file);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    pick(e.target.files?.[0]);
    e.target.value = ""; // allow re-selecting the same file
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const formats: { label: string; ocr?: boolean }[] = [
    { label: "PDF" },
    { label: "DOCX" },
    { label: "TXT" },
    { label: "Scanned image · OCR", ocr: true },
  ];
  const ocrOff = ocrEnabled === false;

  return (
    <div className="cll-fade flex flex-col items-center py-[18px] text-center">
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onInputChange} />
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
        className={`w-full max-w-[560px] cursor-pointer rounded-[18px] border-[1.5px] border-dashed px-10 py-11 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent ${
          dragging ? "-translate-y-0.5 border-accent" : "border-border-strong"
        }`}
        style={{
          background:
            "radial-gradient(130% 120% at 50% -10%, var(--accent-weak), transparent 58%), var(--input)",
        }}
      >
        <div
          className="mx-auto mb-[18px] flex h-[62px] w-[62px] items-center justify-center rounded-[17px]"
          style={{ background: "var(--accent-grad)", boxShadow: "0 14px 32px -8px var(--accent-shadow)" }}
        >
          <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 4h7l4 4v12H7z" />
            <path d="M14 4v4h4" />
            <path d="M12 11v6M9 14l3-3 3 3" />
          </svg>
        </div>
        <div className="text-[18px] font-bold tracking-[-0.3px] text-fg">
          {dragging ? "Drop it here" : "Drop your CV to get started"}
        </div>
        <div className="mt-2 text-[13px] leading-[1.55] text-fg-mid">
          or click to browse — it's read right here on your device,
          <br />
          then turned into a profile you can edit.
        </div>
        <div className="mt-[18px] flex flex-wrap justify-center gap-[7px]">
          {formats.map((f) => (
            <span
              key={f.label}
              className={`whitespace-nowrap rounded-[8px] border px-[11px] py-[5px] font-mono text-[10px] ${
                f.ocr && ocrOff
                  ? "border-warning-weak bg-warning-weak text-warning"
                  : "border-border bg-surface-2 text-fg-mid"
              }`}
            >
              {f.label}
            </span>
          ))}
        </div>
        {ocrOff ? (
          <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] text-fg-mid">
            <AlertTriangle size={13} className="text-warning" aria-hidden="true" />
            <span>
              Scanned images need OCR —{" "}
              <Link
                to="/settings"
                className="text-accent-text underline-offset-2 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                enable it in Settings
              </Link>
              . PDF, DOCX and TXT work as-is.
            </span>
          </div>
        ) : null}
        <div>
          <Button
            variant="primary"
            size="lg"
            className="mt-[22px] rounded-[11px]"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            Choose file
          </Button>
        </div>
      </div>

      <div className="mt-[22px] flex flex-wrap justify-center gap-x-[22px] gap-y-2.5">
        <TrustItem label="Parsed on-device">
          <rect x="5" y="9" width="10" height="7" rx="1.5" />
          <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
        </TrustItem>
        <TrustItem label="Nothing is uploaded">
          <path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z" />
          <circle cx="10" cy="10" r="2" />
          <path d="M3 3l14 14" />
        </TrustItem>
        <TrustItem label="Everything stays editable">
          <path d="M4 16l1-4 8.5-8.5 3 3L8 15l-4 1z" />
        </TrustItem>
      </div>
    </div>
  );
}

function TrustItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[7px] text-[11.5px] text-fg-mid">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--accent-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
      {label}
    </span>
  );
}

/* ── State 2 · Parse (live) ──────────────────────────────────────── */
function ParseState({
  file,
  meta,
  streamText,
  parsing,
  extraction,
  error,
  durationS,
  onContinue,
  onReset,
}: {
  file: File | null;
  meta: ImportMeta | null;
  streamText: string;
  parsing: boolean;
  extraction: CVExtraction | null;
  error: string | null;
  durationS: number | null;
  onContinue: () => void;
  onReset: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!parsing) return;
    const id = setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => clearInterval(id);
  }, [parsing]);

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

  const done = !parsing && extraction !== null;
  const c = extraction ? countExtraction(extraction) : null;
  const counters: { n: number | null; label: string }[] = [
    { n: c ? c.roles : null, label: "roles" },
    { n: c ? c.skills : null, label: "skills" },
    { n: c ? c.projects : null, label: "projects" },
    { n: c ? c.degrees : null, label: "degrees" },
  ];
  const timeLabel = done && durationS != null ? durationS.toFixed(1) : elapsed.toFixed(1);

  return (
    <div className="cll-fade">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* File + extracted counters */}
        <div className="rounded-[12px] border border-border bg-surface p-5">
          <div className="rounded-[11px] border border-dashed border-border-strong bg-input p-[22px] text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-[12px] bg-accent-weak">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13V4M6.5 7.5L10 4l3.5 3.5M4 15h12" />
              </svg>
            </div>
            <div className="flex items-center justify-center gap-2 text-[13px] font-semibold text-fg">
              <span className="truncate">{meta?.filename ?? file?.name ?? "Your CV"}</span>
              {done ? <SuccessCheck /> : <Loader2 size={14} className="shrink-0 animate-spin text-accent-text" aria-hidden="true" />}
            </div>
            <div className="mt-[5px] font-mono text-[10px] text-fg-low">
              {file ? formatBytes(file.size) : ""}
              {meta
                ? ` · ${meta.source_type.toUpperCase()} · ${meta.num_pages} pp · ${meta.char_count.toLocaleString()} chars`
                : parsing
                  ? " · reading"
                  : ""}
            </div>
            <div className="mt-3.5 h-1 overflow-hidden rounded-[2px] bg-surface-2">
              <div
                className="h-full w-full"
                style={{
                  background: "var(--accent-grad)",
                  animation: parsing ? "cll-pulse 1.3s ease-in-out infinite" : undefined,
                }}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="font-mono text-[10px] tracking-[0.6px] text-fg-mid">EXTRACTED SO FAR</div>
            <div className="flex flex-wrap gap-2">
              {counters.map((ct) => (
                <span
                  key={ct.label}
                  className="rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[11.5px] text-fg"
                >
                  <b className="text-accent-text">{ct.n ?? "—"}</b> {ct.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Streaming JSON */}
        <div className="relative overflow-hidden rounded-[12px] border border-border bg-reading px-5 py-[18px]">
          <div className="absolute right-4 top-3.5 flex items-center gap-1.5 font-mono text-[9.5px] text-accent-text">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: done ? "var(--success)" : "var(--accent)",
                animation: parsing ? "cll-pulse 1.3s ease-in-out infinite" : undefined,
              }}
            />
            {done ? "PARSED" : "PARSING"} · {timeLabel}s
          </div>
          <pre className="mt-5 max-h-[300px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.75] text-reading-ink">
            {streamText || (parsing ? "Waiting for the model to respond…" : "")}
            {parsing ? <span className="cll-caret" /> : null}
          </pre>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onReset}
          className="rounded-[10px] border border-border-strong bg-transparent px-[18px] py-[11px] text-[13px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
        >
          Cancel
        </button>
        <Button variant="primary" onClick={onContinue} disabled={!done} loading={parsing}>
          {parsing ? "Parsing…" : "Continue to review"}
          {done ? <ArrowRight /> : null}
        </Button>
      </div>
    </div>
  );
}

/* ── State 3 · Review ────────────────────────────────────────────── */
type ReviewCard = {
  title: string;
  status: "ok" | "warn";
  text?: string;
  chips?: string[];
};

function buildReviewCards(ex: CVExtraction): ReviewCard[] {
  const p = ex.profile;
  const fullName = [p.name, p.surname].filter(Boolean).join(" ").trim();
  const cards: ReviewCard[] = [
    {
      title: "Identity",
      status: fullName || p.email ? "ok" : "warn",
      text: previewNames([fullName, p.email, p.phone]) === "—" ? "Add your details" : [fullName, p.email].filter(Boolean).join(" · "),
    },
    { title: `Skills · ${ex.skills.length}`, status: ex.skills.length ? "ok" : "warn", chips: chipPreview(ex.skills.map((s) => s.name)) },
    {
      title: `Experience · ${ex.experiences.length}`,
      status: ex.experiences.length ? "ok" : "warn",
      text: ex.experiences.length ? previewNames(ex.experiences.map((e) => e.company)) : "No roles found",
    },
    {
      title: `Education · ${ex.education.length}`,
      status: ex.education.length ? "ok" : "warn",
      text: ex.education.length ? previewNames(ex.education.map((e) => e.degree ?? e.institution)) : "No education found",
    },
    {
      title: `Projects · ${ex.projects.length}`,
      status: ex.projects.length ? "ok" : "warn",
      text: ex.projects.length ? previewNames(ex.projects.map((pj) => pj.name)) : "No projects found",
    },
    {
      title: `Languages · ${ex.languages.length}`,
      status: ex.languages.length ? "ok" : "warn",
      text: ex.languages.length ? previewNames(ex.languages.map((l) => l.name)) : "None listed",
    },
  ];
  if (ex.certificates.length)
    cards.push({ title: `Certificates · ${ex.certificates.length}`, status: "ok", text: previewNames(ex.certificates.map((c) => c.name)) });
  if (ex.trainings.length)
    cards.push({ title: `Training · ${ex.trainings.length}`, status: "ok", text: previewNames(ex.trainings.map((t) => t.name)) });
  if (ex.links.length) cards.push({ title: `Links · ${ex.links.length}`, status: "ok", text: previewNames(ex.links.map((l) => l.label)) });
  return cards;
}

function ReviewState({
  extraction,
  mode,
  onModeChange,
  saving,
  onReset,
  onSave,
}: {
  extraction: CVExtraction;
  mode: SaveMode;
  onModeChange: (mode: SaveMode) => void;
  saving: boolean;
  onReset: () => void;
  onSave: () => void;
}) {
  const cards = buildReviewCards(extraction);
  const empty = countExtraction(extraction);
  const nothing = Object.values(empty).every((n) => n === 0);

  return (
    <div className="cll-fade">
      <div className="mb-3.5 text-[13px] text-fg-mid">
        Here's what we pulled from your CV. Save it now — you can refine every section from your profile afterwards.
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="rounded-[12px] border border-border bg-surface p-4 transition-colors duration-200 hover:border-border-strong">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-fg">{c.title}</span>
              {c.status === "ok" ? <SuccessCheck /> : <WarnMark />}
            </div>
            {c.chips && c.chips.length ? (
              <div className="mt-[9px] flex flex-wrap gap-[5px]">
                {c.chips.map((chip) => (
                  <span key={chip} className="rounded-[6px] bg-surface-2 px-2 py-[3px] text-[10.5px] text-fg-mid">
                    {chip}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-[12px] leading-[1.5] text-fg-mid">{c.text}</div>
            )}
          </div>
        ))}
      </div>

      {/* Save mode */}
      <div className="mt-[18px] flex flex-col gap-3 rounded-[12px] border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-fg-low">Saving mode</div>
          <div className="mt-1 text-[12px] leading-[1.5] text-fg-mid">
            {mode === "replace"
              ? "Replace everything in your profile with this CV."
              : "Merge into your existing profile, keeping current entries."}
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

      <div className="mt-[18px] flex items-center justify-between">
        <button
          type="button"
          onClick={onReset}
          disabled={saving}
          className="rounded-[10px] border border-border-strong bg-transparent px-[18px] py-[11px] text-[13px] text-fg-mid transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
        >
          Try another file
        </button>
        <Button variant="primary" onClick={onSave} loading={saving} disabled={saving || nothing}>
          {saving ? "Saving…" : "Save to profile"}
          {!saving ? <SuccessCheckLight /> : null}
        </Button>
      </div>
    </div>
  );
}

/* ── State 4 · Ready ─────────────────────────────────────────────── */
function ReadyState({ extraction, mode }: { extraction: CVExtraction; mode: SaveMode }) {
  const c = countExtraction(extraction);
  const parts: string[] = [];
  const add = (n: number, word: string) => {
    if (n > 0) parts.push(`${n} ${word}${n === 1 ? "" : "s"}`);
  };
  add(c.roles, "role");
  add(c.skills, "skill");
  add(c.projects, "project");
  add(c.degrees, "degree");
  add(c.certificates, "certificate");
  add(c.languages, "language");
  const summary = parts.length
    ? `${mode === "replace" ? "Imported" : "Merged in"} ${joinList(parts)}.`
    : "Your profile is saved.";

  return (
    <div className="cll-fade flex flex-col items-center py-[30px] text-center">
      <div
        className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full"
        style={{
          background: "conic-gradient(var(--accent) 0 100%, var(--border) 0)",
          boxShadow: "0 0 30px -6px var(--accent-shadow)",
        }}
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

/* ── Local glyphs (inline SVG for 1:1 fidelity with the design) ──── */
function SuccessCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M4 10l4 4 8-9" />
    </svg>
  );
}

function WarnMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M10 4v7M10 15v.5" />
    </svg>
  );
}

function SuccessCheckLight() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10l4 4 8-9" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}
