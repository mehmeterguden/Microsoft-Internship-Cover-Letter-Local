import { useEffect, useRef } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Copy, Italic, List, ListOrdered,
  Minus, Plus, Trash2, Underline,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Align, Block, BlockType } from "./blockTypes";
import { cn } from "@/lib/utils";

export const FONTS = [
  { id: "serif", label: "Serif", css: 'Georgia, "Times New Roman", serif' },
  { id: "sans", label: "Sans", css: "var(--font-sans)" },
  { id: "grotesk", label: "Grotesk", css: "var(--font-display)" },
  { id: "mono", label: "Mono", css: "var(--font-mono)" },
];

const TEXT_COLORS = ["#131a2e", "#55617a", "#0ea373", "#2f6f9e", "#6d5bd6", "#b4780f", "#dc5b4b", "#ffffff"];

function TBtn({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={label}
      aria-label={label}
      onPointerDown={(e) => e.preventDefault()} // keep the editor selection/focus
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-[8px] text-text-2 transition-colors hover:bg-surface-2 hover:text-text",
        active && "bg-accent-soft text-accent-ink",
      )}
    >
      <Icon size={16} />
    </button>
  );
}

const Sep = () => <span className="mx-1 h-6 w-px bg-line" />;

export function EditorToolbar({
  active,
  onBlock,
  onDelete,
  onDuplicate,
  onAdd,
}: {
  active: Block | null;
  onBlock: (patch: Partial<Block>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAdd: (type: BlockType) => void;
}) {
  const disabled = !active;
  const isText = active && active.type !== "divider" && active.type !== "spacer";

  // Remember the last selection inside the letter so toolbar clicks (which move
  // focus to the button) can restore it before running a formatting command.
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
    if (s) {
      s.host.focus();
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(s.range);
    }
    document.execCommand(cmd, false, value);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-[12px] border border-border bg-surface px-2 py-1.5 shadow-soft">
      {/* Inline text formatting (acts on the current selection). */}
      <TBtn icon={Bold} label="Bold" onClick={() => exec("bold")} />
      <TBtn icon={Italic} label="Italic" onClick={() => exec("italic")} />
      <TBtn icon={Underline} label="Underline" onClick={() => exec("underline")} />
      <TBtn icon={List} label="Bulleted list" onClick={() => exec("insertUnorderedList")} />
      <TBtn icon={ListOrdered} label="Numbered list" onClick={() => exec("insertOrderedList")} />

      <Sep />
      <div className="flex items-center gap-1" title="Text color">
        {TEXT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            tabIndex={-1}
            aria-label={`Color ${c}`}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("foreColor", c)}
            className="h-5 w-5 rounded-full border border-border"
            style={{ background: c }}
          />
        ))}
      </div>

      <Sep />
      {/* Block-level controls. */}
      <select
        value={active?.type ?? "text"}
        disabled={disabled}
        onChange={(e) => onBlock({ type: e.target.value as BlockType })}
        className="h-8 rounded-[8px] border border-border bg-surface px-2 text-[12.5px] font-medium text-text disabled:opacity-50"
      >
        <option value="heading">Heading</option>
        <option value="subheading">Subheading</option>
        <option value="text">Body text</option>
        <option value="divider">Divider</option>
        <option value="spacer">Spacer</option>
      </select>

      {isText && (
        <>
          <select
            value={FONTS.find((f) => f.css === active?.fontFamily)?.id ?? "__doc"}
            onChange={(e) => onBlock({ fontFamily: e.target.value === "__doc" ? undefined : FONTS.find((f) => f.id === e.target.value)?.css })}
            className="h-8 rounded-[8px] border border-border bg-surface px-2 text-[12.5px] font-medium text-text"
            title="Font"
          >
            <option value="__doc">Default font</option>
            {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>

          <div className="flex items-center rounded-[8px] border border-border" title="Text size">
            <button type="button" aria-label="Smaller" onClick={() => onBlock({ size: Math.max(0.6, (active!.size ?? 1) - 0.1) })} className="grid h-8 w-7 place-items-center text-text-2 hover:text-text"><Minus size={13} /></button>
            <span className="w-8 text-center text-[12px] tabular-nums text-text-2">{Math.round((active!.size ?? 1) * 100)}</span>
            <button type="button" aria-label="Larger" onClick={() => onBlock({ size: Math.min(2.4, (active!.size ?? 1) + 0.1) })} className="grid h-8 w-7 place-items-center text-text-2 hover:text-text"><Plus size={13} /></button>
          </div>

          <div className="flex items-center rounded-[8px] border border-border">
            {(["left", "center", "right"] as Align[]).map((a) => (
              <button
                key={a}
                type="button"
                aria-label={`Align ${a}`}
                onClick={() => onBlock({ align: a })}
                className={cn("grid h-8 w-8 place-items-center text-text-2 hover:text-text", active?.align === a && "bg-accent-soft text-accent-ink")}
              >
                {a === "left" ? <AlignLeft size={15} /> : a === "center" ? <AlignCenter size={15} /> : <AlignRight size={15} />}
              </button>
            ))}
          </div>
        </>
      )}

      <Sep />
      <TBtn icon={Copy} label="Duplicate block" onClick={onDuplicate} />
      <TBtn icon={Trash2} label="Delete block" onClick={onDelete} />

      <Sep />
      <select
        value=""
        onChange={(e) => { if (e.target.value) onAdd(e.target.value as BlockType); e.currentTarget.value = ""; }}
        className="h-8 rounded-[8px] border border-accent/40 bg-accent-soft px-2 text-[12.5px] font-semibold text-accent-ink"
      >
        <option value="">+ Add block</option>
        <option value="text">Body text</option>
        <option value="heading">Heading</option>
        <option value="subheading">Subheading</option>
        <option value="divider">Divider</option>
        <option value="spacer">Spacer</option>
      </select>
    </div>
  );
}
