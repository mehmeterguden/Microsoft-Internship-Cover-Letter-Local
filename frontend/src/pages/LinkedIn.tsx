import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Award,
  Briefcase,
  Check,
  ClipboardPaste,
  Copy,
  ExternalLink,
  FileArchive,
  FolderGit2,
  GraduationCap,
  Languages as LanguagesIcon,
  Linkedin,
  Link2,
  LogIn,
  ShieldCheck,
  Sparkles,
  Unplug,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { AsyncBoundary } from "@/components/common/AsyncBoundary";
import { EmptyState } from "@/components/common/EmptyState";
import { FileDropzone } from "@/components/common/FileDropzone";
import { DevInspector } from "@/components/common/DevInspector";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { CVExtraction } from "@/api/types";
import {
  disconnectLinkedin,
  importLinkedinExport,
  linkedinStatus,
  oauthStartUrl,
  parseLinkedinText,
  saveLinkedinConfig,
  saveLinkedinImport,
} from "@/api/linkedin";
import { useAsync } from "@/lib/useAsync";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";

type Tab = "import" | "paste" | "connect";

/** Sections shown as summary tiles in the review panel, in reading order. */
const REVIEW_SECTIONS: { key: keyof CVExtraction; label: string; icon: LucideIcon }[] = [
  { key: "experiences", label: "Experience", icon: Briefcase },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "skills", label: "Skills", icon: Sparkles },
  { key: "certificates", label: "Certificates", icon: Award },
  { key: "languages", label: "Languages", icon: LanguagesIcon },
  { key: "projects", label: "Projects", icon: FolderGit2 },
  { key: "links", label: "Links", icon: Link2 },
];

const OAUTH_ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  state_mismatch: "Sign-in couldn't be verified — please try again.",
  exchange_failed: "LinkedIn rejected the sign-in. Check your app's Client ID/Secret and redirect URL.",
};

function sectionCount(extraction: CVExtraction, key: keyof CVExtraction): number {
  const value = extraction[key];
  return Array.isArray(value) ? value.length : 0;
}

function totalItems(extraction: CVExtraction): number {
  return REVIEW_SECTIONS.reduce((sum, s) => sum + sectionCount(extraction, s.key), 0);
}

export function LinkedIn() {
  const status = useAsync(linkedinStatus, []);
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState<Tab>("import");
  const [extraction, setExtraction] = useState<CVExtraction | null>(null);
  const [origin, setOrigin] = useState<string>(""); // where the extraction came from, for the review header
  const [profileUrl, setProfileUrl] = useState("");
  const [importing, setImporting] = useState(false);

  // Paste tab
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);

  // Connect tab
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Review
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Handle the OAuth return (?linkedin_connected=1&name=… or ?linkedin_error=…).
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
      toast.error(new Error(OAUTH_ERRORS[error] ?? "LinkedIn sign-in failed."), "Couldn't connect");
    }
    // Clear the flags so a refresh doesn't re-fire the toast.
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function acceptExtraction(next: CVExtraction, from: string) {
    setExtraction(next);
    setOrigin(from);
    setSaved(false);
  }

  async function onImportFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.warning("Wrong file", "Upload the .zip archive LinkedIn emails you.");
      return;
    }
    setImporting(true);
    try {
      const result = await importLinkedinExport(file);
      acceptExtraction(result.structured, `Data export · ${result.filename}`);
      toast.success("Export parsed", `${totalItems(result.structured)} items found — review, then save.`);
    } catch (err) {
      toast.error(err, "Couldn't read the export");
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
        toast.error(new Error(result.error ?? "The AI couldn't structure that text."), "Structuring failed");
        return;
      }
      acceptExtraction(result.structured, "Pasted profile text");
      toast.success("Profile structured", `${totalItems(result.structured)} items found — review, then save.`);
    } catch (err) {
      toast.error(err, "Structuring failed");
    } finally {
      setPasteBusy(false);
    }
  }

  async function onSave() {
    if (!extraction) return;
    setSaving(true);
    try {
      const result = await saveLinkedinImport(extraction, profileUrl.trim() || undefined);
      const added = Object.values(result.saved).reduce((a, b) => a + b, 0);
      const detail = [
        result.profile_fields ? `${result.profile_fields} identity field${result.profile_fields === 1 ? "" : "s"}` : null,
        added ? `${added} item${added === 1 ? "" : "s"} added` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      toast.success("Saved to your profile", detail || "Everything was already on your profile.");
      setSaved(true);
    } catch (err) {
      toast.error(err, "Couldn't save");
    } finally {
      setSaving(false);
    }
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
      toast.error(err, "Couldn't save");
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
      toast.error(err, "Couldn't disconnect");
    }
  }

  async function copyRedirect() {
    if (!status.data?.redirect_uri) return;
    try {
      await navigator.clipboard.writeText(status.data.redirect_uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.warning("Copy failed", "Select the URL and copy it manually.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Build your profile"
        title="LinkedIn import"
        icon={Linkedin}
        description="Bring your LinkedIn profile into your local profile — upload the data export for everything, paste your profile text, or connect your account. Nothing is saved until you review and confirm."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="import">
            <FileArchive size={14} /> Data export
          </TabsTrigger>
          <TabsTrigger value="paste">
            <ClipboardPaste size={14} /> Paste text
          </TabsTrigger>
          <TabsTrigger value="connect">
            <Linkedin size={14} /> Connect{status.data?.connected ? " ✓" : ""}
          </TabsTrigger>
        </TabsList>

        {/* ── Data export (recommended, fully local) ── */}
        <TabsContent value="import">
          <Card>
            <CardContent className="pt-5">
              <div className="mb-4 flex items-start gap-2.5 rounded-[12px] border border-border bg-surface-2 px-4 py-3">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent-ink" />
                <p className="text-[13px] leading-relaxed text-text-2">
                  Most complete and fully private — parsed on your machine, no upload to any server, no AI needed. In
                  LinkedIn go to{" "}
                  <span className="font-semibold text-text">Settings &amp; Privacy → Data privacy → Get a copy of your data</span>
                  , pick your data, and upload the ZIP they email you.
                </p>
              </div>
              {importing ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Spinner size={32} />
                  <p className="text-[14px] text-text-2">Reading your export…</p>
                </div>
              ) : (
                <FileDropzone accept=".zip,application/zip" onFile={onImportFile} hint="LinkedIn export · .zip" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Paste text (LLM-structured) ── */}
        <TabsContent value="paste">
          <Card>
            <CardContent className="grid gap-4 pt-5">
              <p className="text-[13px] leading-relaxed text-text-2">
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
                  className="min-h-44"
                />
              </Field>
              <div className="flex justify-end">
                <Button onClick={onParseText} loading={pasteBusy} disabled={!pasteText.trim()}>
                  <Sparkles size={16} /> Structure with AI
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Connect (OAuth "Sign in with LinkedIn") ── */}
        <TabsContent value="connect">
          <AsyncBoundary loading={status.loading} error={status.error} onRetry={status.reload}>
            <Card>
              <CardContent className="grid gap-4 pt-5">
                <div className="flex items-start gap-2.5 rounded-[12px] border border-border bg-surface-2 px-4 py-3">
                  <Linkedin size={16} className="mt-0.5 shrink-0 text-blue" />
                  <p className="text-[13px] leading-relaxed text-text-2">
                    Signing in verifies your identity and prefills your name and email. LinkedIn only shares those over
                    sign-in — for your full work history, education, and skills use the{" "}
                    <button type="button" className="font-semibold text-accent-ink hover:underline" onClick={() => setTab("import")}>
                      data export
                    </button>{" "}
                    above.
                  </p>
                </div>

                {status.data?.connected ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-surface px-4 py-3.5 shadow-soft">
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-blue-soft text-blue">
                        <Check size={20} />
                      </span>
                      <div>
                        <p className="text-[14px] font-bold text-text">Connected</p>
                        {status.data.name && <p className="text-[13px] text-text-3">Signed in as {status.data.name}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" asChild>
                        <a href={oauthStartUrl()}>
                          <LogIn size={15} /> Re-connect
                        </a>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(true)}>
                        <Unplug size={15} /> Disconnect
                      </Button>
                    </div>
                  </div>
                ) : status.data?.configured ? (
                  <div className="flex flex-col items-center gap-3 rounded-[12px] border border-dashed border-border-strong bg-surface-2 px-6 py-9 text-center">
                    <p className="text-[14px] text-text-2">Your LinkedIn app is set up. Sign in to connect your account.</p>
                    <Button asChild>
                      <a href={oauthStartUrl()}>
                        <Linkedin size={16} /> Sign in with LinkedIn
                      </a>
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <div className="rounded-[12px] border border-border bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-text-2">
                      <p className="mb-2 font-semibold text-text">One-time setup</p>
                      <ol className="ml-4 list-decimal space-y-1.5">
                        <li>
                          Create an app at{" "}
                          <a
                            href="https://www.linkedin.com/developers/apps"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline"
                          >
                            linkedin.com/developers <ExternalLink size={12} />
                          </a>{" "}
                          and add the <span className="font-semibold text-text">Sign In with LinkedIn using OpenID Connect</span> product.
                        </li>
                        <li>Add this exact redirect URL to the app's Auth settings:</li>
                      </ol>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-[8px] border border-border bg-surface px-2.5 py-1.5 font-mono text-[12px] text-text">
                          {status.data?.redirect_uri ?? "…"}
                        </code>
                        <Button variant="secondary" size="sm" onClick={copyRedirect}>
                          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
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
                      <Button onClick={onSaveConfig} loading={savingConfig} disabled={!clientId.trim() || !clientSecret.trim()}>
                        <Check size={16} /> Save LinkedIn app
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </AsyncBoundary>
        </TabsContent>
      </Tabs>

      {/* ── Review & save (shared by export + paste) ── */}
      {extraction && (
        <div className="mt-6 grid gap-4" style={{ animation: "cll-rise 0.4s both" }}>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-ink">Review what we found</span>
            <span className="h-px flex-1 bg-line" />
            <Badge tone="blue">{origin}</Badge>
          </div>

          <Card>
            <CardContent className="pt-5">
              <IdentitySummary extraction={extraction} />

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {REVIEW_SECTIONS.map(({ key, label, icon: Icon }) => {
                  const count = sectionCount(extraction, key);
                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-[12px] border px-2 py-3 text-center",
                        count > 0 ? "border-border bg-surface-2" : "border-dashed border-border opacity-55",
                      )}
                    >
                      <Icon size={16} className={count > 0 ? "text-accent-ink" : "text-text-3"} />
                      <span className="font-display text-[18px] font-extrabold leading-none text-text">{count}</span>
                      <span className="text-[10.5px] font-medium uppercase tracking-wide text-text-3">{label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 border-t border-border pt-4">
                <Field label="Your LinkedIn profile URL" htmlFor="li-save-url" hint="Saved to your profile — the one thing an export leaves out.">
                  <Input
                    id="li-save-url"
                    value={profileUrl}
                    onChange={(e) => setProfileUrl(e.target.value)}
                    placeholder="https://www.linkedin.com/in/your-handle"
                  />
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                {saved ? (
                  <>
                    <span className="mr-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-good">
                      <Check size={16} /> Saved to your profile
                    </span>
                    <Button variant="secondary" asChild>
                      <Link to="/profile">View profile</Link>
                    </Button>
                    <Button variant="ghost" onClick={() => setExtraction(null)}>
                      Import more
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => setExtraction(null)}>
                      Discard
                    </Button>
                    <Button onClick={onSave} loading={saving}>
                      <Check size={16} /> Save to profile
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <p className="flex items-center gap-1.5 text-[12px] text-text-3">
            <Link2 size={13} /> Saving fills only empty identity fields and adds new items — your CV, manual, and GitHub
            entries are never overwritten.
          </p>

          <DevInspector json={extraction} title="Developer · view parsed data (JSON)" />
        </div>
      )}

      {!extraction && tab !== "connect" && (
        <EmptyState
          className="mt-6"
          icon={Linkedin}
          title="Nothing imported yet"
          description={
            tab === "import"
              ? "Upload your LinkedIn data export above — we'll show you everything before anything is saved."
              : "Paste your profile text above and structure it — we'll show you the result before saving."
          }
        />
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect LinkedIn?"
        description="This forgets the stored sign-in on this device. Your imported profile data stays."
        confirmLabel="Disconnect"
        destructive
        onConfirm={onDisconnect}
      />
    </>
  );
}

function IdentitySummary({ extraction }: { extraction: CVExtraction }) {
  const { name, surname, email, summary } = extraction.profile;
  const fullName = [name, surname].filter(Boolean).join(" ");
  if (!fullName && !email && !summary) return null;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-soft text-blue">
        <Linkedin size={22} />
      </span>
      <div className="min-w-0">
        {fullName && <p className="text-[16px] font-bold text-text">{fullName}</p>}
        {email && <p className="text-[13px] text-text-3">{email}</p>}
        {summary && <p className="mt-1 line-clamp-2 max-w-2xl text-[13px] text-text-2">{summary}</p>}
      </div>
    </div>
  );
}
