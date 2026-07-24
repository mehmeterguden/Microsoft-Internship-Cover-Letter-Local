import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Copy, ExternalLink, LogIn, Sparkles, Unplug, UploadCloud } from "lucide-react";
import { Page } from "@/components/common/Page";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ReconcileReview } from "@/components/common/ReconcileReview";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/feedback";
import { SetupEmpty, SetupIntro } from "@/components/setup/SetupScaffold";
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
} from "@/api/linkedin";
import { planReconcile, type ApplyResult, type ReconcilePlan } from "@/api/reconcile";

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

  const [pasteText, setPasteText] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

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
    if (!name.endsWith(".pdf") && !name.endsWith(".zip")) {
      toast.warning("Wrong file", "Upload your LinkedIn profile PDF (Resources → Save to PDF).");
      return;
    }
    setImporting(true);
    try {
      const result = await importLinkedinProfile(file);
      if (!result.ok || !result.structured) {
        toast.danger("Couldn't read that profile", result.error ?? "The model couldn't structure the PDF text.");
        return;
      }
      toast.success("Profile parsed", `${itemCount(result.structured)} items found.`);
      await reviewExtraction(result.structured, `Profile PDF · ${result.filename}`);
    } catch (err) {
      toast.danger("Couldn't read the profile", errorMessage(err));
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
      eyebrow="Setup / LinkedIn Import"
      title={
        <span className="inline-flex items-center gap-2.5">
          <LinkedInMark size={20} className="text-accent-text" />
          LinkedIn Import
        </span>
      }
      subtitle="Bring your LinkedIn profile in — nothing overwrites your profile until you review the changes."
      bodyClassName="px-7 py-6"
    >
      <div className="mx-auto flex max-w-[760px] flex-col gap-5">
        <SetupIntro
          icon={<LinkedInMark size={19} />}
          title="Import from LinkedIn"
          subtitle="Bring your LinkedIn profile in — export it as a PDF and drop it here. Nothing overwrites your profile until you review the changes."
          privacyNote="Read on-device · reviewed before anything changes"
        />
        <Segmented value={tab} onChange={setTab} options={tabs} />

        {/* ── Profile PDF ── */}
        {tab === "import" ? (
          <div className="cll-fade flex flex-col gap-4">
            <div className="flex items-start gap-2.5 rounded-[13px] border border-border bg-surface-2 px-4 py-3">
              <LinkedInMark size={15} className="mt-0.5 shrink-0 text-accent-text" />
              <p className="text-[12.5px] leading-relaxed text-fg-mid">
                Open your LinkedIn profile, click <span className="font-semibold text-fg">Resources → Save to PDF</span>, and
                upload the PDF here. Its text is read and structured by your configured model — with a local model (the
                default) nothing leaves your device.
              </p>
            </div>

            {busy ? (
              <div className="flex flex-col items-center gap-3 rounded-[14px] border border-border bg-surface py-14">
                <Spinner size={26} />
                <p className="text-[13px] text-fg-mid">{importing ? "Reading your profile…" : "Comparing with your profile…"}</p>
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
                <p className="font-mono text-[10px] tracking-[0.4px] text-fg-low">LINKEDIN PROFILE · .PDF</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,application/pdf,.zip,application/zip"
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

        {/* ── Reconcile review (shared by PDF + paste) ── */}
        {plan ? (
          <div className="flex flex-col gap-3">
            {origin ? (
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">Imported from</span>
                <span className="font-mono text-[10px] text-fg-low">{origin}</span>
              </div>
            ) : null}
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
        ) : !busy && tab !== "connect" ? (
          <SetupEmpty
            icon={<LinkedInMark size={24} />}
            title="Nothing imported yet"
            description={
              tab === "import"
                ? "Upload your LinkedIn profile PDF above — we'll compare it with your profile before anything changes."
                : "Paste your profile text above — we'll compare it with your profile before anything changes."
            }
          />
        ) : null}
      </div>

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
