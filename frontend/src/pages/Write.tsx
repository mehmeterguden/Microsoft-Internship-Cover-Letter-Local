import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Type, Heading, Minus as LineIcon, Square } from "lucide-react";
import { Canvas, type CanvasOps } from "@/features/canvas/Canvas";
import { CanvasToolbar } from "@/features/canvas/CanvasToolbar";
import { EditorTopBar, AiPanel, ACCENTS } from "@/features/letter/EditorPanels";
import { exportLetterPdf } from "@/features/letter/exportPdf";
import { defaultElements, esc, makeEl, uid, type CanvasDoc, type El, type ElType } from "@/features/canvas/types";
import type { Job, Tone } from "@/api/types";
import { streamCoverLetter } from "@/api/coverLetter";
import { getProfile } from "@/api/profile";
import { createJob, getJob, updateJob } from "@/api/jobs";
import { errorMessage } from "@/api/client";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";

function plainText(elements: El[]): string {
  const d = document.createElement("div");
  return elements
    .filter((e) => e.type === "text" || e.type === "heading")
    .map((e) => { d.innerHTML = e.html ?? ""; return d.textContent ?? ""; })
    .filter(Boolean)
    .join("\n\n");
}

export function Write() {
  const [params, setParams] = useSearchParams();
  const jobIdParam = params.get("job");

  const [doc, setDoc] = useState<CanvasDoc>({ elements: defaultElements(ACCENTS[0]!), accent: ACCENTS[0]! });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [company, setCompany] = useState("Microsoft");
  const [role, setRole] = useState("Software Engineer");
  const [tone, setTone] = useState<Tone>("warm");
  const [jd, setJd] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobId, setJobId] = useState<number | null>(jobIdParam ? Number(jobIdParam) : null);

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (jobIdParam) {
      getJob(Number(jobIdParam))
        .then((job) => {
          setCompany(job.company);
          setRole(job.role);
          const c = (job.letter as { canvas?: CanvasDoc } | null)?.canvas;
          if (c?.elements?.length) { setDoc(c); setGenerated(true); }
        })
        .catch((err) => toast.danger("Couldn't load application", errorMessage(err)));
      return;
    }
    getProfile()
      .then((p) => {
        const name = [p.name, p.surname].filter(Boolean).join(" ") || "Your Name";
        const contact = [p.phone, p.email, p.linkedin, p.github].filter(Boolean).join("  ·  ") || "phone · email · linkedin";
        setDoc((d) => {
          const els = [...d.elements];
          if (els[0]) els[0] = { ...els[0], html: esc(name) };
          if (els[1]) els[1] = { ...els[1], html: esc(contact) };
          return { ...d, elements: els };
        });
      })
      .catch(() => {});
  }, [jobIdParam]);

  const selected = doc.elements.find((e) => e.id === selectedId) ?? null;
  const setEls = (els: El[]) => setDoc((d) => ({ ...d, elements: els }));

  const ops: CanvasOps = {
    selectedId,
    editingId,
    setSelectedId,
    setEditingId,
    update: (id, patch) => setDoc((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
    setHtml: (id, html) => setDoc((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, html } : e)) })),
  };

  function updateSel(patch: Partial<El>) { if (selectedId) ops.update(selectedId, patch); }
  function remove() { if (!selectedId) return; setEls(doc.elements.filter((e) => e.id !== selectedId)); setSelectedId(null); setEditingId(null); }
  function duplicate() {
    if (!selected) return;
    const copy = { ...selected, id: uid(), x: selected.x + 16, y: selected.y + 16 };
    setEls([...doc.elements, copy]);
    setSelectedId(copy.id);
  }
  function layer(dir: 1 | -1) {
    if (!selectedId) return;
    const i = doc.elements.findIndex((e) => e.id === selectedId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= doc.elements.length) return;
    const els = [...doc.elements];
    [els[i], els[j]] = [els[j]!, els[i]!];
    setEls(els);
  }
  function add(type: ElType) {
    const off = (doc.elements.length % 6) * 18;
    const el = makeEl(type, 120 + off, 140 + off);
    if (type === "line" || type === "rect") el.color = type === "line" ? doc.accent : "#e6f5ef";
    setEls([...doc.elements, el]);
    setSelectedId(el.id);
  }

  function findBodyId(): string {
    if (selected && (selected.type === "text")) return selected.id;
    const texts = doc.elements.filter((e) => e.type === "text");
    if (texts.length) return texts.reduce((a, b) => (b.h > a.h ? b : a)).id;
    const nb = makeEl("text", 64, 272);
    nb.w = 666; nb.h = 360;
    setEls([...doc.elements, nb]);
    return nb.id;
  }

  async function generate() {
    if (!company.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setGenerated(true);
    const bodyId = findBodyId();
    ops.setHtml(bodyId, "");
    let acc = "";
    try {
      await streamCoverLetter(
        { company_name: company, role_title: role || null, job_description: jd || null, tone },
        (event) => {
          if (event.type === "token") { acc += event.text; ops.setHtml(bodyId, esc(acc).replace(/\n/g, "<br>")); }
          else if (event.type === "done") setStreaming(false);
          else if (event.type === "fatal") { toast.danger("Generation failed", event.error); setStreaming(false); }
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
    const payload: Job = { company: company || "Untitled", role: role || "Role", status: "draft", letter: { canvas: doc } as unknown as Job["letter"] };
    try {
      if (jobId != null) await updateJob(jobId, { ...payload, id: jobId });
      else { const created = await createJob(payload); if (created.id != null) { setJobId(created.id); setParams({ job: String(created.id) }, { replace: true }); } }
      toast.success("Saved to applications");
    } catch (err) { toast.danger("Couldn't save", errorMessage(err)); }
    finally { setSaving(false); }
  }

  function copy() { navigator.clipboard?.writeText(plainText(doc.elements)); toast.success("Copied to clipboard"); }
  function downloadTxt() {
    const blob = new Blob([plainText(doc.elements)], { type: "text/plain" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "cover-letter.txt"; a.click(); URL.revokeObjectURL(url);
  }
  async function downloadPdf() {
    setSelectedId(null); setEditingId(null);
    setExporting(true);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try { await exportLetterPdf("letter-print"); toast.success("PDF downloaded"); }
    catch { toast.danger("Couldn't export PDF", "Try again in a moment."); }
    finally { setExporting(false); }
  }

  const ADD_ITEMS: { type: ElType; label: string; icon: typeof Type }[] = [
    { type: "text", label: "Text", icon: Type },
    { type: "heading", label: "Heading", icon: Heading },
    { type: "line", label: "Line", icon: LineIcon },
    { type: "rect", label: "Box", icon: Square },
  ];

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg-2">
      <EditorTopBar onCopy={copy} onPdf={downloadPdf} onTxt={downloadTxt} onPrint={() => window.print()} onSave={save} exporting={exporting} saving={saving} />
      <div className="flex flex-1 overflow-hidden">
        {/* Left rail: add + accent */}
        <aside className="w-[210px] shrink-0 overflow-y-auto bg-navy p-4 text-white">
          <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/45">Add element</p>
          <div className="grid grid-cols-2 gap-2">
            {ADD_ITEMS.map(({ type, label, icon: Icon }) => (
              <button key={type} type="button" onClick={() => add(type)}
                className="flex flex-col items-center gap-1.5 rounded-[10px] border border-white/12 py-3 text-[12px] font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white">
                <Icon size={18} /> {label}
              </button>
            ))}
          </div>
          <p className="mb-2.5 mt-6 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/45">Accent</p>
          <div className="flex flex-wrap gap-2.5">
            {ACCENTS.map((c) => (
              <button key={c} type="button" aria-label={`Accent ${c}`} onClick={() => setDoc((d) => ({ ...d, accent: c }))}
                className={cn("h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-navy transition", doc.accent === c ? "ring-white" : "ring-transparent")}
                style={{ background: c }} />
            ))}
          </div>
          <p className="mt-6 text-[11px] leading-relaxed text-white/40">
            Click an element to select · drag to move · pull the corners to resize · double-click text to edit.
          </p>
        </aside>

        {/* Canvas */}
        <main className="flex flex-1 flex-col overflow-auto">
          <div className="sticky top-0 z-20 border-b border-border bg-bg-2/80 px-6 py-3 backdrop-blur">
            <CanvasToolbar el={selected} onEl={updateSel} onDelete={remove} onDuplicate={duplicate} onForward={() => layer(1)} onBack={() => layer(-1)} onAdd={add} />
          </div>
          <div className="flex-1 px-6 py-8">
            {streaming && (
              <div className="mx-auto mb-3 flex max-w-[794px] items-center gap-2 text-[12.5px] font-medium text-text-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Writing your letter…
              </div>
            )}
            <Canvas elements={doc.elements} ops={ops} />
          </div>
        </main>

        <AiPanel company={company} role={role} tone={tone} jd={jd} streaming={streaming}
          onCompany={setCompany} onRole={setRole} onTone={setTone} onJd={setJd} onGenerate={generate} hasContent={generated} />
      </div>
    </div>
  );
}
