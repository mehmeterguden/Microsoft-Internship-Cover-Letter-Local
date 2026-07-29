import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Copy, ExternalLink, FileText, Loader2, LogIn, Sparkles, Unplug, UploadCloud } from "lucide-react";
import { Page } from "@/components/common/Page";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ReconcileReview } from "@/components/common/ReconcileReview";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/feedback";
import { JsonConsole } from "@/components/onboarding/JsonConsole";
import { SetupScaffold } from "@/components/setup/SetupScaffold";
import { parsePartial } from "@/lib/partialJson";
import { useAsync } from "@/lib/useAsync";
import { errorMessage } from "@/api/client";
import { toast } from "@/store/toast";
import type { CVExtraction } from "@/api/types";
import {
  disconnectLinkedin,
  importLinkedinProfile,
  linkedinStatus,
  oauthStartUrl,
  parseLinkedinText,
  saveLinkedinConfig,
  streamImportLinkedinProfile,
  type LinkedinImportEvent,
} from "@/api/linkedin";
import { planReconcile, type ApplyResult, type ReconcilePlan } from "@/api/reconcile";
import { FILE_ACCEPT, isParseableDocument } from "@/lib/fileTypes";

type Tab = "import" | "paste" | "connect";

const OAUTH_ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  state_mismatch: "Sign-in couldn't be verified — please try again.",
  exchange_failed: "LinkedIn rejected the sign-in. Check your app's Client ID/Secret and redirect URL.",
};

const SECTION_KEYS: (keyof CVExtraction)[] = [
  "experiences", "education", "skills", "certificates", "languages", "projects", "trainings", "links",
];
const itemCount = (ex: CVExtraction): number =>
  SECTION_KEYS.reduce((n, k) => n + (Array.isArray(ex[k]) ? (ex[k] as unknown[]).length : 0), 0);

const LIVE_SECTIONS: { key: keyof CVExtraction; label: string }[] = [
  { key: "experiences", label: "Experience" },
  { key: "education", label: "Education" },
  { key: "skills", label: "Skills" },
  { key: "projects", label: "Projects" },
  { key: "certificates", label: "Certificates" },
  { key: "languages", label: "Languages" },
  { key: "links", label: "Links" },
];

/** LinkedIn brand mark. */
function LinkedInMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  );
}

/** Dropzone container classes — accent border while dragging. */
function cnDrop(dragging: boolean): string {
  return (
    "flex flex-col items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed px-6 py-14 text-center transition-colors " +
    (dragging ? "border-accent bg-accent-weak" : "border-border-strong bg-surface-2")
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
    : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function profileValueCount(profile: Record<string, unknown>): number {
  return ["name", "surname", "email", "phone", "linkedin", "github", "summary"].filter((key) => text(profile[key])).length;
}

function itemLabel(section: keyof CVExtraction, item: Record<string, unknown>): string | null {
  switch (section) {
    case "experiences":
      return [text(item.title), text(item.company)].filter(Boolean).join(" @ ") || null;
    case "education":
      return [text(item.degree), text(item.institution)].filter(Boolean).join(" @ ") || null;
    case "skills":
    case "projects":
    case "certificates":
    case "trainings":
    case "languages":
      return text(item.name);
    case "links":
      return text(item.label) ?? text(item.url);
    default:
      return null;
  }
}

function getLiveSummary(raw: string) {
  const parsed = parsePartial(raw) ?? {};
  const profile = record(parsed.profile) ?? {};
  const sections = LIVE_SECTIONS.map(({ key, label }) => {
    const items = rows(parsed[key]);
    return {
      key,
      label,
      count: items.length,
      preview: items.map((item) => itemLabel(key, item)).filter((value): value is string => !!value).slice(0, 3),
    };
  });

  return {
    profile,
    profileFields: profileValueCount(profile),
    readySections: sections.filter((section) => section.count > 0).length,
    totalItems: sections.reduce((sum, section) => sum + section.count, 0),
    sections,
  };
}

export function LinkedIn() {
  const status = useAsync(linkedinStatus);
  const [searchParams, setSearchParams] = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("import");
  const [origin, setOrigin] = useState("");
  const [plan, setPlan] = useState<ReconcilePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamFilename, setStreamFilename] = useState<string | null>(null);
  const [streamDuration, setStreamDuration] = useState<number | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const streamAccRef = useRef("");
  const importAbortRef = useRef<AbortController | null>(null);
  const importStartRef = useRef<number | null>(null);

  const [pasteText, setPasteText] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const liveSummary = useMemo(() => getLiveSummary(streamText), [streamText]);
  const reviewing = !!plan;

  useEffect(() => {
    const connected = searchParams.get("linkedin_connected");
    const error = searchParams.get("linkedin_error");
    if (!connected && !error) return;
    if (connected) {
      const name = searchParams.get("name");
      toast.success("LinkedIn connected", name ? `Signed in as ${name}.` : undefined);
      setTab("connect");
      status.reload();
    } else if (error) {
      toast.danger("Couldn't connect", OAUTH_ERRORS[error] ?? "LinkedIn sign-in failed.");
    }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => importAbortRef.current?.abort(), []);

  /** Compare a fresh extraction with the saved profile → a reconcile plan. */
  async function reviewExtraction(extraction: CVExtraction, from: string, url?: string) {
    setOrigin(from);
    setPlanning(true);
    setPlan(null);
    try {
      const result = await planReconcile(extraction, url || extraction.profile.linkedin || undefined);
      setPlan(result);
      const { conflict, new: added } = result.counts;
      toast.success(
        "Compared with your profile",
        `${added} new · ${conflict} to review${result.ai ? "" : " · field-matched"}.`,
      );
    } catch (err) {
      toast.danger("Couldn't compare", errorMessage(err));
      setOrigin("");
    } finally {
      setPlanning(false);
    }
  }

  async function onImportFile(file: File) {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".zip") && !isParseableDocument(file)) {
      toast.warning("Unsupported file", "Upload a PDF, Word, image, or your LinkedIn .zip export.");
      return;
    }

    if (name.endsWith(".zip")) {
      setImporting(true);
      setStreamText("");
      setStreamFilename(file.name);
      setStreamDuration(0);
      setStreamError(null);
      try {
        const result = await importLinkedinProfile(file);
        if (!result.ok || !result.structured) {
          toast.danger("Couldn't read that profile", result.error ?? "The model couldn't structure the PDF text.");
          return;
        }
        setStreamText(JSON.stringify(result.structured, null, 2));
        toast.success("Profile parsed", `${itemCount(result.structured)} items found.`);
        await reviewExtraction(result.structured, `LinkedIn export · ${result.filename}`);
      } catch (err) {
        toast.danger("Couldn't read the profile", errorMessage(err));
      } finally {
        setImporting(false);
      }
      return;
    }

    setImporting(true);
    setStreamText("");
    setStreamFilename(file.name);
    setStreamDuration(null);
    setStreamError(null);
    streamAccRef.current = "";
    importStartRef.current = performance.now();
    importAbortRef.current?.abort();
    const ctrl = new AbortController();
    importAbortRef.current = ctrl;

    try {
      await streamImportLinkedinProfile(
        file,
        async (event: LinkedinImportEvent) => {
          switch (event.type) {
            case "meta":
              setStreamFilename(event.filename);
              break;
            case "token":
              streamAccRef.current += event.text;
              setStreamText(streamAccRef.current);
              if (importStartRef.current != null) {
                setStreamDuration((performance.now() - importStartRef.current) / 1000);
              }
              break;
            case "done":
              setStreamDuration(event.duration_s);
              setStreamText(event.raw_output || streamAccRef.current);
              if (!event.ok || !event.structured) {
                const msg = event.error ?? "The model couldn't structure the LinkedIn PDF.";
                setStreamError(msg);
                toast.danger("Couldn't read that profile", msg);
                return;
              }
              toast.success("Profile parsed", `${itemCount(event.structured)} items found.`);
              await reviewExtraction(event.structured, `Profile PDF · ${event.structured.profile.linkedin || file.name}`);
              break;
            case "fatal":
              setStreamError(event.error);
              toast.danger("Couldn't read the profile", event.error);
              break;
          }
        },
        ctrl.signal,
      );
    } catch (err) {
      if (!ctrl.signal.aborted && err instanceof Error && err.message === "Stream failed (404)") {
        try {
          const result = await importLinkedinProfile(file);
          if (!result.ok || !result.structured) {
            const msg = result.error ?? "The model couldn't structure the LinkedIn PDF.";
            setStreamError(msg);
            toast.danger("Couldn't read that profile", msg);
            return;
          }
          setStreamDuration(importStartRef.current != null ? (performance.now() - importStartRef.current) / 1000 : null);
          setStreamText(result.raw_output || JSON.stringify(result.structured, null, 2));
          toast.success("Profile parsed", `${itemCount(result.structured)} items found.`);
          toast.warning("Live stream unavailable", "The backend is still on the older import route, so this run used the non-streaming fallback.");
          await reviewExtraction(result.structured, `Profile PDF · ${result.filename}`);
          return;
        } catch (fallbackErr) {
          const msg = errorMessage(fallbackErr);
          setStreamError(msg);
          toast.danger("Couldn't read the profile", msg);
          return;
        }
      }
      if (!ctrl.signal.aborted) {
        const msg = errorMessage(err);
        setStreamError(msg);
        toast.danger("Couldn't read the profile", msg);
      }
    } finally {
      setImporting(false);
    }
  }

  async function onParseText() {
    if (!pasteText.trim()) {
      toast.warning("Nothing to read", "Paste your LinkedIn profile text first.");
      return;
    }
    setPasteBusy(true);
    try {
      const result = await parseLinkedinText(pasteText);
      if (!result.ok || !result.structured) {
        toast.danger("Structuring failed", result.error ?? "The AI couldn't structure that text.");
        return;
      }
      await reviewExtraction(result.structured, "Pasted profile text", profileUrl.trim() || undefined);
    } catch (err) {
      toast.danger("Structuring failed", errorMessage(err));
    } finally {
      setPasteBusy(false);
    }
  }

  function onApplied(result: ApplyResult) {
    const parts = [
      result.profile_fields ? `${result.profile_fields} profile field${result.profile_fields === 1 ? "" : "s"}` : null,
      result.added ? `${result.added} added` : null,
      result.updated ? `${result.updated} updated` : null,
    ].filter(Boolean);
    toast.success("Profile updated", parts.length ? parts.join(" · ") : "No changes were needed.");
    setPlan(null);
    setOrigin("");
  }

  async function onSaveConfig() {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.warning("Missing details", "Enter both the Client ID and Client Secret.");
      return;
    }
    setSavingConfig(true);
    try {
      await saveLinkedinConfig(clientId.trim(), clientSecret.trim());
      setClientId("");
      setClientSecret("");
      toast.success("LinkedIn app saved", "You can sign in now.");
      status.reload();
    } catch (err) {
      toast.danger("Couldn't save", errorMessage(err));
    } finally {
      setSavingConfig(false);
    }
  }

  async function onDisconnect() {
    try {
      await disconnectLinkedin();
      toast.success("Disconnected");
      setConfirmDisconnect(false);
      status.reload();
    } catch (err) {
      toast.danger("Couldn't disconnect", errorMessage(err));
    }
  }

  async function copyRedirect(uri: string) {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.warning("Copy failed", "Select the URL and copy it manually.");
    }
  }

  const tabs: { value: Tab; label: string }[] = [
    { value: "import", label: "Profile PDF" },
    { value: "paste", label: "Paste text" },
    { value: "connect", label: `Connect${status.data?.connected ? " ✓" : ""}` },
  ];

  const busy = planning || importing;

  return (
    <Page
      eyebrow={reviewing ? "Setup / Review LinkedIn Import" : "Setup / LinkedIn Import"}
      title={reviewing ? "Review LinkedIn Import" : "LinkedIn Import"}
      subtitle={reviewing ? "Check what will be added or updated before anything touches your profile." : undefined}
      bare={reviewing}
      bodyClassName={reviewing ? "px-7 py-6" : "px-7 py-6"}
    >
      {reviewing ? (
        <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5">
          <div className="cll-fade rounded-[18px] border border-border bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-white"
                  style={{ background: "var(--accent-grad)", boxShadow: "0 12px 30px -10px var(--accent-shadow)" }}
                >
                  <LinkedInMark size={18} />
                </span>
                <div className="min-w-0">
                  <div className="text-[17px] font-bold tracking-[-0.02em] text-fg">Imported profile ready for review</div>
                  <p className="mt-1 max-w-[620px] text-[12.5px] leading-[1.55] text-fg-mid">
                    We compared the extracted LinkedIn data against your saved profile. Accept the additions you want,
                    keep anything you prefer, and apply only when it looks right.
                  </p>
                  {origin ? <div className="mt-2 font-mono text-[10.5px] text-fg-low">{origin}</div> : null}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => {
                setPlan(null);
                setOrigin("");
              }}>
                Import another file
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <ReviewStat label="New items" value={String(plan?.counts.new ?? 0)} tone="success" />
              <ReviewStat label="Needs review" value={String(plan?.counts.conflict ?? 0)} tone="warning" />
              <ReviewStat label="Auto-filled" value={String(plan?.counts.fill ?? 0)} tone="accent" />
              <ReviewStat label="Already matching" value={String(plan?.counts.same ?? 0)} tone="neutral" />
            </div>
          </div>

          <ReconcileReview
            plan={plan}
            source="linkedin"
            sourceDetail="LinkedIn import"
            onApplied={onApplied}
            onDiscard={() => {
              setPlan(null);
              setOrigin("");
            }}
          />
        </div>
      ) : (
        <SetupScaffold
          icon={<LinkedInMark size={19} />}
          title="Import from LinkedIn"
          subtitle="Bring your LinkedIn profile in — drop a PDF, Word doc, image, or the .zip data export. Nothing overwrites your profile until you review the changes."
          privacyNote="Read on-device · reviewed before anything changes"
        >
          <Segmented value={tab} onChange={setTab} options={tabs} />

          {/* ── Profile PDF ── */}
          {tab === "import" ? (
            <div className="cll-fade flex flex-col gap-4">
              {/* Clean 3-step Save to PDF guide */}
              <div className="flex flex-col gap-2 rounded-[13px] border border-border bg-surface-2 p-4">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                  <LinkedInMark size={16} className="text-accent-text" />
                  How to export your LinkedIn profile to PDF:
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 pt-1 text-[12px] text-fg-mid">
                  <div className="flex items-center gap-2 rounded-[9px] border border-border bg-surface px-3 py-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-weak font-mono text-[10.5px] font-bold text-accent-text">1</span>
                    <span>Go to your <strong className="text-fg">LinkedIn Profile</strong></span>
                  </div>
                  <div className="flex items-center gap-2 rounded-[9px] border border-border bg-surface px-3 py-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-weak font-mono text-[10.5px] font-bold text-accent-text">2</span>
                    <span>Click on <strong className="text-fg">Resources</strong></span>
                  </div>
                  <div className="flex items-center gap-2 rounded-[9px] border border-border bg-surface px-3 py-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-weak font-mono text-[10.5px] font-bold text-accent-text">3</span>
                    <span>In the menu, click <strong className="text-fg">Save to PDF</strong></span>
                  </div>
                </div>
              </div>

              {busy ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="flex h-[440px] min-h-0 flex-col rounded-[14px] border border-border bg-surface p-5">
                    <div className="flex items-start gap-3">
                      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-accent-weak text-accent-text">
                        <FileText size={18} />
                        {importing ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent" style={{ animation: "cll-pulse 1.3s ease-in-out infinite" }} /> : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold text-fg">{streamFilename ?? "LinkedIn profile PDF"}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-fg-mid">
                          {importing ? (
                            <>
                              <Loader2 size={12} className="animate-spin text-accent-text" />
                              <span>Reading your profile and structuring it live…</span>
                            </>
                          ) : planning ? (
                            <>
                              <Spinner size={12} />
                              <span>Comparing extracted profile against your saved profile…</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <LiveStat label="Profile fields" value={String(liveSummary.profileFields)} />
                      <LiveStat label="Sections found" value={String(liveSummary.readySections)} />
                      <LiveStat label="Items detected" value={String(liveSummary.totalItems)} />
                    </div>

                    <div className="mt-4 grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                      <div className="rounded-[12px] border border-border bg-surface-2/40 p-3.5">
                        <div className="text-[11px] font-semibold tracking-[0.02em] text-fg-low">Profile detected</div>
                        <div className="mt-3 space-y-2 text-[12px] text-fg-mid">
                          <LiveField label="Name" value={[text(liveSummary.profile.name), text(liveSummary.profile.surname)].filter(Boolean).join(" ")} />
                          <LiveField label="Email" value={text(liveSummary.profile.email)} />
                          <LiveField label="LinkedIn" value={text(liveSummary.profile.linkedin)} mono />
                          <LiveField label="GitHub" value={text(liveSummary.profile.github)} mono />
                        </div>
                      </div>

                      <div className="flex min-h-0 flex-col rounded-[12px] border border-border bg-surface-2/40 p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold tracking-[0.02em] text-fg-low">Found so far</div>
                          <div className="font-mono text-[10px] text-fg-low">
                            {(streamDuration ?? 0).toFixed(1)}s
                          </div>
                        </div>
                        <div className="mt-3 min-h-0 space-y-2 overflow-y-auto pr-1">
                          {liveSummary.sections.map((section) => (
                            <div key={String(section.key)} className="rounded-[10px] border border-border bg-surface px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[12px] font-semibold text-fg">{section.label}</span>
                                <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-fg-low">
                                  {section.count}
                                </span>
                              </div>
                              <div className="mt-1.5 text-[11px] leading-[1.45] text-fg-mid">
                                {section.preview.length ? section.preview.join(" · ") : "Waiting for this section…"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {streamError ? (
                      <div className="mt-3 rounded-[12px] border border-danger/30 bg-danger-weak px-3.5 py-3 text-[12px] text-fg-mid">
                        {streamError}
                      </div>
                    ) : null}
                  </div>

                  <div className="h-[440px] min-h-0">
                    <JsonConsole
                      text={streamText}
                      parsing={importing}
                      statusTime={(streamDuration ?? 0).toFixed(1)}
                    />
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void onImportFile(f);
                  }}
                  className={cnDrop(dragging)}
                >
                  <span
                    className="flex h-14 w-14 items-center justify-center rounded-[16px] border border-border-strong bg-surface-2 text-accent-text"
                    style={{ boxShadow: "0 0 30px -12px var(--accent-shadow)" }}
                  >
                    <UploadCloud size={24} />
                  </span>
                  <p className="text-[13.5px] text-fg-mid">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="font-semibold text-accent-text underline-offset-2 hover:underline"
                    >
                      Choose a file
                    </button>{" "}
                    or drag it here
                  </p>
                  <p className="font-mono text-[10px] tracking-[0.4px] text-fg-low">PDF · WORD · IMAGE · .ZIP</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={`${FILE_ACCEPT},.zip,application/zip`}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onImportFile(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
            </div>
          ) : null}

          {/* ── Paste text ── */}
          {tab === "paste" ? (
            <div className="cll-fade flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5">
              <p className="text-[12.5px] leading-relaxed text-fg-mid">
                Open your LinkedIn profile, copy the sections you want (About, Experience, Education, Skills…), and paste
                them here. Your configured model turns the text into structured profile data.
              </p>
              <Field label="Profile URL (optional)" htmlFor="li-url">
                <Input
                  id="li-url"
                  value={profileUrl}
                  onChange={(e) => setProfileUrl(e.target.value)}
                  placeholder="https://www.linkedin.com/in/your-handle"
                />
              </Field>
              <Field label="Profile text" htmlFor="li-text">
                <Textarea
                  id="li-text"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste your About, Experience, Education, Skills…"
                  className="min-h-[160px]"
                />
              </Field>
              <div className="flex justify-end">
                <Button variant="primary" size="md" loading={pasteBusy || planning} onClick={onParseText}>
                  <Sparkles size={14} /> Structure with AI
                </Button>
              </div>
            </div>
          ) : null}

          {/* ── Connect (OAuth) ── */}
          {tab === "connect" ? (
            <AsyncBoundary
              state={status}
              skeleton={
                <div className="flex items-center justify-center py-16 text-fg-mid">
                  <Spinner size={20} />
                </div>
              }
            >
              {(st) => (
                <div className="cll-fade flex flex-col gap-4">
                  <div className="flex items-start gap-2.5 rounded-[13px] border border-border bg-surface-2 px-4 py-3">
                    <LinkedInMark size={15} className="mt-0.5 shrink-0 text-accent-text" />
                    <p className="text-[12.5px] leading-relaxed text-fg-mid">
                      Signing in verifies your identity and prefills your name and email. LinkedIn only shares those over
                      sign-in — for your full work history, education, and skills use the{" "}
                      <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => setTab("import")}>
                        profile PDF
                      </button>
                      .
                    </p>
                  </div>

                  {st.connected ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-surface px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-weak text-success">
                          <Check size={18} strokeWidth={2.6} />
                        </span>
                        <div>
                          <p className="text-[13.5px] font-semibold text-fg">Connected</p>
                          {st.name ? <p className="text-[12px] text-fg-low">Signed in as {st.name}</p> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => (window.location.href = oauthStartUrl())}>
                          <LogIn size={14} /> Re-connect
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)}>
                          <Unplug size={14} /> Disconnect
                        </Button>
                      </div>
                    </div>
                  ) : st.configured ? (
                    <div className="flex flex-col items-center gap-3 rounded-[14px] border border-border bg-surface py-10 text-center">
                      <p className="text-[13px] text-fg-mid">Your LinkedIn app is set up. Sign in to connect your account.</p>
                      <Button variant="primary" size="md" onClick={() => (window.location.href = oauthStartUrl())}>
                        <LinkedInMark size={15} /> Sign in with LinkedIn
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5">
                      <div>
                        <p className="mb-2 text-[12px] font-semibold text-fg">One-time setup</p>
                        <ol className="ml-4 list-decimal space-y-1.5 text-[12.5px] leading-relaxed text-fg-mid">
                          <li>
                            Create an app at{" "}
                            <a
                              href="https://www.linkedin.com/developers/apps"
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-accent-text hover:underline"
                            >
                              linkedin.com/developers <ExternalLink size={11} />
                            </a>{" "}
                            and add the <span className="font-semibold text-fg">Sign In with LinkedIn using OpenID Connect</span> product.
                          </li>
                          <li>Add this exact redirect URL to the app's Auth settings:</li>
                        </ol>
                        <div className="mt-2 flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate rounded-[8px] border border-border bg-input px-2.5 py-2 font-mono text-[11.5px] text-fg">
                            {st.redirect_uri}
                          </code>
                          <Button variant="outline" size="sm" onClick={() => copyRedirect(st.redirect_uri)}>
                            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Client ID" htmlFor="li-cid">
                          <Input id="li-cid" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="86xxxxxxxxxxxx" />
                        </Field>
                        <Field label="Client Secret" htmlFor="li-secret">
                          <Input
                            id="li-secret"
                            type="password"
                            value={clientSecret}
                            onChange={(e) => setClientSecret(e.target.value)}
                            placeholder="••••••••••••"
                          />
                        </Field>
                      </div>
                      <div className="flex justify-end">
                        <Button variant="primary" size="md" loading={savingConfig} onClick={onSaveConfig}>
                          <Check size={14} /> Save LinkedIn app
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </AsyncBoundary>
          ) : null}
        </SetupScaffold>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        tone="danger"
        icon={<Unplug size={20} />}
        title="Disconnect LinkedIn?"
        description="This forgets the stored sign-in on this device. Your imported profile data stays."
        confirmLabel="Disconnect"
        onConfirm={onDisconnect}
      />
    </Page>
  );
}

function LiveStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface-2/40 px-3 py-2.5">
      <div className="text-[10.5px] font-semibold tracking-[0.02em] text-fg-low">{label}</div>
      <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-fg">{value}</div>
    </div>
  );
}

function LiveField({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[10px] border border-border bg-surface px-3 py-2">
      <span className="text-[11px] font-semibold text-fg-low">{label}</span>
      <span className={mono ? "max-w-[70%] truncate font-mono text-[11px] text-fg" : "max-w-[70%] text-right text-[11.5px] text-fg"}>
        {value || "Waiting…"}
      </span>
    </div>
  );
}

function ReviewStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "accent" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
      ? "text-warning"
      : tone === "accent"
      ? "text-accent-text"
      : "text-fg";

  return (
    <div className="rounded-[12px] border border-border bg-surface-2/50 px-3.5 py-3">
      <div className="text-[10.5px] font-semibold tracking-[0.02em] text-fg-low">{label}</div>
      <div className={`mt-1 text-[20px] font-bold tracking-[-0.03em] ${toneClass}`}>{value}</div>
    </div>
  );
}
