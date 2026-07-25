import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  FileText,
  FileUp,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/data";
import { Pill } from "@/components/ui/feedback";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { streamImportCv, saveExtraction, listDocuments, type CvImportEvent, type Document } from "@/api/cv";
import { parsePartial } from "@/lib/partialJson";
import { getSettings } from "@/api/settings";
import { getProfile } from "@/api/profile";
import { errorMessage } from "@/api/client";
import { planReconcile, type ReconcilePlan } from "@/api/reconcile";
import { ReconcileReview } from "@/components/common/ReconcileReview";
import { ReviewScreen } from "@/components/onboarding/ReviewScreen";
import { SetupScaffold } from "@/components/setup/SetupScaffold";
import type { CVExtraction, Profile } from "@/api/types";
import { toast } from "@/store/toast";

/* ── State model ─────────────────────────────────────────────────
   Add CV flow: upload -> review -> ready. Parse and review are one live screen. */
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

function friendlyDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/* ── Modal: Extracted CV Text Viewer ─────────────────────────────── */
type DocLike = {
  filename: string;
  content?: string | null;
  source_type?: string | null;
  num_pages?: number | null;
};

function CVViewModal({ doc, onClose }: { doc: DocLike; onClose: () => void }) {
  const wordCount = doc.content ? doc.content.split(/\s+/).filter(Boolean).length : 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[84vh] w-[min(92vw,640px)] flex-col overflow-hidden p-0">
        {/* Header */}
        <div className="border-b border-border px-6 py-5 pr-14">
          <DialogTitle className="flex items-center gap-2.5 text-[15px] font-semibold text-fg">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-white"
              style={{ background: "var(--accent-grad)" }}
            >
              <FileText size={14} />
            </span>
            <span className="truncate">{doc.filename || "Extracted CV Text"}</span>
          </DialogTitle>
          <div className="mt-1.5 flex items-center gap-2 font-mono text-[10.5px] text-fg-mid">
            {doc.source_type ? (
              <span className="rounded-[4px] border border-border bg-surface-2 px-1.5 py-0.5 uppercase">
                {doc.source_type}
              </span>
            ) : null}
            {doc.num_pages ? <span>{doc.num_pages} pages</span> : null}
            {wordCount > 0 ? <span>· {wordCount.toLocaleString()} words</span> : null}
          </div>
        </div>
        {/* Body */}
        <div className="min-h-0 flex-1 overflow-auto bg-reading px-7 py-6">
          <p className="whitespace-pre-wrap text-[13.5px] leading-[1.85] text-reading-ink">
            {doc.content || "No extracted text is available for this document."}
          </p>
        </div>
        {/* Footer */}
        <div className="flex justify-end border-t border-border bg-surface-2 px-6 py-3.5">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page Component ─────────────────────────────────────────────── */
export function Onboarding() {
  const [state, setState] = useState<OnbState>("upload");
  const [ocrEnabled, setOcrEnabled] = useState<boolean | null>(null);
  const [existing, setExisting] = useState<{ filename: string | null; at: string | null } | null>(null);
  const [savedDocs, setSavedDocs] = useState<Document[]>([]);
  const [profileData, setProfileData] = useState<Profile | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<ImportMeta | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [durationS, setDurationS] = useState<number | null>(null);

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
        if (!alive) return;
        setProfileData(p);
        const src = Object.values(p.field_sources ?? {}).find((f) => f?.source === "cv");
        if (src) setExisting({ filename: src.detail ?? null, at: src.at ?? null });
      })
      .catch(() => {});
    listDocuments()
      .then((docs) => alive && setSavedDocs(docs))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!parsing) return;
    const id = window.setInterval(() => {
      setStreamText(accRef.current);
      if (dirtyRef.current) return;
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

  const reviewing = state === "review" && !plan;

  return (
    <Page
      eyebrow="Setup / Add CV"
      title="Add CV"
      subtitle="Import your CV to prefill your profile, skills, and work history automatically."
      actions={
        <Link
          to="/"
          className="rounded-[9px] border border-border-strong bg-transparent px-4 py-[9px] text-[13px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
        >
          Skip for now
        </Link>
      }
      bare={reviewing}
      bodyClassName={reviewing ? "flex flex-col" : "px-7 py-6"}
    >
      {reviewing ? (
        <ReviewScreen
          draft={draft}
          streamText={streamText}
          file={file}
          filename={meta?.filename ?? null}
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
      ) : (
        <div className="mx-auto flex w-full max-w-[880px] flex-col">
          <Stepper steps={RAIL_STEPS} current={STEP_INDEX[state]} className="mb-7" />

          {state === "upload" ? (
            <SetupScaffold
              icon={<FileUp size={20} aria-hidden="true" />}
              title="Import your CV"
              subtitle={
                existing
                  ? "Your active CV is shown below. You can view extracted data or upload a new file to refresh your profile."
                  : "Drop your CV and the model will turn it into a fully editable profile — read on-device, nothing uploaded."
              }
              privacyNote="Read on-device · nothing uploaded"
            >
              <UploadState
                onChoose={startStream}
                ocrEnabled={ocrEnabled}
                existing={existing}
                documents={savedDocs}
                profile={profileData}
              />
            </SetupScaffold>
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
          ) : null}

          {state === "ready" ? <ReadyState draft={draft} mode={saveMode} /> : null}
        </div>
      )}
    </Page>
  );
}

/* ── Incremental JSON helpers ────────────────────────────────────── */
function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    : [];
}

function toExtraction(o: Record<string, unknown>): CVExtraction {
  const profile =
    o.profile && typeof o.profile === "object" && !Array.isArray(o.profile)
      ? (o.profile as unknown as Profile)
      : {};
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

/* ── Upload / View State ─────────────────────────────────────────── */
function UploadState({
  onChoose,
  ocrEnabled,
  existing,
  documents,
  profile,
}: {
  onChoose: (file: File) => void;
  ocrEnabled: boolean | null;
  existing: { filename: string | null; at: string | null } | null;
  documents: Document[];
  profile: Profile | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<DocLike | null>(null);

  const ocrOff = ocrEnabled === false;
  const accept = ocrOff ? DOC_ACCEPT : `${DOC_ACCEPT},${IMAGE_ACCEPT}`;

  /* Resolve the saved document record that corresponds to this CV import */
  const activeDoc = useMemo<DocLike | null>(() => {
    if (!existing) return null;
    if (documents.length > 0) {
      const found = existing.filename ? documents.find((d) => d.filename === existing.filename) : null;
      return found ?? documents[documents.length - 1];
    }
    return { filename: existing.filename || "Imported CV", content: "" };
  }, [existing, documents]);

  const pick = useCallback(
    (f: File | undefined | null) => {
      if (!f) return;
      if (ocrOff && IMAGE_RE.test(f.name)) {
        toast.warning(
          "Image files need OCR",
          "Turn on OCR in Settings to read scanned images, or upload a PDF/DOCX/TXT.",
        );
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

  /* Derived profile identity strings */
  const candidateName = [profile?.name, profile?.surname].filter(Boolean).join(" ");
  const candidateSummary = profile?.summary || profile?.email || "";

  /* ── If existing CV and not in replace mode, show the active CV panel ── */
  if (existing && !replacing) {
    return (
      <div className="cll-fade flex w-full flex-col gap-4">
        {/* Active CV hero card — styled like Home.tsx hero */}
        <div
          className="relative overflow-hidden rounded-[15px] border border-border-strong px-6 py-5"
          style={{ background: "linear-gradient(135deg, var(--surface-2), var(--surface))" }}
        >
          {/* Ambient glow */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-20 h-52 w-64 rounded-full"
            style={{ background: "var(--glow-1)", opacity: 0.25, filter: "blur(52px)" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -left-8 -bottom-16 h-44 w-56 rounded-full"
            style={{ background: "var(--glow-2)", opacity: 0.2, filter: "blur(48px)" }}
          />

          <div className="relative flex flex-wrap items-start gap-5">
            {/* Icon */}
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-white"
              style={{ background: "var(--accent-grad)", boxShadow: "0 12px 28px -8px var(--accent-shadow)" }}
            >
              <FileText size={22} />
            </span>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-[16px] font-bold tracking-[-0.2px] text-fg">
                  {existing.filename || "Active Profile CV"}
                </h3>
                <Pill tone="success" dot>
                  Active CV
                </Pill>
              </div>
              <p className="mt-0.5 text-[12.5px] text-fg-mid">
                {existing.at ? `Imported on ${friendlyDate(existing.at)}` : "Saved in your profile"}
              </p>

              {/* Candidate identity strip */}
              {candidateName || candidateSummary ? (
                <div className="mt-3 rounded-[10px] border border-border bg-surface px-4 py-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-accent-text">
                    <Sparkles size={11} />
                    Parsed candidate
                  </div>
                  {candidateName ? (
                    <div className="text-[14px] font-bold text-fg">{candidateName}</div>
                  ) : null}
                  {candidateSummary ? (
                    <div className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5] text-fg-mid">
                      {candidateSummary}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Progress / status rail */}
          <div className="relative mt-5 flex items-end gap-3 border-t border-border pt-4">
            {[
              { label: "CV uploaded", done: true },
              { label: "Profile parsed", done: Boolean(candidateName || candidateSummary) },
              { label: "Ready to write", done: true },
            ].map((step) => (
              <div key={step.label} className="flex min-w-0 flex-1 flex-col gap-2">
                <div
                  className={`flex items-center gap-1.5 truncate text-[11px] font-medium ${step.done ? "text-fg" : "text-fg-mid"}`}
                >
                  {step.done ? (
                    <Check size={12} strokeWidth={2.8} className="text-success" />
                  ) : (
                    <span className="h-[6px] w-[6px] rounded-full border-[1.5px] border-current" />
                  )}
                  {step.label}
                </div>
                <div
                  className="h-[3px] overflow-hidden rounded-full"
                  style={{ background: step.done ? "var(--success)" : "var(--input)" }}
                />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="relative mt-4 flex flex-wrap items-center gap-2">
            {activeDoc ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-[9px]"
                onClick={() => setViewingDoc(activeDoc)}
              >
                <Eye size={13} />
                View extracted text
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="rounded-[9px]">
              <Link to="/profile">
                <User size={13} />
                Open profile
              </Link>
            </Button>
            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="rounded-[9px] text-fg-mid hover:border-accent hover:text-fg"
                onClick={() => setReplacing(true)}
              >
                <RefreshCw size={13} />
                Replace CV
              </Button>
            </div>
          </div>
        </div>

        {/* Next step nudge */}
        <Link
          to="/write"
          className="group flex items-center justify-between gap-4 rounded-[12px] border border-border bg-surface-2 px-5 py-3.5 transition-all hover:border-accent hover:bg-surface"
        >
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-white"
              style={{ background: "var(--accent-grad)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
              </svg>
            </span>
            <div>
              <div className="text-[13.5px] font-semibold text-fg">Start writing a cover letter</div>
              <div className="text-[11.5px] text-fg-mid">Your profile is ready — write your first letter</div>
            </div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-fg-low transition-transform group-hover:translate-x-0.5" />
        </Link>

        {viewingDoc ? <CVViewModal doc={viewingDoc} onClose={() => setViewingDoc(null)} /> : null}
      </div>
    );
  }

  /* ── Upload / dropzone view ─────────────────────────────────────── */
  return (
    <div className="cll-fade flex w-full flex-col items-center gap-4">
      {/* Back link when replacing an existing CV */}
      {replacing && existing ? (
        <div className="flex w-full max-w-[580px] items-center justify-between">
          <button
            type="button"
            onClick={() => setReplacing(false)}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-fg-mid transition-colors hover:text-fg"
          >
            <ArrowLeft size={13} />
            Back to active CV
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-warning/30 bg-warning/10 px-2 py-1 text-[10.5px] font-medium text-warning">
            <AlertTriangle size={11} />
            This will replace your current profile data
          </span>
        </div>
      ) : null}

      {/* Dropzone */}
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onInputChange} />
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload CV file"
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
        className={`group flex w-full max-w-[580px] cursor-pointer flex-col items-center rounded-[16px] border border-dashed px-8 py-12 text-center transition-all duration-200 hover:-translate-y-0.5 ${
          dragging
            ? "-translate-y-0.5 border-accent bg-accent-weak/30"
            : "border-border-strong hover:border-accent"
        }`}
        style={{
          background: dragging
            ? "radial-gradient(120% 130% at 50% -15%, var(--accent-weak), transparent 60%), var(--surface)"
            : "radial-gradient(120% 130% at 50% -15%, var(--accent-weak), transparent 60%), var(--input)",
        }}
      >
        {/* Icon */}
        <div
          className="mb-5 flex h-[56px] w-[56px] items-center justify-center rounded-[16px] transition-transform duration-200 group-hover:scale-105"
          style={{ background: "var(--accent-grad)", boxShadow: "0 14px 32px -8px var(--accent-shadow)" }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 4h7l4 4v12H7z" />
            <path d="M14 4v4h4" />
            <path d="M12 11v6M9 14l3-3 3 3" />
          </svg>
        </div>

        <div className="text-[17px] font-bold tracking-[-0.3px] text-fg">
          {dragging ? "Release to import" : replacing ? "Drop your new CV here" : "Drop your CV here"}
        </div>
        <div className="mt-1.5 text-[13px] text-fg-mid">Drag &amp; drop, paste, or click to browse</div>

        <Button
          variant="primary"
          size="lg"
          className="mt-5 rounded-[10px]"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          Choose file
        </Button>

        {/* Format & privacy row */}
        <div className="mt-5 flex flex-col items-center gap-2">
          <div className="font-mono text-[10.5px] text-fg-low">
            {ocrOff ? "PDF · DOCX · TXT" : "PDF · DOCX · TXT · images"}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10.5px] font-semibold text-fg-mid">
            <ShieldCheck size={11} className="text-success" aria-hidden="true" />
            Read on-device · nothing uploaded
          </span>
        </div>
      </div>

      {/* OCR warning */}
      {ocrOff ? (
        <div className="inline-flex items-center gap-1.5 rounded-[8px] border border-warning/25 bg-warning/10 px-3 py-2 text-[12px] text-warning">
          <AlertTriangle size={13} aria-hidden="true" />
          <span>
            Scanned images are off —{" "}
            <Link to="/settings" className="font-semibold underline underline-offset-2 hover:opacity-80">
              enable OCR in Settings
            </Link>
            .
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* ── Ready State ─────────────────────────────────────────────────── */
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
    <div className="cll-fade flex flex-col items-center py-10 text-center">
      {/* Success ring */}
      <div
        className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full"
        style={{
          background: "conic-gradient(var(--accent) 0 100%, var(--border) 0)",
          boxShadow: "0 0 32px -6px var(--accent-shadow)",
        }}
      >
        <div className="absolute inset-[6px] rounded-full bg-bg" />
        <svg
          width="30"
          height="30"
          viewBox="0 0 20 20"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="relative"
          aria-hidden="true"
        >
          <path d="M4 10l4 4 8-9" />
        </svg>
      </div>

      <div className="mt-5 text-[22px] font-bold tracking-[-0.4px] text-fg">Your profile is ready</div>
      <div className="mt-2 max-w-[460px] text-[13.5px] leading-[1.65] text-fg-mid">
        {summary} Refine anything from your profile, or start writing your first letter right now.
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
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
