import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Download,
  FileDown,
  FileText,
  HelpCircle,
  Info,
  RotateCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { Page } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import { Segmented, Slider, Toggle } from "@/components/ui/controls";
import { Pill, Spinner } from "@/components/ui/feedback";
import {
  exportLetter,
  inlineEditCvLetter,
  reviewCoverLetter,
  scanPii,
  streamCoverLetter,
  type ExportFormat,
  type LetterLength,
  type PiiFinding,
  type ReviewClaim,
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

  // Selection AI Toolbar state
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [aiMode, setAiMode] = useState<"menu" | "custom" | "ask">("menu");
  const [aiInput, setAiInput] = useState("");
  const [aiWorking, setAiWorking] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);

  const { length, label: lenLabel, words } = useMemo(() => lengthFor(lengthPct), [lengthPct]);

  // Reopen a saved draft (?job=id) or prefill from research/company hand-off
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
      setClaims(null);
    } finally {
      setReviewing(false);
    }
  }

  async function runPiiScan(text: string) {
    if (!text.trim()) {
      setPii([]);
      return;
    }
    try {
      setPii((await scanPii(text)).findings);
    } catch {
      setPii([]);
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
    setSelectedText("");
    setSelectionRange(null);
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

  /* ── Selection Listener for Inline AI Box ────────────────────── */
  const handleTextareaSelect = () => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    if (start != null && end != null && end - start >= 3) {
      const sel = letter.substring(start, end);
      if (sel.trim().length >= 3) {
        setSelectedText(sel);
        setSelectionRange({ start, end });
        setAiMode("menu");
        setAiAnswer(null);
      }
    }
  };

  const handleInlineAction = async (action: "regenerate" | "custom" | "ask", customPrompt?: string) => {
    if (!selectedText || !selectionRange) return;
    setAiWorking(true);
    setAiAnswer(null);
    try {
      const res = await inlineEditCvLetter({
        selected_text: selectedText,
        action,
        instruction: customPrompt || aiInput,
        full_letter: letter,
        company_name: company,
        role_title: role,
      });

      if (action === "ask") {
        setAiAnswer(res.result);
      } else {
        const updated =
          letter.substring(0, selectionRange.start) +
          res.result +
          letter.substring(selectionRange.end);
        setLetter(updated);
        toast.success("Text updated by AI", "The selected snippet has been rewritten.");
        setSelectedText("");
        setSelectionRange(null);
        setAiMode("menu");
        setAiInput("");
        // Trigger claim re-check
        if (grounded) void runReview(updated);
      }
    } catch (err) {
      toast.danger("AI action failed", errorMessage(err));
    } finally {
      setAiWorking(false);
    }
  };

  /* ── Claim Fix Handlers ─────────────────────────────────────── */
  const handleFixClaim = (claim: ReviewClaim, index: number) => {
    const replacement = claim.suggestion || claim.reason;
    if (!replacement || !letter.includes(claim.text)) {
      toast.warning("Could not auto-replace", "Edit the letter text directly to adjust this claim.");
      return;
    }
    const updated = letter.replace(claim.text, replacement);
    setLetter(updated);
    setClaims((prev) => (prev ? prev.filter((_, i) => i !== index) : null));
    toast.success("Claim fixed", `Updated: "${claim.text.slice(0, 30)}..."`);
  };

  const handleFixAllClaims = () => {
    if (!claims || claims.length === 0) return;
    let updated = letter;
    let fixedCount = 0;
    claims.forEach((c) => {
      const replacement = c.suggestion;
      if (replacement && updated.includes(c.text)) {
        updated = updated.replace(c.text, replacement);
        fixedCount++;
      }
    });

    if (fixedCount > 0) {
      setLetter(updated);
      setClaims([]);
      toast.success("All claims fixed", `Rephrased ${fixedCount} claim${fixedCount === 1 ? "" : "s"} to match your profile.`);
    } else {
      toast.warning("Manual edit required", "Please edit the flagged lines directly in the editor.");
    }
  };

  const hasLetter = letter.trim().length > 0;

  return (
    <Page
      eyebrow="Generate / Write Letter"
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

            <div className="mt-4 border-t border-border pt-3.5">
              <Link
                to={
                  company.trim()
                    ? `/research?company=${encodeURIComponent(company.trim())}${role.trim() ? `&role=${encodeURIComponent(role.trim())}` : ""}`
                    : "/research"
                }
                className="group flex items-center justify-between gap-3 rounded-[11px] border border-border bg-surface-2 p-3 transition-all hover:border-accent hover:bg-surface"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-white"
                    style={{ background: "var(--accent-grad)", boxShadow: "0 6px 16px -4px var(--accent-shadow)" }}
                  >
                    <Search size={14} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-fg flex items-center gap-1.5">
                      <span>Multi-Agent Research</span>
                      <Pill tone="accent" className="py-0 px-1.5 text-[9.5px]">Deep AI</Pill>
                    </div>
                    <div className="truncate text-[11px] text-fg-mid">
                      {company.trim() ? `Analyze ${company} with 3 AI agents` : "Deep dive company culture & tech stack"}
                    </div>
                  </div>
                </div>
                <ArrowRight size={14} className="shrink-0 text-fg-low transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5">
            <Field label="Tone">
              <Segmented options={TONES} value={tone} onChange={setTone} />
            </Field>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Length</Label>
                <span className="font-mono text-[10px] tracking-[0.02em] text-accent-text">
                  {lenLabel} · ~{words} words
                </span>
              </div>
              <Slider value={lengthPct} min={0} max={100} onChange={setLengthPct} aria-label="Letter length" />
              <div className="flex justify-between text-[10.5px] font-semibold tracking-[0.01em] text-fg-low">
                <span>Brief</span>
                <span>Detailed</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[11px] border border-border bg-surface-2 px-3.5 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-fg">Check claims before sending</div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-fg-mid">
                  Flag anything the draft states that your profile doesn&apos;t back up.
                </p>
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
              <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-border bg-input px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.01em] text-accent-text">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                  style={{ animation: "cll-pulse 1.3s ease-in-out infinite" }}
                />
                Streaming
              </div>
            ) : null}

            {/* Selection AI Floating Box */}
            {selectedText && !streaming ? (
              <div
                className="cll-fade border-b border-border bg-surface-2 p-3.5 shadow-elevated"
                style={{
                  background:
                    "radial-gradient(130% 120% at 50% -10%, var(--accent-weak), transparent 60%), var(--surface-2)",
                }}
              >
                <div className="flex items-center justify-between gap-2 pb-2">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-fg">
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-[6px] text-white"
                      style={{ background: "var(--accent-grad)" }}
                    >
                      <Sparkles size={11} />
                    </span>
                    <span className="text-accent-text font-mono text-[11px]">AI Selection Helper:</span>
                    <span className="truncate text-fg-mid max-w-[280px]">“{selectedText}”</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedText("");
                      setSelectionRange(null);
                    }}
                    className="text-fg-mid hover:text-fg"
                  >
                    <X size={14} />
                  </button>
                </div>

                {aiMode === "menu" ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      variant="primary"
                      size="xs"
                      loading={aiWorking}
                      onClick={() => handleInlineAction("regenerate")}
                    >
                      <RotateCw size={12} /> Rephrase
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setAiMode("custom")}
                    >
                      <Wand2 size={12} /> Edit with AI
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setAiMode("ask")}
                    >
                      <HelpCircle size={12} /> Ask AI
                    </Button>
                  </div>
                ) : aiMode === "custom" ? (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <Input
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        placeholder="e.g. Make this sound more confident or concise..."
                        className="h-8 text-[12px]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleInlineAction("custom");
                        }}
                      />
                      <Button
                        variant="primary"
                        size="xs"
                        loading={aiWorking}
                        onClick={() => handleInlineAction("custom")}
                      >
                        Apply
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setAiMode("menu")}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <Input
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        placeholder="Ask a question about this selected text..."
                        className="h-8 text-[12px]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleInlineAction("ask");
                        }}
                      />
                      <Button
                        variant="primary"
                        size="xs"
                        loading={aiWorking}
                        onClick={() => handleInlineAction("ask")}
                      >
                        Ask
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setAiMode("menu")}
                      >
                        Cancel
                      </Button>
                    </div>
                    {aiAnswer ? (
                      <div className="mt-2 rounded-[8px] border border-border bg-surface p-2.5 text-[12px] leading-relaxed text-fg">
                        <div className="font-semibold text-accent-text mb-1">AI Answer:</div>
                        {aiAnswer}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {!hasLetter && !streaming ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-[14px] border border-border-strong bg-surface-2 text-accent-text">
                  <Sparkles size={22} />
                </div>
                <div className="text-[15px] font-semibold text-fg">Your letter appears here</div>
                <p className="mt-1 max-w-xs text-[13px] text-fg-mid">
                  Fill in the company and hit <b className="text-fg">Generate</b> — it streams in, grounded in your profile.
                </p>
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
                  ref={textareaRef}
                  value={letter}
                  onChange={(e) => setLetter(e.target.value)}
                  onSelect={handleTextareaSelect}
                  onMouseUp={handleTextareaSelect}
                  onKeyUp={handleTextareaSelect}
                  spellCheck
                  className="min-h-[360px] flex-1 resize-none border-0 bg-transparent p-7 text-[15px] leading-[1.85] text-reading-ink outline-none sm:px-8"
                  aria-label="Cover letter (editable)"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
                  <span className="flex items-center gap-1.5 text-[10.5px] text-fg-low">
                    <Info size={12} strokeWidth={1.6} /> Select text to edit or ask AI · edit freely
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="xs" onClick={copyLetter}>
                      <Copy size={13} /> Copy
                    </Button>
                    <Button variant="ghost" size="xs" onClick={downloadTxt}>
                      <Download size={13} /> .txt
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => download("pdf")}
                      loading={exporting === "pdf"}
                      disabled={exporting !== null}
                    >
                      <FileDown size={13} /> PDF
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => download("docx")}
                      loading={exporting === "docx"}
                      disabled={exporting !== null}
                    >
                      <FileText size={13} /> Word
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Review panel — with Suggestions & Fix buttons */}
          {grounded && done ? (
            <section className="cll-fade rounded-[14px] border border-border bg-surface p-[18px]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                  <ShieldCheck size={16} strokeWidth={1.6} className="text-success" /> Claim check
                </div>
                <div className="flex items-center gap-3">
                  {claims && claims.length > 0 ? (
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={handleFixAllClaims}
                      className="gap-1 rounded-[7px] text-[11px]"
                    >
                      <Wand2 size={11} /> Fix All Flagged ({claims.length})
                    </Button>
                  ) : null}
                  {reviewing ? (
                    <span className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.01em] text-fg-mid">
                      <Spinner size={12} /> checking…
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void runReview(letter);
                        void runPiiScan(letter);
                      }}
                      className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.01em] text-accent-text hover:brightness-110"
                    >
                      <RotateCw size={11} /> re-check
                    </button>
                  )}
                </div>
              </div>

              {reviewing ? (
                <p className="text-[12.5px] text-fg-mid">Looking for anything your profile doesn&apos;t back up…</p>
              ) : claims && claims.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  <p className="text-[12px] text-fg-mid">
                    These claims need double-checking against your profile. Click <b className="text-fg">Fix</b> to automatically rephrase them with backed facts:
                  </p>
                  {claims.map((c, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-2 rounded-[12px] border border-[color:var(--warning)]/30 bg-warning-weak p-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 text-[12.5px] text-fg">
                          <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" />
                          <span className="italic font-medium">“{c.text}”</span>
                        </div>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleFixClaim(c, i)}
                          className="shrink-0 gap-1.5 rounded-[8px] border-warning/40 bg-surface text-fg hover:border-warning hover:bg-warning-weak"
                        >
                          <Wand2 size={12} className="text-warning" /> Fix
                        </Button>
                      </div>

                      {c.reason ? (
                        <div className="pl-5.5 text-[11.5px] text-fg-mid">
                          <b className="text-fg-low">Note:</b> {c.reason}
                        </div>
                      ) : null}

                      {c.suggestion ? (
                        <div className="pl-5.5 text-[11.5px] text-accent-text">
                          <b className="font-semibold">Suggested fix:</b> “{c.suggestion}”
                        </div>
                      ) : null}
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

          {/* PII shield */}
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
                  const dot =
                    f.severity === "high"
                      ? "bg-danger"
                      : f.severity === "medium"
                      ? "bg-warning"
                      : "bg-fg-low";
                  return (
                    <div
                      key={f.type}
                      className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface px-3 py-2.5"
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[12.5px] text-fg">
                          <span className="font-semibold">{f.label}</span>
                          {f.count > 1 ? (
                            <span className="font-mono text-[10px] text-fg-low">×{f.count}</span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {f.samples.map((s, i) => (
                            <span
                              key={i}
                              className="rounded-[6px] bg-input px-2 py-[2px] font-mono text-[10px] text-fg-mid"
                            >
                              {s}
                            </span>
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
