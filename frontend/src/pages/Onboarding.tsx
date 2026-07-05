import { useState } from "react";
import { CheckCircle2, FileText, FileUp, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Stepper } from "@/components/common/Stepper";
import { FileDropzone } from "@/components/common/FileDropzone";
import { SkillTag } from "@/components/common/SkillTag";
import { DevInspector } from "@/components/common/DevInspector";
import type { CVExtraction } from "@/api/types";
import { importCv, saveExtraction, type ImportResult } from "@/api/cv";
import { errorMessage } from "@/api/client";
import { toast } from "@/store/toast";

type Phase = "upload" | "parsing" | "review";

const STEPS = [
  { key: "upload", label: "Upload CV" },
  { key: "parse", label: "Extract & structure" },
  { key: "review", label: "Review & save" },
];

export function Onboarding() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [fileName, setFileName] = useState("");
  const [extraction, setExtraction] = useState<CVExtraction | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  async function handleFile(file: File) {
    setFileName(file.name);
    setPhase("parsing");
    try {
      const res = await importCv(file);
      setResult(res);
      if (!res.ok || !res.structured) {
        throw new Error(res.error || "Could not structure the CV");
      }
      setExtraction(res.structured);
      setPhase("review");
    } catch (err) {
      toast.danger("Import failed", errorMessage(err));
      setPhase("upload");
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

  const currentStep = phase === "upload" ? 0 : phase === "parsing" ? 1 : 2;
  const skills = extraction?.skills ?? [];
  const experiences = extraction?.experiences ?? [];
  const prof = extraction?.profile;

  return (
    <>
      <PageHeader
        eyebrow="Get started"
        title="Import your CV"
        icon={FileUp}
        description="Upload a PDF, Word doc, or image. We extract the text and structure it into your profile — all on your machine."
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
                  { icon: Sparkles, title: "Structured by AI", body: "Your experience, skills, and education are organized automatically." },
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

          {phase === "parsing" && (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
                <Spinner size={36} />
                <div>
                  <p className="text-[15px] font-semibold">Reading {fileName}…</p>
                  <p className="mt-1 text-[13.5px] text-text-2">Extracting text and structuring it with the local model.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {phase === "review" && (
            <div className="grid gap-5" style={{ animation: "cll-rise 0.4s both" }}>
              <Alert tone="success" title="CV parsed">
                We found your profile, {skills.length} skills, and {experiences.length} roles. Review below, then save.
              </Alert>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Profile</CardTitle>
                  <Badge tone="accent">Extracted</Badge>
                </CardHeader>
                <CardContent className="grid gap-1 text-[14px]">
                  <p className="font-semibold text-text">
                    {prof?.name} {prof?.surname}
                  </p>
                  <p className="text-text-2">{prof?.email}</p>
                  {prof?.summary && <p className="mt-1 text-text-2">{prof.summary}</p>}
                </CardContent>
              </Card>

              {skills.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Skills</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {skills.map((s, i) => (
                      <SkillTag key={s.id ?? i}>{s.name}</SkillTag>
                    ))}
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
                          <p className="text-[14px] font-semibold text-text">
                            {e.title} · {e.company}
                          </p>
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
                <Button variant="ghost" onClick={() => setPhase("upload")}>
                  Upload a different file
                </Button>
              </div>

              {result && (
                <DevInspector json={result.structured ?? result} raw={result.raw_output} />
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
