import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BlockCanvas, type BlockOps } from "@/features/letter/BlockCanvas";
import { EditorTopBar, AiPanel, ACCENTS, FONTS, SIZES } from "@/features/letter/EditorPanels";
import { exportLetterPdf } from "@/features/letter/exportPdf";
import {
  defaultBlocks, makeBlock, paragraphsToBlocks, uid,
  type Block, type BlockType, type LetterDoc,
} from "@/features/letter/blockTypes";
import type { Job, Tone } from "@/api/types";
import { streamCoverLetter } from "@/api/coverLetter";
import { getProfile } from "@/api/profile";
import { createJob, getJob, updateJob } from "@/api/jobs";
import { errorMessage } from "@/api/client";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";

function stripHtml(html: string): string {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.textContent ?? "";
}

function plainText(blocks: Block[]): string {
  return blocks
    .map((b) => (b.type === "divider" ? "———" : b.type === "spacer" ? "" : stripHtml(b.html)))
    .filter((s) => s !== "")
    .join("\n\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function Write() {
  const [params, setParams] = useSearchParams();
  const jobIdParam = params.get("job");

  const [doc, setDoc] = useState<LetterDoc>({
    blocks: defaultBlocks(),
    accent: ACCENTS[0]!,
    fontCss: FONTS[0]!.css,
    fontScale: 1,
  });
  const [fontId, setFontId] = useState("serif");
  const [sizeId, setSizeId] = useState("md");
  const [activeId, setActiveId] = useState<string | null>(null);

  const [company, setCompany] = useState("Microsoft");
  const [role, setRole] = useState("Software Engineer");
  const [tone, setTone] = useState<Tone>("warm");
  const [jd, setJd] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobId, setJobId] = useState<number | null>(jobIdParam ? Number(jobIdParam) : null);

  const profileRef = useRef({ name: "Your Name", contact: "phone · email · links" });
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Load a saved application, or seed name/contact from the profile.
  useEffect(() => {
    if (jobIdParam) {
      getJob(Number(jobIdParam))
        .then((job) => {
          setCompany(job.company);
          setRole(job.role);
          const saved = (job.letter as { doc?: LetterDoc } | null)?.doc;
          if (saved?.blocks?.length) {
            setDoc(saved);
            setGenerated(true);
          }
        })
        .catch((err) => toast.danger("Couldn't load application", errorMessage(err)));
      return;
    }
    getProfile()
      .then((p) => {
        const name = [p.name, p.surname].filter(Boolean).join(" ") || "Your Name";
        const contact = [p.phone, p.email, p.linkedin, p.github].filter(Boolean).join("  ·  ") || "phone · email · links";
        profileRef.current = { name, contact };
        setDoc((d) => {
          const b = [...d.blocks];
          if (b[0]) b[0] = { ...b[0], html: esc(name) };
          if (b[1]) b[1] = { ...b[1], html: esc(contact) };
          return { ...d, blocks: b };
        });
      })
      .catch(() => {});
  }, [jobIdParam]);

  // ── block operations ──
  const setBlocks = (next: Block[]) => setDoc((d) => ({ ...d, blocks: next }));
  const ops: BlockOps = {
    activeId,
    setActiveId,
    setHtml: (id, html) => setDoc((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, html } : b)) })),
    update: (id, patch) => setDoc((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
    reorder: (ids) => setDoc((d) => ({ ...d, blocks: ids.map((id) => d.blocks.find((b) => b.id === id)!).filter(Boolean) })),
    remove: (id) => { setBlocks(doc.blocks.filter((b) => b.id !== id)); if (activeId === id) setActiveId(null); },
    duplicate: (id) => {
      const i = doc.blocks.findIndex((b) => b.id === id);
      if (i < 0) return;
      const copy = { ...doc.blocks[i]!, id: uid() };
      const next = [...doc.blocks];
      next.splice(i + 1, 0, copy);
      setBlocks(next);
    },
    add: (type: BlockType) => {
      const nb = makeBlock(type, type === "heading" ? "Heading" : type === "subheading" ? "Subheading" : type === "text" ? "New paragraph" : "");
      const i = activeId ? doc.blocks.findIndex((b) => b.id === activeId) : doc.blocks.length - 1;
      const next = [...doc.blocks];
      next.splice(i + 1, 0, nb);
      setBlocks(next);
      setActiveId(nb.id);
    },
  };

  async function generate() {
    if (!company.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setGenerated(true);

    const { name, contact } = profileRef.current;
    const bodyId = uid();
    setDoc((d) => ({
      ...d,
      blocks: [
        makeBlock("heading", esc(name)),
        { id: uid(), type: "text", html: esc(contact), align: "left", size: 0.85 },
        makeBlock("divider"),
        { id: uid(), type: "text", html: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), align: "left", size: 0.85 },
        makeBlock("subheading", esc(role ? `Application for the ${role} position` : "Cover letter")),
        makeBlock("text", esc(`Dear ${company} Hiring Team,`)),
        { id: bodyId, type: "text", html: "", align: "left" },
      ],
    }));

    let acc = "";
    try {
      await streamCoverLetter(
        { company_name: company, role_title: role || null, job_description: jd || null, tone },
        (event) => {
          if (event.type === "token") {
            acc += event.text;
            const clean = acc.replace(/^\s*dear[^\n]*\n+/i, "").replace(/\n*(warmly|sincerely|best regards|regards)[,]?\s*$/i, "");
            setDoc((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === bodyId ? { ...b, html: esc(clean).replace(/\n/g, "<br>") } : b)) }));
          } else if (event.type === "done") {
            // Split the streamed body into paragraph blocks.
            setDoc((d) => {
              const i = d.blocks.findIndex((b) => b.id === bodyId);
              if (i < 0) return d;
              const paras = paragraphsToBlocks(acc.replace(/^\s*dear[^\n]*\n+/i, "").replace(/\n*(warmly|sincerely|best regards|regards)[,]?\s*$/i, ""));
              const next = [...d.blocks];
              next.splice(i, 1, ...(paras.length ? paras : [d.blocks[i]!]));
              return { ...d, blocks: next };
            });
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

  async function save() {
    setSaving(true);
    const payload: Job = {
      company: company || "Untitled",
      role: role || "Role",
      status: "draft",
      letter: { content: { subject: role ? `Application for the ${role}` : "Cover letter" }, design: {}, doc } as unknown as Job["letter"],
    };
    try {
      if (jobId != null) await updateJob(jobId, { ...payload, id: jobId });
      else {
        const created = await createJob(payload);
        if (created.id != null) { setJobId(created.id); setParams({ job: String(created.id) }, { replace: true }); }
      }
      toast.success("Saved to applications");
    } catch (err) {
      toast.danger("Couldn't save", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function copy() {
    navigator.clipboard?.writeText(plainText(doc.blocks));
    toast.success("Copied to clipboard");
  }
  function downloadTxt() {
    const blob = new Blob([plainText(doc.blocks)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "cover-letter.txt"; a.click();
    URL.revokeObjectURL(url);
  }
  async function downloadPdf() {
    setExporting(true);
    try { await exportLetterPdf("letter-print"); toast.success("PDF downloaded"); }
    catch { toast.danger("Couldn't export PDF", "Try again in a moment."); }
    finally { setExporting(false); }
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg-2">
      <EditorTopBar onCopy={copy} onPdf={downloadPdf} onTxt={downloadTxt} onPrint={() => window.print()} onSave={save} exporting={exporting} saving={saving} />
      <div className="flex flex-1 overflow-hidden">
        {/* Style rail */}
        <aside className="w-[220px] shrink-0 overflow-y-auto bg-navy p-4 text-white">
          <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/45">Accent color</p>
          <div className="flex flex-wrap gap-2.5">
            {ACCENTS.map((c) => (
              <button key={c} type="button" aria-label={`Accent ${c}`} onClick={() => setDoc((d) => ({ ...d, accent: c }))}
                className={cn("h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-navy transition", doc.accent === c ? "ring-white" : "ring-transparent")}
                style={{ background: c }} />
            ))}
          </div>
          <p className="mb-2.5 mt-6 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/45">Base font</p>
          <div className="grid grid-cols-2 gap-2">
            {FONTS.map((f) => (
              <button key={f.id} type="button" onClick={() => { setFontId(f.id); setDoc((d) => ({ ...d, fontCss: f.css })); }} style={{ fontFamily: f.css }}
                className={cn("rounded-[9px] border px-3 py-2 text-[13px] font-semibold transition", fontId === f.id ? "border-accent bg-accent/20 text-white" : "border-white/12 text-white/60 hover:border-white/30")}>
                {f.label}
              </button>
            ))}
          </div>
          <p className="mb-2.5 mt-6 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/45">Base size</p>
          <div className="inline-flex rounded-[9px] border border-white/12 p-1">
            {SIZES.map((s) => (
              <button key={s.id} type="button" onClick={() => { setSizeId(s.id); setDoc((d) => ({ ...d, fontScale: s.scale })); }}
                className={cn("rounded-[6px] px-3.5 py-1.5 text-[13px] font-semibold transition", sizeId === s.id ? "bg-accent text-on-accent" : "text-white/55 hover:text-white")}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-6 text-[11px] leading-relaxed text-white/40">
            Click any block to edit it. Use the toolbar to format, drag the handle to reorder, or add and delete blocks.
          </p>
        </aside>

        {/* Canvas */}
        <main className="flex-1 overflow-auto px-6 py-6" onMouseDown={(e) => { if (e.target === e.currentTarget) setActiveId(null); }}>
          {streaming && (
            <div className="mx-auto mb-3 flex max-w-[794px] items-center gap-2 text-[12.5px] font-medium text-text-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Writing your letter…
            </div>
          )}
          <BlockCanvas doc={doc} ops={ops} />
        </main>

        {/* AI panel */}
        <AiPanel company={company} role={role} tone={tone} jd={jd} streaming={streaming}
          onCompany={setCompany} onRole={setRole} onTone={setTone} onJd={setJd} onGenerate={generate} hasContent={generated} />
      </div>
    </div>
  );
}
