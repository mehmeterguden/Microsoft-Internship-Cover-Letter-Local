import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LetterDocument } from "@/features/letter/LetterDocument";
import { AiPanel, EditorTopBar, TemplateRail, ACCENTS, FONTS } from "@/features/letter/EditorPanels";
import { exportLetterPdf } from "@/features/letter/exportPdf";
import type { LetterContent, LetterDesign } from "@/features/letter/types";
import type { Job, Tone } from "@/api/types";
import { streamCoverLetter } from "@/api/coverLetter";
import { getProfile } from "@/api/profile";
import { createJob, getJob, updateJob } from "@/api/jobs";
import { errorMessage } from "@/api/client";
import { toast } from "@/store/toast";

const DEFAULT_BODY = `I've always been obsessed with making software feel effortless — the kind of tool that disappears into the work. That's exactly why this role caught my attention.

Across my projects I've shipped end to end and watched real people rely on what I built, and that feedback loop is what keeps me going. I care about craft: polish, ownership, and tools people actually use.

I'd love to bring that energy to your team.`;

export function Write() {
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const [company, setCompany] = useState("Microsoft");
  const [role, setRole] = useState("Software Engineer");
  const [tone, setTone] = useState<Tone>("warm");
  const [jd, setJd] = useState("");
  const [streaming, setStreaming] = useState(false);

  const [fontId, setFontId] = useState("serif");
  const [sizeId, setSizeId] = useState("md");
  const [design, setDesign] = useState<LetterDesign>({
    templateId: "sidebar",
    accent: ACCENTS[0]!,
    fontCss: FONTS[0]!.css,
    fontScale: 1,
  });

  const [content, setContent] = useState<LetterContent>({
    name: "Your Name",
    contact: "",
    place: today,
    greeting: "Dear Hiring Team,",
    subject: "Application for the Software Engineer position",
    body: DEFAULT_BODY,
  });

  const [params, setParams] = useSearchParams();
  const jobIdParam = params.get("job");
  const [jobId, setJobId] = useState<number | null>(jobIdParam ? Number(jobIdParam) : null);
  const [saving, setSaving] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Load a saved application into the editor, or seed contact from the profile.
  useEffect(() => {
    if (jobIdParam) {
      getJob(Number(jobIdParam))
        .then((job) => {
          setCompany(job.company);
          setRole(job.role);
          if (job.letter?.content) setContent((c) => ({ ...c, ...(job.letter!.content as Partial<LetterContent>) }));
          if (job.letter?.design) setDesign((d) => ({ ...d, ...(job.letter!.design as Partial<LetterDesign>) }));
        })
        .catch((err) => toast.danger("Couldn't load application", errorMessage(err)));
      return;
    }
    getProfile()
      .then((p) => {
        const name = [p.name, p.surname].filter(Boolean).join(" ");
        const contact = [p.phone, p.email, p.linkedin, p.github].filter(Boolean).join("  ·  ");
        setContent((c) => ({ ...c, name: name || c.name, contact: contact || c.contact }));
      })
      .catch(() => {});
  }, [jobIdParam]);

  function patch(p: Partial<LetterContent>) {
    setContent((c) => ({ ...c, ...p }));
  }

  async function generate() {
    if (!company.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    patch({
      body: "",
      greeting: `Dear ${company} Hiring Team,`,
      subject: role ? `Application for the ${role} position` : content.subject,
    });

    let acc = "";
    try {
      await streamCoverLetter(
        { company_name: company, role_title: role || null, job_description: jd || null, tone },
        (event) => {
          if (event.type === "token") {
            acc += event.text;
            // Drop a leading "Dear …," the model may include — we render our own greeting.
            patch({ body: acc.replace(/^\s*dear[^\n]*\n+/i, "").replace(/\n*(warmly|sincerely|best regards|regards)[,]?\s*$/i, "") });
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
      if (!controller.signal.aborted) toast.danger("Generation failed", err instanceof Error ? err.message : "Stream error");
      setStreaming(false);
    }
  }

  const [exporting, setExporting] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(`${content.greeting}\n\n${content.body}`);
    toast.success("Copied to clipboard");
  }

  function downloadTxt() {
    const text = `${content.subject}\n\n${content.greeting}\n\n${content.body}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cover-letter.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function save() {
    setSaving(true);
    const payload: Job = {
      company: company || "Untitled",
      role: role || "Role",
      status: "draft",
      letter: { content: { ...content }, design: { ...design } },
    };
    try {
      if (jobId != null) {
        await updateJob(jobId, { ...payload, id: jobId });
      } else {
        const created = await createJob(payload);
        if (created.id != null) {
          setJobId(created.id);
          setParams({ job: String(created.id) }, { replace: true });
        }
      }
      toast.success("Saved to applications");
    } catch (err) {
      toast.danger("Couldn't save", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    setExporting(true);
    try {
      await exportLetterPdf("letter-print");
      toast.success("PDF downloaded");
    } catch {
      toast.danger("Couldn't export PDF", "Try again in a moment.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg-2">
      <EditorTopBar onCopy={copy} onPdf={downloadPdf} onTxt={downloadTxt} onPrint={() => window.print()} onSave={save} exporting={exporting} saving={saving} />
      <div className="flex flex-1 overflow-hidden">
        <TemplateRail
          design={design}
          setDesign={setDesign}
          fontId={fontId}
          setFontId={setFontId}
          sizeId={sizeId}
          setSizeId={setSizeId}
        />
        <main className="flex-1 overflow-y-auto px-6 py-8">
          {streaming && (
            <div className="mx-auto mb-3 flex max-w-[820px] items-center gap-2 text-[12.5px] font-medium text-text-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Writing your letter…
            </div>
          )}
          <LetterDocument content={content} design={design} onChange={patch} />
        </main>
        <AiPanel
          company={company}
          role={role}
          tone={tone}
          jd={jd}
          streaming={streaming}
          onCompany={setCompany}
          onRole={setRole}
          onTone={setTone}
          onJd={setJd}
          onGenerate={generate}
          hasContent={content.body.trim() !== DEFAULT_BODY.trim() && content.body.trim() !== ""}
        />
      </div>
    </div>
  );
}
