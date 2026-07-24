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
import { AlertTriangle, ArrowLeft, Check, Eye, FileText, FileUp, Sparkles, User } from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/data";
import { Pill } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/controls";
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

/* ── Modal viewer for extracted CV text ──────────────────────────── */
function CVViewModal({ doc, onClose }: { doc: Document | { filename: string; content?: string; source_type?: string | null; num_pages?: number | null }; onClose: () => void }) {
  const wordCount = doc.content ? doc.content.split(/\s+/).filter(Boolean).length : 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[84vh] w-[min(92vw,620px)] flex-col overflow-hidden p-0">
        <div className="border-b border-border px-[22px] py-[18px] pr-12">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <FileText size={16} className="text-accent-text" />
            <span className="truncate">{doc.filename || "Extracted CV Text"}</span>
          </DialogTitle>
          <div className="mt-1 font-mono text-[10.5px] text-fg-mid">
            {doc.source_type ? `${doc.source_type.toUpperCase()} · ` : ""}
            {doc.num_pages ? `${doc.num_pages} pages · ` : ""}
            {wordCount > 0 ? `${wordCount} words` : "Parsed text"}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-reading px-[26px] py-6">
          <div className="whitespace-pre-wrap text-[13.5px] leading-[1.8] text-reading-ink">
            {doc.content || "No extracted text available for this document."}
          </div>
        </div>
        <div className="flex justify-end border-t border-border bg-surface-2 px-[22px] py-3.5">
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

  // While streaming, a few times a second: push the raw text to the JSON pane and
  // re-parse the partial JSON so the left cards fill in.
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
      title="Add your CV"
      actions={
        <Link
          to="/"
          className="rounded-[9px] border border-border-strong bg-transparent px-4 py-[9px] text-[13px] text-fg-mid transition-colors hover:border-accent hover:text-fg"
        >
          Skip for now
        </Link>
      }
      bare={reviewing}
      bodyClassName={reviewing ? "flex flex-col" : "px-7 py-7"}
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
        <div className="mx-auto flex w-full max-w-[900px] flex-col">
          <Stepper steps={RAIL_STEPS} current={STEP_INDEX[state]} className="mb-7" />

          {state === "upload" ? (
            <SetupScaffold
              icon={<FileUp size={20} aria-hidden="true" />}
              title="Import your CV"
              subtitle="View your active profile CV or upload a new file — the model reads it on your device and turns it into a fully editable profile."
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

/* ── Incremental JSON ────────────────────────────────────────────── */
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

/* ── State 1 · Upload / View Switcher ───────────────────────────── */
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
  const [activeTab, setActiveTab] = useState<"view" | "upload">(existing ? "view" : "upload");
  const [viewingDoc, setViewingDoc] = useState<Document | { filename: string; content?: string } | null>(null);

  const ocrOff = ocrEnabled === false;
  const accept = ocrOff ? DOC_ACCEPT : `${DOC_ACCEPT},${IMAGE_ACCEPT}`;

  const activeDoc = useMemo(() => {
    if (!existing) return null;
    if (documents.length > 0) {
      if (existing.filename) {
        const found = documents.find((d) => d.filename === existing.filename);
        if (found) return found;
      }
      return documents[documents.length - 1];
    }
    return { filename: existing.filename || "Imported CV", content: "" };
  }, [existing, documents]);

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

  const name = [profile?.name, profile?.surname].filter(Boolean).join(" ");
  const title = profile?.summary || profile?.email || "";

  return (
    <div className="flex flex-col items-center w-full">
      {/* If existing CV is present, show tab switcher at top */}
      {existing ? (
        <div className="mb-6 flex justify-center">
          <Segmented
            options={[
              { value: "view", label: "Active CV (View)" },
              { value: "upload", label: "Upload New CV" },
            ]}
            value={activeTab}
            onChange={(v) => setActiveTab(v as "view" | "upload")}
          />
        </div>
      ) : null}

      {/* VIEW MODE: PROMINENT FOREGROUND VIEW OF EXISTING CV */}
      {existing && activeTab === "view" ? (
        <div className="cll-fade flex w-full max-w-[620px] flex-col items-center">
          <div
            className="relative w-full overflow-hidden rounded-[20px] border border-border bg-surface p-7 shadow-elevated"
            style={{
              background: "radial-gradient(130% 120% at 50% -10%, var(--accent-weak), transparent 60%), var(--surface)",
            }}
          >
            {/* Top Badge & Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-white"
                  style={{ background: "var(--accent-grad)", boxShadow: "0 8px 20px -6px var(--accent-shadow)" }}
                >
                  <FileText size={22} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[16px] font-bold text-fg">
                      {existing.filename || "Active Profile CV"}
                    </h3>
                    <Pill tone="success" className="gap-1">
                      <Check size={11} strokeWidth={2.5} /> Active CV
                    </Pill>
                  </div>
                  <p className="mt-0.5 text-[12px] text-fg-mid">
                    {existing.at ? `Imported on ${friendlyDate(existing.at)}` : "Saved in your profile"}
                  </p>
                </div>
              </div>
            </div>

            {/* Profile Overview Card */}
            {(name || title) ? (
              <div className="mt-5 rounded-[12px] border border-border bg-surface-2 p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.01em] text-accent-text">
                  <Sparkles size={13} />
                  Parsed Candidate Identity
                </div>
                {name ? <div className="mt-1 text-[14px] font-bold text-fg">{name}</div> : null}
                {title ? <div className="mt-0.5 text-[12px] text-fg-mid line-clamp-2">{title}</div> : null}
              </div>
            ) : null}

            {/* Action buttons */}
            <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-border pt-5">
              {activeDoc ? (
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setViewingDoc(activeDoc)}
                  className="rounded-[10px]"
                >
                  <Eye size={14} />
                  View Extracted Text
                </Button>
              ) : null}

              <Button
                variant="primary"
                size="md"
                onClick={() => setActiveTab("upload")}
                className="rounded-[10px]"
              >
                <FileUp size={14} />
                Upload New CV / Replace
              </Button>

              <Button asChild variant="ghost" size="md" className="rounded-[10px]">
                <Link to="/profile">
                  <User size={14} />
                  View Profile
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* UPLOAD MODE: DROPZONE FOR UPLOADING A NEW CV */
        <div className="cll-fade flex flex-col items-center w-full">
          {existing ? (
            <div className="mb-4 flex w-full max-w-[560px] justify-start">
              <button
                type="button"
                onClick={() => setActiveTab("view")}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent-text transition-colors hover:underline"
              >
                <ArrowLeft size={13} /> Back to Active CV
              </button>
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
              {dragging ? "Drop it here" : existing ? "Upload a new CV file" : "Drop your CV here"}
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
      )}

      {viewingDoc ? <CVViewModal doc={viewingDoc} onClose={() => setViewingDoc(null)} /> : null}
    </div>
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
