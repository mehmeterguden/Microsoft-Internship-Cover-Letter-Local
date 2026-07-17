import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { FileDropzone } from "@/components/common/FileDropzone";
import { ErrorDetails } from "@/components/common/ErrorDetails";
import { saveExtraction, streamImportCv } from "@/api/cv";
import { parseError, type AppError } from "@/api/errors";
import type { CVExtraction } from "@/api/types";
import { toast } from "@/store/toast";
import type { StepProps } from "./types";

type Phase = "idle" | "parsing" | "review" | "failed" | "saved";

function fmt(seconds: number): string {
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/** Auto-scrolling console of the model's JSON as it streams in. */
function LiveJson({ text, live }: { text: string; live: boolean }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);
  return (
    <pre
      ref={ref}
      className="max-h-[300px] min-h-[160px] overflow-auto rounded-[12px] border border-line bg-navy p-4 font-mono text-[12px] leading-relaxed text-white/90"
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

function counts(x: CVExtraction): { label: string; n: number }[] {
  return (
    [
      ["skills", x.skills?.length ?? 0],
      ["experience", x.experiences?.length ?? 0],
      ["education", x.education?.length ?? 0],
      ["projects", x.projects?.length ?? 0],
      ["certificates", x.certificates?.length ?? 0],
      ["languages", x.languages?.length ?? 0],
    ] as [string, number][]
  )
    .filter(([, n]) => n > 0)
    .map(([label, n]) => ({ label, n }));
}

export function CvStep({ detected, done, onDone }: StepProps) {
  const [phase, setPhase] = useState<Phase>(done && detected.cv ? "saved" : "idle");
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [extraction, setExtraction] = useState<CVExtraction | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState(detected.cv?.name ?? "");

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (timerRef.current) window.clearInterval(timerRef.current);
    },
    [],
  );

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
              setError({
                code: "parse.invalid_output",
                title: "Couldn't structure the CV",
                message:
                  "The model replied, but its output couldn't be read as a valid profile. Try again or use a different file.",
                detail: event.error ?? null,
                retryable: true,
                action: null,
              });
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
        setError(parseError(err));
        setPhase("failed");
      }
    }
  }

  async function save() {
    if (!extraction) return;
    setSaving(true);
    try {
      await saveExtraction(extraction, true, fileName || undefined);
      setSavedName([extraction.profile?.name, extraction.profile?.surname].filter(Boolean).join(" ") || "Your profile");
      setPhase("saved");
      onDone();
      toast.success("CV saved", "It's part of your profile now.");
    } catch (err) {
      toast.error(err, "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Already on file (detected or just saved) ──
  if (phase === "saved") {
    return (
      <Card style={{ animation: "cll-rise 0.3s both" }}>
        <CardContent className="flex flex-wrap items-center gap-4 pt-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent-ink">
            <FileText size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-[15px] font-bold text-text">{savedName || "CV imported"}</p>
              <Badge tone="success">On file</Badge>
            </div>
            <p className="mt-0.5 truncate text-[13px] text-text-2">
              {detected.cv?.filename || fileName || "Your CV is structured and saved."}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setPhase("idle")}>
            <RotateCcw size={14} /> Import a different CV
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Streaming / failed ──
  if (phase === "parsing" || phase === "failed") {
    return (
      <div className="grid gap-4" style={{ animation: "cll-rise 0.3s both" }}>
        <Card>
          <CardContent className="grid gap-3 pt-5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[14px] font-semibold text-text">
                {phase === "parsing" ? (
                  <>
                    <Sparkles size={16} className="text-accent-ink" /> Structuring {fileName}…
                  </>
                ) : (
                  <>
                    <XCircle size={16} className="text-danger" /> Couldn't structure the CV
                  </>
                )}
              </span>
              <Badge tone={phase === "parsing" ? "accent" : "danger"}>
                {phase === "parsing" ? `${fmt(elapsed)}` : duration != null ? `after ${fmt(duration)}` : "failed"}
              </Badge>
            </div>
            {phase === "failed" && error && (
              <Alert tone="danger" title={error.title}>
                {error.message}
                <ErrorDetails detail={error.detail} code={error.code} className="mt-2" />
              </Alert>
            )}
            <LiveJson text={raw} live={phase === "parsing"} />
          </CardContent>
        </Card>
        {phase === "failed" && (
          <Button variant="secondary" onClick={() => setPhase("idle")}>
            <RotateCcw size={15} /> Try another file
          </Button>
        )}
      </div>
    );
  }

  // ── Review (structured, awaiting save) ──
  if (phase === "review" && extraction) {
    const c = counts(extraction);
    return (
      <div className="grid gap-4" style={{ animation: "cll-rise 0.3s both" }}>
        <Alert tone="success" title="Parsed your CV">
          Here's what we found{duration != null ? ` (in ${fmt(duration)})` : ""}. Save it to your profile to continue.
        </Alert>
        <Card>
          <CardContent className="grid gap-3 pt-5">
            <p className="text-[16px] font-bold text-text">
              {[extraction.profile?.name, extraction.profile?.surname].filter(Boolean).join(" ") || "Your profile"}
            </p>
            {extraction.profile?.summary && (
              <p className="text-[13.5px] leading-relaxed text-text-2">{extraction.profile.summary}</p>
            )}
            {c.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {c.map(({ label, n }) => (
                  <Badge key={label} tone="accent">
                    {n} {label}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-3">
          <Button onClick={save} loading={saving}>
            <CheckCircle2 size={16} /> Save to profile
          </Button>
          <Button variant="ghost" onClick={() => setPhase("idle")}>
            Upload a different file
          </Button>
        </div>
      </div>
    );
  }

  // ── Idle (dropzone) ──
  return (
    <div className="grid gap-5" style={{ animation: "cll-rise 0.3s both" }}>
      <FileDropzone accept=".pdf,.docx,.png,.jpg,.jpeg" hint="PDF, DOCX or image · max 15 MB" onFile={handleFile} />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: FileText, title: "Read locally", body: "Text is extracted on your machine — the file never uploads." },
          { icon: Sparkles, title: "Structured by AI", body: "Watch the JSON stream in, field by field." },
          { icon: CheckCircle2, title: "You review it", body: "Nothing is saved until you confirm what we found." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-[14px] border border-border bg-surface p-4 shadow-soft">
            <span className="mb-2.5 inline-grid h-9 w-9 place-items-center rounded-[10px] bg-accent-soft text-accent-ink">
              <Icon size={17} />
            </span>
            <p className="text-[13.5px] font-bold text-text">{title}</p>
            <p className="mt-1 text-[12.5px] leading-snug text-text-2">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
