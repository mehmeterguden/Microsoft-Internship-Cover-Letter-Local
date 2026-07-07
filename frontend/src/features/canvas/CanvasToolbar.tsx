import { useEffect, useRef } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, BringToFront, Copy, Italic, List,
  Minus, Plus, SendToBack, Trash2, Type, Underline,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Align, El, ElType } from "./types";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const FONTS = [
  { id: "serif", label: "Serif", css: 'Georgia, "Times New Roman", serif' },
  { id: "sans", label: "Sans", css: "var(--font-sans)" },
  { id: "grotesk", label: "Grotesk", css: "var(--font-display)" },
  { id: "mono", label: "Mono", css: "var(--font-mono)" },
];
const COLORS = ["#131a2e", "#55617a", "#0ea373", "#2f6f9e", "#6d5bd6", "#b4780f", "#dc5b4b", "#ffffff"];

function Btn({ icon: Icon, label, active, onClick, keepSel }: { icon: LucideIcon; label: string; active?: boolean; onClick: () => void; keepSel?: boolean }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={label}
      aria-label={label}
      onPointerDown={keepSel ? (e) => e.preventDefault() : undefined}
      onMouseDown={keepSel ? (e) => e.preventDefault() : undefined}
      onClick={onClick}
      className={cn("grid h-8 w-8 place-items-center rounded-[8px] text-text-2 transition-colors hover:bg-surface-2 hover:text-text", active && "bg-accent-soft text-accent-ink")}
    >
      <Icon size={16} />
    </button>
  );
}
const Sep = () => <span className="mx-1 h-6 w-px bg-line" />;

export function CanvasToolbar({
  el,
  onEl,
  onDelete,
  onDuplicate,
  onForward,
  onBack,
  onAdd,
}: {
  el: El | null;
  onEl: (patch: Partial<El>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onForward: () => void;
  onBack: () => void;
  onAdd: (type: ElType) => void;
}) {
  const isText = el && (el.type === "text" || el.type === "heading");

  // Save the in-element text selection so toolbar clicks can restore it.
  const saved = useRef<{ range: Range; host: HTMLElement } | null>(null);
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      const host = document.activeElement as HTMLElement | null;
      if (sel && sel.rangeCount && host?.isContentEditable && host.closest("#letter-print")) {
        saved.current = { range: sel.getRangeAt(0).cloneRange(), host };
      }
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);
  const exec = (cmd: string, value?: string) => {
    const s = saved.current;
    if (s) { s.host.focus(); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(s.range); }
    document.execCommand(cmd, false, value);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-[12px] border border-border bg-surface px-2 py-1.5 shadow-soft">
      {/* Add elements */}
      <Select
        value=""
        onChange={(e) => { if (e.target.value) onAdd(e.target.value as ElType); }}
        className="h-8 w-auto rounded-[8px] border-accent/40 bg-accent-soft px-2 text-[12.5px] font-semibold text-accent-ink"
      >
        <option value="">+ Add</option>
        <option value="text">Text</option>
        <option value="heading">Heading</option>
        <option value="line">Line</option>
        <option value="rect">Box</option>
      </Select>

      {el && <Sep />}

      {isText && (
        <>
          <Btn icon={Bold} label="Bold" keepSel onClick={() => exec("bold")} />
          <Btn icon={Italic} label="Italic" keepSel onClick={() => exec("italic")} />
          <Btn icon={Underline} label="Underline" keepSel onClick={() => exec("underline")} />
          <Btn icon={List} label="List" keepSel onClick={() => exec("insertUnorderedList")} />
          <Sep />
          <Select
            value={FONTS.find((f) => f.css === el?.fontFamily)?.id ?? "sans"}
            onChange={(e) => onEl({ fontFamily: FONTS.find((f) => f.id === e.target.value)?.css })}
            className="h-8 w-auto rounded-[8px] px-2 text-[12.5px] font-medium"
            title="Font"
          >
            {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </Select>
          <div className="flex items-center rounded-[8px] border border-border" title="Font size">
            <button type="button" aria-label="Smaller" onClick={() => onEl({ fontSize: Math.max(8, (el!.fontSize ?? 16) - 1) })} className="grid h-8 w-7 place-items-center text-text-2 hover:text-text"><Minus size={13} /></button>
            <span className="w-7 text-center text-[12px] tabular-nums text-text-2">{el!.fontSize ?? 16}</span>
            <button type="button" aria-label="Larger" onClick={() => onEl({ fontSize: Math.min(96, (el!.fontSize ?? 16) + 1) })} className="grid h-8 w-7 place-items-center text-text-2 hover:text-text"><Plus size={13} /></button>
          </div>
          <Btn icon={Type} label="Toggle bold weight" active={(el!.weight ?? 400) >= 700} onClick={() => onEl({ weight: (el!.weight ?? 400) >= 700 ? 400 : 700 })} />
          <div className="flex items-center rounded-[8px] border border-border">
            {(["left", "center", "right"] as Align[]).map((a) => (
              <button key={a} type="button" aria-label={`Align ${a}`} onClick={() => onEl({ align: a })}
                className={cn("grid h-8 w-8 place-items-center text-text-2 hover:text-text", el?.align === a && "bg-accent-soft text-accent-ink")}>
                {a === "left" ? <AlignLeft size={15} /> : a === "center" ? <AlignCenter size={15} /> : <AlignRight size={15} />}
              </button>
            ))}
          </div>
        </>
      )}

      {el && (
        <>
          <Sep />
          <div className="flex items-center gap-1" title={isText ? "Text color" : "Color"}>
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Color ${c}`}
                onPointerDown={isText ? (e) => e.preventDefault() : undefined}
                onMouseDown={isText ? (e) => e.preventDefault() : undefined}
                onClick={() => (isText ? (exec("foreColor", c), onEl({ color: c })) : onEl({ color: c }))}
                className="h-5 w-5 rounded-full border border-border" style={{ background: c }} />
            ))}
          </div>
          <Sep />
          <Btn icon={BringToFront} label="Bring forward" onClick={onForward} />
          <Btn icon={SendToBack} label="Send back" onClick={onBack} />
          <Btn icon={Copy} label="Duplicate" onClick={onDuplicate} />
          <Btn icon={Trash2} label="Delete" onClick={onDelete} />
        </>
      )}
    </div>
  );
}
