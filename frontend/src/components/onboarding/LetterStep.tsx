import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, Save, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { streamCoverLetter } from "@/api/coverLetter";
import { createJob } from "@/api/jobs";
import type { Tone } from "@/api/types";
import { toast } from "@/store/toast";
import type { StepProps } from "./types";

const TONES: { value: Tone; label: string }[] = [
  { value: "warm", label: "Warm" },
  { value: "professional", label: "Professional" },
  { value: "confident", label: "Confident" },
  { value: "concise", label: "Concise" },
];

export function LetterStep({ onDone }: StepProps) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [tone, setTone] = useState<Tone>("warm");
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedJobId, setSavedJobId] = useState<number | null>(null);

  const generated = text.trim().length > 0;
  const abortRef = useRef<AbortController | null>(null);
  const readRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (readRef.current) readRef.current.scrollTop = readRef.current.scrollHeight;
  }, [text]);

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
    setSavedJobId(null);
    let acc = "";
    try {
      await streamCoverLetter(
        { company_name: name, role_title: role || null, job_description: null, tone },
        (event) => {
          if (event.type === "token") {
            acc += event.text;
            setText(acc);
          } else if (event.type === "done") {
            setStreaming(false);
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

  async function save() {
    if (!generated) return;
    setSaving(true);
    try {
      const created = await createJob({
        company: company.trim() || "Untitled",
        role: role.trim() || "Role",
        status: "draft",
        letter: { text, completed: false },
      });
      const id = created.id ?? null;
      setSavedJobId(id);
      onDone(id != null ? { jobId: id } : undefined);
      toast.success("Saved", "Your first letter is in Cover Letters.");
    } catch (err) {
      toast.error(err, "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]" style={{ animation: "cll-rise 0.3s both" }}>
      {/* Inputs */}
      <Card className="lg:sticky lg:top-4 lg:self-start">
        <CardContent className="grid gap-4 pt-5">
          <Field label="Company" htmlFor="ob-co">
            <Input id="ob-co" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Microsoft" />
          </Field>
          <Field label="Role" htmlFor="ob-ro" hint="Optional">
            <Input id="ob-ro" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. SWE Intern" />
          </Field>
          <Field label="Tone" htmlFor="ob-tone">
            <Select id="ob-tone" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={generate} loading={streaming} disabled={!company.trim()} className="w-full">
            {generated ? <RefreshCw size={16} /> : <Sparkles size={16} />}
            {generated ? "Regenerate" : "Generate letter"}
          </Button>
          <p className="rounded-[11px] bg-surface-2 p-3 text-[12px] leading-relaxed text-text-2">
            Grounded in your profile{" "}
            {generated ? "— save it, then finish setup." : "— and your writing voice, if you taught it."}
          </p>
        </CardContent>
      </Card>

      {/* Letter */}
      <Card>
        <CardContent className="grid gap-3 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-text">Your first letter</span>
            {streaming ? (
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Writing…
              </span>
            ) : savedJobId != null ? (
              <Badge tone="success">Saved</Badge>
            ) : generated ? (
              <Badge tone="neutral">Draft</Badge>
            ) : null}
          </div>

          {generated ? (
            <>
              <div
                ref={readRef}
                className="max-h-[46vh] min-h-[200px] overflow-auto whitespace-pre-wrap rounded-[12px] border border-line bg-surface-2 p-5 font-serif text-[15px] leading-relaxed text-text"
              >
                {text}
                {streaming && (
                  <span
                    className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-accent"
                    style={{ animation: "cll-caret 1s step-end infinite" }}
                  />
                )}
              </div>
              {!streaming && (
                <div>
                  <Button onClick={save} loading={saving} disabled={savedJobId != null}>
                    {savedJobId != null ? <CheckCircle2 size={16} /> : <Save size={16} />}
                    {savedJobId != null ? "Saved to Cover Letters" : "Save letter"}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="grid min-h-[200px] place-items-center rounded-[12px] border border-dashed border-border-strong bg-surface-2 px-6 py-10 text-center">
              <div className="grid gap-2">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-[12px] bg-accent-soft text-accent-ink">
                  <Sparkles size={20} />
                </span>
                <p className="text-[14px] font-semibold text-text">Ready when you are</p>
                <p className="mx-auto max-w-xs text-[12.5px] leading-snug text-text-2">
                  Enter a company on the left and generate — it streams in token by token, grounded in everything you
                  just set up.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
