import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, Check, Copy, Download, FileDown, FileText, Info, RotateCw, Save,
  ShieldAlert, ShieldCheck, Sparkles,
} from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import { Segmented, Slider, Toggle } from "@/components/ui/controls";
import { Spinner } from "@/components/ui/feedback";
import {
  exportLetter, reviewCoverLetter, scanPii, streamCoverLetter,
  type ExportFormat, type LetterLength, type PiiFinding, type ReviewClaim,
} from "@/api/coverLetter";
import { errorMessage } from "@/api/client";
import { createJob, getJob, updateJob } from "@/api/jobs";
import type { Tone } from "@/api/types";
import { toast } from "@/store/toast";

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "warm", label: "Warm" },
  { value: "confident", label: "Confident" },
  { value: "concise", label: "Concise" },
];

function lengthFor(pct: number): { length: LetterLength; label: string; words: number } {
  if (pct < 34) return { length: "short", label: "Brief", words: 210 };
  if (pct > 66) return { length: "detailed", label: "Detailed", words: 430 };
  return { length: "standard", label: "Standard", words: 310 };
}

export function Write() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobPosting, setJobPosting] = useState("");
  const [tone, setTone] = useState<Tone>("warm");
  const [lengthPct, setLengthPct] = useState(50);
  const [grounded, setGrounded] = useState(true);

  const [letter, setLetter] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);

  const [claims, setClaims] = useState<ReviewClaim[] | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [pii, setPii] = useState<PiiFinding[]>([]);

  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const jobIdRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [searchParams] = useSearchParams();
  const bootRef = useRef(false);

  const { length, label: lenLabel, words } = useMemo(() => lengthFor(lengthPct), [lengthPct]);

  // Reopen a saved draft (?job=id, from Cover Letters / Home) or prefill from a
  // research / company hand-off (?company=&role=&jd=).
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const jobId = searchParams.get("job");
    if (jobId) {
      getJob(Number(jobId))
        .then((job) => {
          setCompany(job.company || "");
          setRole(job.role || "");
          setJobPosting(job.job_description || "");
          const text = job.letter?.text ?? "";
          if (text) {
            setLetter(text);
            setDone(true);
          }
          jobIdRef.current = job.id ?? Number(jobId);
        })
        .catch(() => toast.danger("Couldn't open that letter"));
      return;
    }
    const c = searchParams.get("company");
    const r = searchParams.get("role");
    const jd = searchParams.get("jd");
    if (c) setCompany(c);
    if (r) setRole(r);
    if (jd) setJobPosting(jd);
  }, [searchParams]);

  async function runReview(text: string) {
    if (!grounded || !text.trim()) {
      setClaims(null);
      return;
    }
    setReviewing(true);
    try {
      setClaims(await reviewCoverLetter(text));
    } catch {
      setClaims(null); // advisory — never block on a failed review
    } finally {
      setReviewing(false);
    }
  }

  // Independent of the claim-check toggle: the PII shield is a privacy setting.
  async function runPiiScan(text: string) {
    if (!text.trim()) {
      setPii([]);
      return;
    }
    try {
      setPii((await scanPii(text)).findings);
    } catch {
      setPii([]); // advisory — never block on a failed scan
    }
  }

  async function generate() {
    if (!company.trim()) {
      toast.warning("Add a company first", "Tell me who you're applying to.");
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLetter("");
    setClaims(null);
    setPii([]);
    setDone(false);
    setStreaming(true);
    let acc = "";
    try {
      await streamCoverLetter(
        {
          company_name: company.trim(),
          role_title: role.trim() || null,
          job_description: jobPosting.trim() || null,
          tone,
          length,
        },
        (ev) => {
          if (ev.type === "token") {
            acc += ev.text;
            setLetter(acc);
          } else if (ev.type === "fatal") {
            toast.danger("Generation failed", ev.error);
          }
        },
        ac.signal,
      );
      setStreaming(false);
      if (acc.trim()) {
        setDone(true);
        void runReview(acc);
        void runPiiScan(acc);
      }
    } catch (e) {
      setStreaming(false);
      if (!ac.signal.aborted) toast.danger("Generation failed", e instanceof Error ? e.message : String(e));
    }
  }

  function copyLetter() {
    navigator.clipboard?.writeText(letter).then(
      () => toast.success("Copied to clipboard"),
      () => toast.danger("Couldn't copy"),
    );
  }
  function downloadTxt() {
    const blob = new Blob([letter], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cover-letter-${(company || "draft").toLowerCase().replace(/\s+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded .txt");
  }
  async function download(format: ExportFormat) {
    if (!letter.trim() || exporting) return;
    setExporting(format);
    try {
      await exportLetter(format, { text: letter, company_name: company || null, role_title: role || null });
      toast.success(format === "pdf" ? "Exported PDF" : "Exported Word (.docx)");
    } catch (err) {
      toast.danger("Couldn't export", errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  async function saveDraft() {
    if (!letter.trim()) {
      toast.warning("Nothing to save yet", "Generate a letter first.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        company: company.trim() || "Untitled",
        role: role.trim() || "",
        job_description: jobPosting.trim() || null,
        status: "draft" as const,
        letter: { text: letter, completed: false },
      };
      if (jobIdRef.current != null) {
        await updateJob(jobIdRef.current, { ...payload, id: jobIdRef.current });
      } else {
        const created = await createJob(payload);
        jobIdRef.current = created.id ?? null;
      }
      toast.success("Draft saved", "Find it under Cover Letters.");
    } catch (e) {
      toast.danger("Couldn't save", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const hasLetter = letter.trim().length > 0;

  return (
    <Page
      eyebrow="GENERATE / WRITE LETTER"
      title="Write letter"
      subtitle="A grounded first draft in your voice — written only from your real profile."
      actions={
        <>
          <Button variant="outline" size="md" onClick={saveDraft} loading={saving} disabled={!hasLetter}>
            <Save size={15} /> Save draft
          </Button>
          <Button variant="primary" size="md" onClick={generate} loading={streaming}>
            {done ? <RotateCw size={15} /> : <Sparkles size={15} />}
            {done ? "Regenerate" : "Generate"}
          </Button>
        </>
      }
      bodyClassName="px-7 py-5"
    >
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ── Left: inputs ─────────────────────────────── */}
        <div className="cll-fade flex min-w-0 flex-col gap-4">
          <section className="rounded-[14px] border border-border bg-surface p-5">
            <div className="text-[15px] font-semibold text-fg">What are you applying to?</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-mid">
              Fill in the details and I&apos;ll ground the draft in your profile.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Company">
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Anthropic" />
              </Field>
              <Field label="Role">
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. ML Engineer" />
              </Field>
            </div>
            <div className="mt-3">
              <Field label={<>Job posting <span className="text-fg-low">· optional</span></>}>
                <Textarea value={jobPosting} onChange={(e) => setJobPosting(e.target.value)} placeholder="Paste the full description for a sharper draft…" />
              </Field>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5">
            <Field label="Tone">
              <Segmented options={TONES} value={tone} onChange={setTone} />
            </Field>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Length</Label>
                <span className="font-mono text-[10px] tracking-[0.3px] text-accent-text">{lenLabel} · ~{words} words</span>
              </div>
              <Slider value={lengthPct} min={0} max={100} onChange={setLengthPct} aria-label="Letter length" />
              <div className="flex justify-between font-mono text-[9.5px] uppercase tracking-[0.6px] text-fg-low">
                <span>Brief</span><span>Detailed</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[11px] border border-border bg-surface-2 px-3.5 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-fg">Check claims before sending</div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-fg-mid">Flag anything the draft states that your profile doesn&apos;t back up.</p>
              </div>
              <Toggle checked={grounded} onChange={setGrounded} aria-label="Check claims before sending" />
            </div>
          </section>
        </div>

        {/* ── Right: letter (top) + review (below) ─────── */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Letter pane */}
          <section className="cll-fade relative flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-reading">
            {streaming ? (
              <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-border bg-input px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.8px] text-accent-text">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" style={{ animation: "cll-pulse 1.3s ease-in-out infinite" }} />
                Streaming
              </div>
            ) : null}

            {!hasLetter && !streaming ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-[14px] border border-border-strong bg-surface-2 text-accent-text">
                  <Sparkles size={22} />
                </div>
                <div className="text-[15px] font-semibold text-fg">Your letter appears here</div>
                <p className="mt-1 max-w-xs text-[13px] text-fg-mid">Fill in the company and hit <b className="text-fg">Generate</b> — it streams in, grounded in your profile.</p>
              </div>
            ) : streaming ? (
              <div className="flex-1 overflow-auto p-7 sm:px-8">
                <div className="max-w-[600px] whitespace-pre-wrap text-[15px] leading-[1.85] text-reading-ink">
                  {letter}
                  <span className="cll-caret" aria-hidden />
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col">
                <textarea
                  value={letter}
                  onChange={(e) => setLetter(e.target.value)}
                  spellCheck
                  className="min-h-[360px] flex-1 resize-none border-0 bg-transparent p-7 text-[15px] leading-[1.85] text-reading-ink outline-none sm:px-8"
                  aria-label="Cover letter (editable)"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
                  <span className="flex items-center gap-1.5 text-[10.5px] text-fg-low">
                    <Info size={12} strokeWidth={1.6} /> AI-generated — edit freely, review before sending
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="xs" onClick={copyLetter}><Copy size={13} /> Copy</Button>
                    <Button variant="ghost" size="xs" onClick={downloadTxt}><Download size={13} /> .txt</Button>
                    <Button variant="ghost" size="xs" onClick={() => download("pdf")} loading={exporting === "pdf"} disabled={exporting !== null}>
                      <FileDown size={13} /> PDF
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => download("docx")} loading={exporting === "docx"} disabled={exporting !== null}>
                      <FileText size={13} /> Word
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Review panel — only when checking is on and a letter exists */}
          {grounded && done ? (
            <section className="cll-fade rounded-[14px] border border-border bg-surface p-[18px]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                  <ShieldCheck size={16} strokeWidth={1.6} className="text-success" /> Claim check
                </div>
                {reviewing ? (
                  <span className="flex items-center gap-1.5 font-mono text-[10px] text-fg-mid"><Spinner size={12} /> checking…</span>
                ) : (
                  <button type="button" onClick={() => { void runReview(letter); void runPiiScan(letter); }} className="flex items-center gap-1.5 font-mono text-[10px] text-accent-text hover:brightness-110">
                    <RotateCw size={11} /> re-check
                  </button>
                )}
              </div>

              {reviewing ? (
                <p className="text-[12.5px] text-fg-mid">Looking for anything your profile doesn&apos;t back up…</p>
              ) : claims && claims.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[12px] text-fg-mid">These make a specific claim your profile doesn&apos;t clearly support — double-check or edit before sending:</p>
                  {claims.map((c, i) => (
                    <div key={i} className="rounded-[10px] border border-[color:var(--warning)]/25 bg-warning-weak px-3 py-2.5">
                      <div className="flex items-start gap-2 text-[12.5px] text-fg">
                        <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" />
                        <span className="italic">“{c.text}”</span>
                      </div>
                      {c.reason ? <div className="mt-1 pl-[21px] text-[11.5px] text-fg-mid">{c.reason}</div> : null}
                    </div>
                  ))}
                </div>
              ) : claims === null ? (
                <p className="text-[12.5px] text-fg-mid">
                  Not checked yet — hit <b className="text-fg">re-check</b> to scan this letter against your profile.
                </p>
              ) : (
                <div className="flex items-center gap-2.5 rounded-[10px] border border-[color:var(--success)]/25 bg-success-weak px-3 py-3 text-[13px] text-fg">
                  <Check size={16} strokeWidth={2.4} className="shrink-0 text-success" />
                  Every claim is backed by your profile. Nothing to double-check.
                </div>
              )}
            </section>
          ) : null}

          {/* PII shield — warns about personal/sensitive data (honors the Settings mode) */}
          {done && pii.length > 0 ? (
            <section className="cll-fade rounded-[14px] border border-[color:var(--warning)]/30 bg-warning-weak p-[18px]">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg">
                <ShieldAlert size={16} strokeWidth={1.7} className="text-warning" /> Personal data detected
              </div>
              <p className="mb-3 text-[12px] leading-relaxed text-fg-mid">
                This letter contains what looks like personal or sensitive information. Remove anything you didn&apos;t mean to send — detected locally, nothing left your device.
              </p>
              <div className="flex flex-col gap-2">
                {pii.map((f) => {
                  const dot = f.severity === "high" ? "bg-danger" : f.severity === "medium" ? "bg-warning" : "bg-fg-low";
                  return (
                    <div key={f.type} className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface px-3 py-2.5">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[12.5px] text-fg">
                          <span className="font-semibold">{f.label}</span>
                          {f.count > 1 ? <span className="font-mono text-[10px] text-fg-low">×{f.count}</span> : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {f.samples.map((s, i) => (
                            <span key={i} className="rounded-[6px] bg-input px-2 py-[2px] font-mono text-[10px] text-fg-mid">{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
