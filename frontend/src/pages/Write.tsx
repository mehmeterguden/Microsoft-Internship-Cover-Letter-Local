import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Check,
  CircleDot,
  Copy,
  Download,
  FileDown,
  PenLine,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Job, LLMProviderId, Settings, Tone } from "@/api/types";
import { streamCoverLetter } from "@/api/coverLetter";
import { createJob, getJob, updateJob } from "@/api/jobs";
import { getSettings } from "@/api/settings";
import { toast } from "@/store/toast";
import { QualityScore } from "@/components/write/QualityScore";
import { RunInspector } from "@/components/write/RunInspector";
import { GroundednessText } from "@/components/write/GroundednessText";
import { SelectionMenu, type SelectionAnchor } from "@/components/write/SelectionMenu";
import { ExportGallery } from "@/components/write/ExportGallery";
import {
  buildRunMeta,
  checkGroundedness,
  editSelection,
  evaluateLetter,
  toRunMeta,
  type EditAction,
  type GroundednessResult,
  type LetterEvaluation,
  type RunMeta,
  type StartInfo,
} from "@/components/write/letterTools";

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "warm", label: "Warm" },
  { value: "confident", label: "Confident" },
  { value: "concise", label: "Concise" },
];

const PROVIDER_LABEL: Record<LLMProviderId, string> = {
  foundry_local: "Foundry Local",
  ollama: "Ollama",
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
};

const EDIT_TOAST: Record<EditAction, string> = {
  improve: "Polished the selection.",
  shorten: "Trimmed the selection.",
  extend: "Expanded the selection.",
  retone: "Adjusted the tone.",
};

/** The user's active text selection inside the letter, plus its screen anchor. */
interface Selection {
  text: string;
  start: number;
  end: number;
  anchor: SelectionAnchor;
}

export function Write() {
  const [params, setParams] = useSearchParams();
  const jobIdParam = params.get("job");

  // Prefill from the Company Research hand-off (?company=&role=&jd=&auto=1).
  const [company, setCompany] = useState(params.get("company") ?? "");
  const [role, setRole] = useState(params.get("role") ?? "");
  const [jd, setJd] = useState(params.get("jd") ?? "");
  const [tone, setTone] = useState<Tone>("warm");
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [jobId, setJobId] = useState<number | null>(jobIdParam ? Number(jobIdParam) : null);

  // Feature state for the run inspector, quality score, groundedness, selection
  // editing, and export — see components/write/*.
  const [runMeta, setRunMeta] = useState<RunMeta | null>(null);
  const [evaluation, setEvaluation] = useState<LetterEvaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [groundedness, setGroundedness] = useState<GroundednessResult | null>(null);
  const [grounding, setGrounding] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [menuBusy, setMenuBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const generated = text.trim().length > 0;
  const abortRef = useRef<AbortController | null>(null);
  const autoRan = useRef(false);
  const t0Ref = useRef(0);
  const startInfoRef = useRef<StartInfo | null>(null);
  const settingsRef = useRef<Settings | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Read the active provider/model once so the run inspector can label the run.
  useEffect(() => {
    getSettings()
      .then((s) => {
        settingsRef.current = s;
      })
      .catch(() => {
        /* inspector falls back to "—" when settings are unavailable */
      });
  }, []);

  // Load an existing saved letter when reopened from Cover Letters.
  useEffect(() => {
    if (!jobIdParam) return;
    getJob(Number(jobIdParam))
      .then((job) => {
        setCompany(job.company);
        setRole(job.role);
        setText(job.letter?.text ?? "");
        setCompleted(Boolean(job.letter?.completed));
      })
      .catch((err) => toast.error(err, "Couldn't load letter"));
  }, [jobIdParam]);

  function resetInsights() {
    setRunMeta(null);
    setEvaluation(null);
    setGroundedness(null);
    setReviewMode(false);
    setSelection(null);
  }

  async function generate() {
    const name = company.trim();
    if (!name) {
      toast.warning("Add a company", "Enter the company name first.");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setText("");
    resetInsights();
    startInfoRef.current = null;
    t0Ref.current = performance.now();
    let acc = "";
    try {
      await streamCoverLetter(
        { company_name: name, role_title: role || null, job_description: jd || null, tone },
        (event) => {
          if (event.type === "start") {
            startInfoRef.current = {
              has_profile: event.has_profile,
              used_research: event.used_research,
              used_style: event.used_style,
              voice_samples: event.voice_samples,
              tone: event.tone,
            };
          } else if (event.type === "token") {
            acc += event.text;
            setText(acc);
          } else if (event.type === "done") {
            setStreaming(false);
            // Prefer P1's run metadata; fall back to the start event + local
            // timing if a run arrives without it (backend lagging the frontend).
            if (event.run_meta) {
              setRunMeta(toRunMeta(event.run_meta, event.approx_words));
            } else {
              const durationS = (performance.now() - t0Ref.current) / 1000;
              const s = settingsRef.current;
              setRunMeta(
                buildRunMeta(
                  startInfoRef.current,
                  durationS,
                  event.approx_words,
                  s?.llm_model,
                  s ? PROVIDER_LABEL[s.llm_provider] : undefined,
                ),
              );
            }
          } else if (event.type === "fatal") {
            toast.error(event.error, "Generation failed");
            setStreaming(false);
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) toast.error(err, "Generation failed");
      setStreaming(false);
    }
  }

  // Auto-start generation once when arriving from research (?auto=1). Scheduled
  // through a timer so React 18 StrictMode's mount/unmount/mount in dev cancels
  // the throwaway pass and only the surviving mount actually generates.
  useEffect(() => {
    if (autoRan.current || jobIdParam) return;
    if (params.get("auto") !== "1" || !company.trim()) return;
    const t = window.setTimeout(() => {
      autoRan.current = true;
      void generate();
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persist(nextCompleted: boolean): Promise<number | null> {
    const payload: Job = {
      company: company.trim() || "Untitled",
      role: role.trim() || "Role",
      status: "draft",
      letter: { text, completed: nextCompleted },
    };
    if (jobId != null) {
      await updateJob(jobId, { ...payload, id: jobId });
      return jobId;
    }
    const created = await createJob(payload);
    if (created.id != null) {
      setJobId(created.id);
      setParams({ job: String(created.id) }, { replace: true });
    }
    return created.id ?? null;
  }

  async function save() {
    if (!generated) {
      toast.warning("Nothing to save", "Generate or write the letter first.");
      return;
    }
    setSaving(true);
    try {
      await persist(completed);
      toast.success("Saved", "Find it under Cover Letters.");
    } catch (err) {
      toast.error(err, "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCompleted() {
    const next = !completed;
    setCompleted(next);
    setSaving(true);
    try {
      await persist(next);
      toast.success(next ? "Marked as completed" : "Moved back to draft");
    } catch (err) {
      setCompleted(!next); // revert on failure
      toast.error(err, "Couldn't update");
    } finally {
      setSaving(false);
    }
  }

  function copy() {
    navigator.clipboard?.writeText(text);
    toast.success("Copied to clipboard");
  }
  function downloadTxt() {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(company || "cover-letter").toLowerCase().replace(/\s+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── [2] Quality ────────────────────────────────────────────────────────────
  async function evaluate() {
    setEvaluating(true);
    try {
      const res = await evaluateLetter(text, { company, role });
      setEvaluation(res);
    } catch (err) {
      toast.error(err, "Couldn't score letter");
    } finally {
      setEvaluating(false);
    }
  }

  // ── [1] Groundedness ─────────────────────────────────────────────────────────
  async function runGrounding(target: string) {
    setGrounding(true);
    try {
      setGroundedness(await checkGroundedness(target));
    } catch (err) {
      toast.error(err, "Couldn't check grounding");
      setReviewMode(false);
    } finally {
      setGrounding(false);
    }
  }

  function toggleReview() {
    setSelection(null);
    if (reviewMode) {
      setReviewMode(false);
      return;
    }
    setReviewMode(true);
    if (!groundedness) void runGrounding(text);
  }

  // ── [8] Select → AI edit ─────────────────────────────────────────────────────
  function onTextareaSelect(e: React.MouseEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end - start < 2) {
      setSelection(null);
      return;
    }
    setSelection({
      text: el.value.slice(start, end),
      start,
      end,
      anchor: { x: e.clientX, y: e.clientY },
    });
  }

  function onReviewSelect(e: React.MouseEvent<HTMLDivElement>) {
    const str = window.getSelection()?.toString() ?? "";
    if (str.trim().length < 2) {
      setSelection(null);
      return;
    }
    const start = text.indexOf(str);
    if (start < 0) {
      setSelection(null);
      return;
    }
    setSelection({ text: str, start, end: start + str.length, anchor: { x: e.clientX, y: e.clientY } });
  }

  async function applyEdit(action: EditAction, editTone?: Tone) {
    if (!selection) return;
    setMenuBusy(true);
    try {
      const { text: replacement } = await editSelection({
        text,
        selection: selection.text,
        action,
        tone: editTone,
      });
      const next = text.slice(0, selection.start) + replacement + text.slice(selection.end);
      setText(next);
      setSelection(null);
      toast.success("Selection updated", EDIT_TOAST[action]);
      // Highlights computed against the old text are now stale.
      if (reviewMode) void runGrounding(next);
    } catch (err) {
      toast.error(err, "Couldn't edit selection");
    } finally {
      setMenuBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Write & apply"
        title="Cover letter"
        icon={PenLine}
        description="Generate a letter grounded in your profile and company research, then edit, score, fact-check, and export it."
        actions={
          <Button onClick={save} loading={saving} disabled={!generated}>
            <Save size={16} /> Save
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[350px_1fr]">
        {/* Inputs + generation + quality (sticky rail) */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardContent className="grid gap-4 pt-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Company" htmlFor="w-co">
                  <Input id="w-co" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Microsoft" />
                </Field>
                <Field label="Role" htmlFor="w-ro">
                  <Input id="w-ro" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. SWE Intern" />
                </Field>
              </div>
              <Field label="Tone" htmlFor="w-tone">
                <Select id="w-tone" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                  {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Job description" htmlFor="w-jd" hint="Optional — grounds the letter">
                <Textarea id="w-jd" value={jd} onChange={(e) => setJd(e.target.value)} className="min-h-28" placeholder="Paste the posting…" />
              </Field>
              <Button onClick={generate} loading={streaming} className="w-full">
                {generated ? <RefreshCw size={16} /> : <Sparkles size={16} />}
                {generated ? "Regenerate" : "Generate letter"}
              </Button>
              <p className="rounded-[11px] bg-surface-2 p-3 text-[12.5px] leading-relaxed text-text-2">
                The letter is grounded in your profile and, if you researched this company, its cached report.
              </p>
            </CardContent>
          </Card>

          {generated && (
            <QualityScore
              evaluation={evaluation}
              loading={evaluating}
              disabled={streaming}
              onEvaluate={evaluate}
            />
          )}
        </div>

        {/* The letter + run inspector */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardContent className="grid gap-3 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-text">Your letter</span>
                  {generated && (
                    <Badge tone={completed ? "success" : "neutral"}>{completed ? "Completed" : "Draft"}</Badge>
                  )}
                  {streaming && (
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Writing…
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    size="sm"
                    variant={reviewMode ? "secondary" : "ghost"}
                    onClick={toggleReview}
                    loading={grounding}
                    disabled={!generated || streaming}
                  >
                    {reviewMode ? <><PenLine size={14} /> Edit text</> : <><ShieldCheck size={14} /> Check grounding</>}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setExportOpen(true)} disabled={!generated}>
                    <FileDown size={14} /> Export
                  </Button>
                  <Button size="sm" variant="ghost" onClick={copy} disabled={!generated}><Copy size={14} /> Copy</Button>
                  <Button size="sm" variant="ghost" onClick={downloadTxt} disabled={!generated}><Download size={14} /> .txt</Button>
                  <Button size="sm" variant={completed ? "secondary" : "primary"} onClick={toggleCompleted} disabled={!generated} loading={saving}>
                    {completed ? <><CircleDot size={14} /> Mark draft</> : <><Check size={14} /> Mark completed</>}
                  </Button>
                </div>
              </div>

              {reviewMode ? (
                grounding && !groundedness ? (
                  <div className="min-h-[52vh] space-y-2 rounded-[10px] border border-border bg-surface p-4">
                    <div className="h-14 animate-pulse rounded-[10px] bg-surface-2" />
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-3.5 animate-pulse rounded bg-surface-2" style={{ width: `${90 - (i % 3) * 15}%` }} />
                    ))}
                  </div>
                ) : groundedness ? (
                  <div onMouseUp={onReviewSelect}>
                    <GroundednessText text={text} result={groundedness} />
                  </div>
                ) : null
              ) : (
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onMouseUp={onTextareaSelect}
                  placeholder="Generate a letter on the left, or write your own here…"
                  className="min-h-[60vh] font-serif text-[15px] leading-relaxed"
                />
              )}
              <p className="text-[11.5px] text-text-3">
                Tip: select any sentence to improve, shorten, extend, or re-tone it with AI.
              </p>
            </CardContent>
          </Card>

          {(generated || streaming) && <RunInspector meta={runMeta} loading={streaming} />}
        </div>
      </div>

      <SelectionMenu
        anchor={selection?.anchor ?? null}
        busy={menuBusy}
        onAction={applyEdit}
        onClose={() => setSelection(null)}
      />

      <ExportGallery
        open={exportOpen}
        onOpenChange={setExportOpen}
        text={text}
        company={company}
        role={role}
      />
    </>
  );
}
