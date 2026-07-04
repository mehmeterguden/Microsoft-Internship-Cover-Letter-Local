import { useState } from "react";
import { CheckCircle2, FileText, Sparkles } from "lucide-react";
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
import { mockExperiences, mockProfile, mockSkills } from "@/mocks/data";
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
  const navigate = useNavigate();

  function handleFile(file: File) {
    setFileName(file.name);
    setPhase("parsing");
    window.setTimeout(() => setPhase("review"), 1600);
  }

  const currentStep = phase === "upload" ? 0 : phase === "parsing" ? 1 : 2;

  return (
    <>
      <PageHeader
        eyebrow="Get started"
        title="Import your CV"
        description="Upload a PDF, Word doc, or image. We extract the text and structure it into your profile — all on your machine."
      />

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <Stepper steps={STEPS} current={currentStep} className="lg:sticky lg:top-10 lg:self-start" />

        <div className="min-w-0">
          {phase === "upload" && (
            <FileDropzone accept=".pdf,.docx,.png,.jpg,.jpeg" hint="PDF, DOCX or image · max 15 MB" onFile={handleFile} />
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
                We found your profile, {mockSkills.length} skills, and {mockExperiences.length} roles. Review below, then save.
              </Alert>

              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Profile</CardTitle>
                  <Badge tone="accent">High confidence</Badge>
                </CardHeader>
                <CardContent className="grid gap-1 text-[14px]">
                  <p className="font-semibold text-text">
                    {mockProfile.name} {mockProfile.surname}
                  </p>
                  <p className="text-text-2">{mockProfile.email}</p>
                  <p className="mt-1 text-text-2">{mockProfile.summary}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Skills</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {mockSkills.map((s) => (
                    <SkillTag key={s.id}>{s.name}</SkillTag>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText size={16} className="text-text-3" /> Experience
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {mockExperiences.map((e) => (
                    <div key={e.id} className="flex items-start gap-3">
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

              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    toast.success("Profile saved", "Your CV is now part of your profile.");
                    navigate("/profile");
                  }}
                >
                  <Sparkles size={16} /> Save to profile
                </Button>
                <Button variant="ghost" onClick={() => setPhase("upload")}>
                  Upload a different file
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
