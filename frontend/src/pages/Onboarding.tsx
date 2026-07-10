import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Award, BookOpen, Briefcase, CheckCircle2, FileText, FileUp, FolderGit2,
  Github, GraduationCap, Languages as LangIcon, Link2, Linkedin, Mail, Phone,
  Sparkles, User, XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import type { CVExtraction, Profile } from "@/api/types";
import { saveExtraction, streamImportCv } from "@/api/cv";
import { getProfile } from "@/api/profile";
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

/** ISO date → a short, friendly label ("9 Jul 2026"); falls back to the raw string. */
function friendlyDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

function SectionCard({ icon: Icon, title, count, children }: { icon: LucideIcon; title: string; count?: number; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent-ink"><Icon size={16} /></span>
        <CardTitle className="text-[15px]">{title}</CardTitle>
        {count != null && <Badge tone="neutral" className="ml-auto">{count}</Badge>}
      </CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}

function span(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}

function dateRange(start?: string | null, end?: string | null, current?: boolean): string {
  const e = current ? "present" : end || "";
  if (start && e) return `${start} – ${e}`;
  return start || e || "";
}

function fullName(name?: string | null, surname?: string | null): string {
  return [name, surname].filter(Boolean).join(" ") || "—";
}

function Meta({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-text-2">{children}</p>;
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
  // A CV imported on a previous visit, detected from the profile's `cv` provenance.
  const [existingCv, setExistingCv] = useState<{ filename: string | null; at: string | null; profile: Profile } | null>(null);
  const navigate = useNavigate();

  // On load, surface any CV that was already imported so the user sees it instead
  // of a blank dropzone (they can still import a new one, which replaces it).
  useEffect(() => {
    let alive = true;
    getProfile()
      .then((p) => {
        const cvSource = Object.values(p.field_sources ?? {}).find((s) => s?.source === "cv");
        if (alive && cvSource) setExistingCv({ filename: cvSource.detail ?? null, at: cvSource.at ?? null, profile: p });
      })
      .catch(() => {}); // no profile yet / offline — just show the empty dropzone
    return () => {
      alive = false;
    };
  }, []);

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
      await saveExtraction(extraction, true, fileName || undefined);
      toast.success("Profile saved", "Your CV is now part of your profile.");
      navigate("/profile");
    } catch (err) {
      toast.danger("Save failed", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const currentStep = phase === "upload" ? 0 : phase === "parsing" || phase === "failed" ? 1 : 2;
  const prof = extraction?.profile;
  const skills = extraction?.skills ?? [];
  const experiences = extraction?.experiences ?? [];
  const education = extraction?.education ?? [];
  const projects = extraction?.projects ?? [];
  const certificates = extraction?.certificates ?? [];
  const trainings = extraction?.trainings ?? [];
  const languages = extraction?.languages ?? [];
  const links = extraction?.links ?? [];

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
              {existingCv && (
                <div className="flex flex-wrap items-center gap-4 rounded-[16px] border border-border bg-surface p-4 shadow-soft" style={{ animation: "cll-rise 0.3s both" }}>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent-ink">
                    <FileText size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[15px] font-bold text-text">{existingCv.filename || "Imported CV"}</p>
                      <Badge tone="accent">On file</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-text-2">
                      {span(
                        fullName(existingCv.profile.name, existingCv.profile.surname),
                        existingCv.profile.email ?? undefined,
                        existingCv.at ? `imported ${friendlyDate(existingCv.at)}` : undefined,
                      )}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => navigate("/profile")}>
                    <User size={16} /> View in profile
                  </Button>
                </div>
              )}

              {existingCv && (
                <p className="text-[13.5px] font-semibold text-text">
                  Import a new CV{" "}
                  <span className="font-normal text-text-3">— this replaces what's currently in your profile</span>
                </p>
              )}

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
                Everything the model extracted is shown below
                {duration != null ? ` (in ${fmt(duration)})` : ""}. Review it, then save to your profile.
              </Alert>

              <div className="flex flex-wrap gap-2">
                {[
                  ["skills", skills.length], ["experience", experiences.length], ["education", education.length],
                  ["projects", projects.length], ["certificates", certificates.length],
                  ["trainings", trainings.length], ["languages", languages.length], ["links", links.length],
                ].filter(([, n]) => (n as number) > 0).map(([label, n]) => (
                  <Badge key={label as string} tone="accent">{n} {label}</Badge>
                ))}
              </div>

              <SectionCard icon={User} title="Profile">
                <p className="text-[16px] font-bold text-text">{fullName(prof?.name, prof?.surname)}</p>
                <div className="grid gap-1.5 text-[13.5px] text-text-2 sm:grid-cols-2">
                  {prof?.email && <span className="flex items-center gap-1.5"><Mail size={13} className="shrink-0 text-text-3" /> {prof.email}</span>}
                  {prof?.phone && <span className="flex items-center gap-1.5"><Phone size={13} className="shrink-0 text-text-3" /> {prof.phone}</span>}
                  {prof?.linkedin && <span className="flex items-center gap-1.5 truncate"><Linkedin size={13} className="shrink-0 text-text-3" /> <span className="truncate">{prof.linkedin}</span></span>}
                  {prof?.github && <span className="flex items-center gap-1.5 truncate"><Github size={13} className="shrink-0 text-text-3" /> <span className="truncate">{prof.github}</span></span>}
                </div>
                {prof?.summary && <p className="mt-1 text-[14px] text-text-2">{prof.summary}</p>}
              </SectionCard>

              {skills.length > 0 && (
                <SectionCard icon={Sparkles} title="Skills" count={skills.length}>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((s, i) => (
                      <SkillTag key={s.id ?? i}>
                        {s.name}{s.self_rating ? ` · ${s.self_rating}/5` : ""}
                      </SkillTag>
                    ))}
                  </div>
                </SectionCard>
              )}

              {experiences.length > 0 && (
                <SectionCard icon={Briefcase} title="Experience" count={experiences.length}>
                  {experiences.map((e, i) => (
                    <div key={e.id ?? i} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <p className="text-[14.5px] font-semibold text-text">{e.title} · {e.company}</p>
                      <Meta>{span(e.employment_type ?? undefined, e.location ?? undefined, dateRange(e.start_date, e.end_date, e.is_current))}</Meta>
                      {e.description && <p className="mt-1 text-[13.5px] text-text-2">{e.description}</p>}
                    </div>
                  ))}
                </SectionCard>
              )}

              {education.length > 0 && (
                <SectionCard icon={GraduationCap} title="Education" count={education.length}>
                  {education.map((ed, i) => (
                    <div key={ed.id ?? i} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <p className="text-[14.5px] font-semibold text-text">{ed.institution}</p>
                      <Meta>{span([ed.degree, ed.field].filter(Boolean).join(", ") || undefined, dateRange(ed.start_date, ed.end_date, ed.is_current), ed.gpa ? `GPA ${ed.gpa}` : undefined)}</Meta>
                    </div>
                  ))}
                </SectionCard>
              )}

              {projects.length > 0 && (
                <SectionCard icon={FolderGit2} title="Projects" count={projects.length}>
                  {projects.map((pr, i) => (
                    <div key={pr.id ?? i} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <p className="text-[14.5px] font-semibold text-text">{pr.name}{pr.role ? ` · ${pr.role}` : ""}</p>
                      {pr.description && <p className="mt-0.5 text-[13.5px] text-text-2">{pr.description}</p>}
                      {(pr.technologies?.length ?? 0) > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {pr.technologies!.map((t) => <SkillTag key={t}>{t}</SkillTag>)}
                        </div>
                      )}
                      {pr.url && <Meta>{pr.url}</Meta>}
                    </div>
                  ))}
                </SectionCard>
              )}

              {certificates.length > 0 && (
                <SectionCard icon={Award} title="Certificates" count={certificates.length}>
                  {certificates.map((c, i) => (
                    <div key={c.id ?? i} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <p className="text-[14.5px] font-semibold text-text">{c.name}</p>
                      <Meta>{span(c.issuer ?? undefined, c.cert_type ?? undefined, c.issue_date ?? undefined, c.credential_id ? `ID ${c.credential_id}` : undefined)}</Meta>
                    </div>
                  ))}
                </SectionCard>
              )}

              {trainings.length > 0 && (
                <SectionCard icon={BookOpen} title="Trainings" count={trainings.length}>
                  {trainings.map((t, i) => (
                    <div key={t.id ?? i} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <p className="text-[14.5px] font-semibold text-text">{t.name}</p>
                      <Meta>{span(t.provider ?? undefined, t.completion_date ?? undefined)}</Meta>
                      {t.description && <p className="mt-1 text-[13.5px] text-text-2">{t.description}</p>}
                    </div>
                  ))}
                </SectionCard>
              )}

              {languages.length > 0 && (
                <SectionCard icon={LangIcon} title="Languages" count={languages.length}>
                  <div className="flex flex-wrap gap-2">
                    {languages.map((l, i) => (
                      <SkillTag key={l.id ?? i}>{l.name}{l.proficiency ? ` · ${l.proficiency}` : ""}</SkillTag>
                    ))}
                  </div>
                </SectionCard>
              )}

              {links.length > 0 && (
                <SectionCard icon={Link2} title="Links" count={links.length}>
                  {links.map((l, i) => (
                    <div key={l.id ?? i}>
                      <p className="text-[14px] font-semibold text-text">{l.label}</p>
                      <Meta>{l.url}{l.description ? ` — ${l.description}` : ""}</Meta>
                    </div>
                  ))}
                </SectionCard>
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
