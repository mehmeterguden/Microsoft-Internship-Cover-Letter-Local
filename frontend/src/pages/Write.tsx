import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, CircleDot, Copy, Download, PenLine, RefreshCw, Save, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Job, Tone } from "@/api/types";
import { streamCoverLetter } from "@/api/coverLetter";
import { createJob, getJob, updateJob } from "@/api/jobs";
import { errorMessage } from "@/api/client";
import { toast } from "@/store/toast";

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "warm", label: "Warm" },
  { value: "confident", label: "Confident" },
  { value: "concise", label: "Concise" },
];

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

  const generated = text.trim().length > 0;
  const abortRef = useRef<AbortController | null>(null);
  const autoRan = useRef(false);
  useEffect(() => () => abortRef.current?.abort(), []);

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
      .catch((err) => toast.danger("Couldn't load letter", errorMessage(err)));
  }, [jobIdParam]);

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
    let acc = "";
    try {
      await streamCoverLetter(
        { company_name: name, role_title: role || null, job_description: jd || null, tone },
        (event) => {
          if (event.type === "token") {
            acc += event.text;
            setText(acc);
          } else if (event.type === "done") {
            setStreaming(false);
          } else if (event.type === "fatal") {
            toast.danger("Generation failed", event.error);
            setStreaming(false);
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) toast.danger("Generation failed", errorMessage(err));
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
      toast.danger("Couldn't save", errorMessage(err));
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
      toast.danger("Couldn't update", errorMessage(err));
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

  return (
    <>
      <PageHeader
        eyebrow="Write & apply"
        title="Cover letter"
        icon={PenLine}
        description="Generate a letter grounded in your profile and company research, then edit the text. Save it to Cover Letters."
        actions={
          <Button onClick={save} loading={saving} disabled={!generated}>
            <Save size={16} /> Save
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[350px_1fr]">
        {/* Inputs + generation */}
        <Card className="lg:sticky lg:top-4 lg:self-start">
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

        {/* The letter — plain, editable text */}
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
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={copy} disabled={!generated}><Copy size={14} /> Copy</Button>
                <Button size="sm" variant="ghost" onClick={downloadTxt} disabled={!generated}><Download size={14} /> .txt</Button>
                <Button size="sm" variant={completed ? "secondary" : "primary"} onClick={toggleCompleted} disabled={!generated} loading={saving}>
                  {completed ? <><CircleDot size={14} /> Mark draft</> : <><Check size={14} /> Mark completed</>}
                </Button>
              </div>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Generate a letter on the left, or write your own here…"
              className="min-h-[60vh] font-serif text-[15px] leading-relaxed"
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
