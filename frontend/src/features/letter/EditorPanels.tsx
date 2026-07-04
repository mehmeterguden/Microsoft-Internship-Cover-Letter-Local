import { ArrowLeft, Copy, Download, FileText, Printer, Save, Sparkles, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/common/Logo";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATES, TemplateThumb } from "./templates";
import type { LetterDesign } from "./types";
import type { Tone } from "@/api/types";

export const ACCENTS = ["#0ea373", "#0b1226", "#2f6f9e", "#6d5bd6", "#b4780f", "#dc5b4b", "#c026a3", "#0891b2"];

export const FONTS = [
  { id: "serif", label: "Serif", css: 'Georgia, "Times New Roman", serif' },
  { id: "sans", label: "Sans", css: "var(--font-sans)" },
  { id: "grotesk", label: "Grotesk", css: "var(--font-display)" },
  { id: "mono", label: "Mono", css: "var(--font-mono)" },
];

export const SIZES = [
  { id: "sm", label: "S", scale: 0.92 },
  { id: "md", label: "M", scale: 1 },
  { id: "lg", label: "L", scale: 1.08 },
];

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "warm", label: "Warm" },
  { value: "confident", label: "Confident" },
  { value: "concise", label: "Concise" },
];

export function EditorTopBar({
  onCopy,
  onPdf,
  onTxt,
  onPrint,
  onSave,
  exporting,
  saving,
}: {
  onCopy: () => void;
  onPdf: () => void;
  onTxt: () => void;
  onPrint: () => void;
  onSave: () => void;
  exporting: boolean;
  saving: boolean;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-5">
      <Link to="/applications" className="inline-flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] font-semibold text-text-2 transition-colors hover:bg-surface-2 hover:text-text">
        <ArrowLeft size={16} /> Exit
      </Link>
      <span className="hidden h-6 w-px bg-line sm:block" />
      <Logo className="hidden sm:inline-flex" />
      <span className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCopy}><Copy size={15} /> Copy</Button>
        <Button variant="ghost" size="sm" onClick={onTxt}><FileText size={15} /> .txt</Button>
        <Button variant="ghost" size="sm" onClick={onPrint}><Printer size={15} /> Print</Button>
        <Button variant="secondary" size="sm" onClick={onPdf} loading={exporting}><Download size={15} /> PDF</Button>
        <Button size="sm" onClick={onSave} loading={saving}><Save size={15} /> Save</Button>
      </span>
    </header>
  );
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/45">{children}</p>;
}

export function TemplateRail({
  design,
  setDesign,
  fontId,
  setFontId,
  sizeId,
  setSizeId,
}: {
  design: LetterDesign;
  setDesign: (fn: (d: LetterDesign) => LetterDesign) => void;
  fontId: string;
  setFontId: (id: string) => void;
  sizeId: string;
  setSizeId: (id: string) => void;
}) {
  return (
    <aside className="w-[260px] shrink-0 overflow-y-auto bg-navy p-4 text-white">
      <RailHeading>Templates</RailHeading>
      <div className="grid grid-cols-2 gap-2.5">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" onClick={() => setDesign((d) => ({ ...d, templateId: t.id }))} className="text-left">
            <div className={cn("h-[86px] overflow-hidden rounded-[9px] border-2 transition", design.templateId === t.id ? "border-accent ring-2 ring-accent/40" : "border-white/10 hover:border-white/30")}>
              <TemplateThumb id={t.id} accent={design.accent} />
            </div>
            <span className={cn("mt-1 block text-[11.5px] font-medium", design.templateId === t.id ? "text-white" : "text-white/55")}>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <RailHeading>Accent color</RailHeading>
        <div className="flex flex-wrap gap-2.5">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Accent ${c}`}
              onClick={() => setDesign((d) => ({ ...d, accent: c }))}
              className={cn("h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-navy transition", design.accent === c ? "ring-white" : "ring-transparent")}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <RailHeading>Font</RailHeading>
        <div className="grid grid-cols-2 gap-2">
          {FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => { setFontId(f.id); setDesign((d) => ({ ...d, fontCss: f.css })); }}
              style={{ fontFamily: f.css }}
              className={cn("rounded-[9px] border px-3 py-2 text-[13px] font-semibold transition", fontId === f.id ? "border-accent bg-accent/20 text-white" : "border-white/12 text-white/60 hover:border-white/30")}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <RailHeading>Text size</RailHeading>
        <div className="inline-flex rounded-[9px] border border-white/12 p-1">
          {SIZES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setSizeId(s.id); setDesign((d) => ({ ...d, fontScale: s.scale })); }}
              className={cn("rounded-[6px] px-3.5 py-1.5 text-[13px] font-semibold transition", sizeId === s.id ? "bg-accent text-on-accent" : "text-white/55 hover:text-white")}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function AiPanel({
  company,
  role,
  tone,
  jd,
  streaming,
  onCompany,
  onRole,
  onTone,
  onJd,
  onGenerate,
  hasContent,
}: {
  company: string;
  role: string;
  tone: Tone;
  jd: string;
  streaming: boolean;
  onCompany: (v: string) => void;
  onRole: (v: string) => void;
  onTone: (v: Tone) => void;
  onJd: (v: string) => void;
  onGenerate: () => void;
  hasContent: boolean;
}) {
  return (
    <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-accent-soft text-accent-ink"><Sparkles size={18} /></span>
        <div>
          <p className="text-[15px] font-bold leading-tight">AI Assistant</p>
          <p className="text-[12px] text-text-3">Generate, then edit anything inline</p>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company" htmlFor="w-co"><Input id="w-co" value={company} onChange={(e) => onCompany(e.target.value)} /></Field>
          <Field label="Role" htmlFor="w-ro"><Input id="w-ro" value={role} onChange={(e) => onRole(e.target.value)} /></Field>
        </div>
        <Field label="Tone" htmlFor="w-tone">
          <Select id="w-tone" value={tone} onChange={(e) => onTone(e.target.value as Tone)}>
            {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Job description" htmlFor="w-jd" hint="Optional — grounds the letter">
          <Textarea id="w-jd" value={jd} onChange={(e) => onJd(e.target.value)} className="min-h-28" />
        </Field>
        <Button onClick={onGenerate} loading={streaming} className="w-full">
          {hasContent ? <RefreshCw size={16} /> : <Sparkles size={16} />}
          {hasContent ? "Regenerate" : "Generate letter"}
        </Button>
      </div>

      <div className="mt-5 rounded-[12px] bg-surface-2 p-3.5 text-[12.5px] leading-relaxed text-text-2">
        <span className="font-semibold text-text">Tip:</span> click any text on the letter — your name, the
        subject, the body — to edit it directly. Pick a template and colors on the left.
      </div>
    </aside>
  );
}
