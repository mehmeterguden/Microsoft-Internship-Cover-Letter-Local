import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, FileUp, Sparkles, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Stepper } from "@/components/common/Stepper";
import { FileDropzone } from "@/components/common/FileDropzone";
import { SkillTag } from "@/components/common/SkillTag";
import { DevInspector } from "@/components/common/DevInspector";
import type { CVExtraction } from "@/api/types";
import { saveExtraction, streamImportCv } from "@/api/cv";
import { errorMessage } from "@/api/client";
import { toast } from "@/store/toast";

type Phase = "upload" | "parsing" | "review" | "failed";

const STEPS = [
  { key: "upload", label: "Upload CV" },
  { key: "parse", label: "Extract & structure" },
  { key: "review", label: "Review & save" },
];

function fmt(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  return `${m}m ${Math.round(seconds % 60)}s`;
}

/** Auto-scrolling code block that shows the model's JSON as it streams in. */
function LiveJson({ text, live }: { text: string; live: boolean }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);
  return (
    <pre
      ref={ref}
      className="max-h-[420px] min-h-[220px] overflow-auto rounded-[12px] bg-navy p-4 font-mono text-[12px] leading-relaxed text-white/90"
    >
      <code>
        {text || "…"}
        {live && (
          <span
            className="ml-0.5 inline-block h-[1.05em] w-[7px] translate-y-[0.15em] bg-accent"
            style={{ animation: "cll-caret 1s step-end infinite" }}
          />
        )}
      </code>
    </pre>
  );
}

export function Onboarding() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [extraction, setExtraction] = useState<CVExtraction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => {
    abortRef.current?.abort();
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  function stopTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function handleFile(file: File) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFileName(file.name);
    setRaw("");
    setError(null);
    setExtraction(null);
    setDuration(null);
    setElapsed(0);
    setPhase("parsing");

    const start = performance.now();
    timerRef.current = window.setInterval(() => setElapsed((performance.now() - start) / 1000), 100);

    let acc = "";
    try {
      await streamImportCv(
        file,
        (event) => {
          if (event.type === "token") {
            acc += event.text;
            setRaw(acc);
          } else if (event.type === "done") {
            stopTimer();
            setDuration(event.duration_s);
            if (event.ok && event.structured) {
              setExtraction(event.structured);
              setPhase("review");
            } else {
              setError(event.error || "The model's output couldn't be parsed.");
              setRaw(event.raw_output || acc);
              setPhase("failed");
            }
          } else if (event.type === "fatal") {
            stopTimer();
            setError(event.error);
            setPhase("failed");
          }
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        stopTimer();
        setError(errorMessage(err));
        setPhase("failed");
      }
    }
  }

  async function save() {
    if (!extraction) return;
    setSaving(true);
    try {
      await saveExtraction(extraction);
      toast.success("Profile saved", "Your CV is now part of your profile.");
      navigate("/profile");
    } catch (err) {
      toast.danger("Save failed", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const currentStep = phase === "upload" ? 0 : phase === "parsing" || phase === "failed" ? 1 : 2;
  const skills = extraction?.skills ?? [];
  const experiences = extraction?.experiences ?? [];
  const prof = extraction?.profile;

  return (
    <>
      <PageHeader
        eyebrow="Get started"
        title="Import your CV"
        icon={FileUp}
        description="Upload a PDF, Word doc, or image. Watch the AI structure it live — all on your machine."
      />

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <Stepper steps={STEPS} current={currentStep} className="lg:sticky lg:top-10 lg:self-start" />

        <div className="min-w-0">
          {phase === "upload" && (
            <div className="grid gap-5">
              <FileDropzone accept=".pdf,.docx,.png,.jpg,.jpeg" hint="PDF, DOCX or image · max 15 MB" onFile={handleFile} />
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { icon: FileText, title: "Read locally", body: "Text is extracted on your machine — the file never uploads." },
                  { icon: Sparkles, title: "Structured by AI", body: "You'll watch the JSON stream in, field by field." },
                  { icon: CheckCircle2, title: "You review it", body: "Nothing is saved until you confirm what we found." },
                ].map(({ icon: Icon, title, body }) => (
                  <div key={title} className="rounded-[16px] border border-border bg-surface p-4 shadow-soft">
                    <span className="mb-2.5 inline-grid h-9 w-9 place-items-center rounded-[10px] bg-accent-soft text-accent-ink"><Icon size={17} /></span>
                    <p className="text-[13.5px] font-bold">{title}</p>
                    <p className="mt-1 text-[12.5px] leading-snug text-text-2">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(phase === "parsing" || phase === "failed") && (
            <div className="grid gap-4" style={{ animation: "cll-rise 0.3s both" }}>
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-[15px]">
                    {phase === "parsing" ? (
                      <><Sparkles size={16} className="text-accent-ink" /> Structuring {fileName}…</>
                    ) : (
                      <><XCircle size={16} className="text-danger" /> Couldn't structure the CV</>
                    )}
                  </CardTitle>
                  <Badge tone={phase === "parsing" ? "accent" : "danger"}>
                    {phase === "parsing" ? `${fmt(elapsed)} elapsed` : duration != null ? `after ${fmt(duration)}` : "failed"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  {phase === "failed" && error && (
                    <Alert tone="danger" className="mb-3">{error}</Alert>
                  )}
                  <p className="mb-2 text-[12.5px] text-text-3">
                    {phase === "parsing" ? "Live output from the model:" : "What the model produced:"}
                  </p>
                  <LiveJson text={raw} live={phase === "parsing"} />
                </CardContent>
              </Card>
              {phase === "failed" && (
                <div>
                  <Button variant="secondary" onClick={() => setPhase("upload")}>Try another file</Button>
                </div>
              )}
            </div>
          )}

          {phase === "review" && (
            <div className="grid gap-5" style={{ animation: "cll-rise 0.4s both" }}>
              <Alert tone="success" title="CV parsed">
                We found your profile, {skills.length} skills, and {experiences.length} roles
                {duration != null ? ` in ${fmt(duration)}` : ""}. Review below, then save.
              </Alert>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Profile</CardTitle>
                  <Badge tone="accent">Extracted</Badge>
                </CardHeader>
                <CardContent className="grid gap-1 text-[14px]">
                  <p className="font-semibold text-text">{prof?.name} {prof?.surname}</p>
                  <p className="text-text-2">{prof?.email}</p>
                  {prof?.summary && <p className="mt-1 text-text-2">{prof.summary}</p>}
                </CardContent>
              </Card>

              {skills.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Skills</CardTitle></CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {skills.map((s, i) => <SkillTag key={s.id ?? i}>{s.name}</SkillTag>)}
                  </CardContent>
                </Card>
              )}

              {experiences.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText size={16} className="text-text-3" /> Experience
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {experiences.map((e, i) => (
                      <div key={e.id ?? i} className="flex items-start gap-3">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" />
                        <div>
                          <p className="text-[14px] font-semibold text-text">{e.title} · {e.company}</p>
                          <p className="text-[13px] text-text-2">{e.description}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3">
                <Button onClick={save} loading={saving}>
                  <Sparkles size={16} /> Save to profile
                </Button>
                <Button variant="ghost" onClick={() => setPhase("upload")}>Upload a different file</Button>
              </div>

              {extraction && (
                <DevInspector json={extraction} raw={raw} title="Developer · view AI output (JSON)" />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
