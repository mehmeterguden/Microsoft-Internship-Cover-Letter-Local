import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { RichText } from "./RichText";
import type { Block, LetterDoc } from "./blockTypes";
import { cn } from "@/lib/utils";

export function SortableBlock({
  block,
  doc,
  active,
  editing,
  onSelect,
  onFocus,
  onChange,
}: {
  block: Block;
  doc: LetterDoc;
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onChange: (html: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: !editing });

  const wrap: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const base = 15 * doc.fontScale;
  const family = block.fontFamily ?? doc.fontCss;
  const s = block.size ?? 1;

  let inner: React.ReactNode;
  if (block.type === "divider") {
    inner = <div style={{ height: 2, background: doc.accent, margin: `${base * 0.5}px 0` }} />;
  } else if (block.type === "spacer") {
    inner = <div style={{ height: base * 1.4 }} />;
  } else {
    const style: CSSProperties = {
      fontFamily: family,
      textAlign: block.align,
      lineHeight: 1.65,
      color: block.type === "subheading" ? doc.accent : "#1f2430",
      fontWeight: block.type === "heading" ? 800 : block.type === "subheading" ? 700 : 400,
      fontSize:
        block.type === "heading" ? base * 1.9 * s : block.type === "subheading" ? base * 1.25 * s : base * s,
    };
    inner = (
      <RichText
        html={block.html}
        onChange={onChange}
        onFocus={onFocus}
        placeholder={block.type === "heading" ? "Heading" : block.type === "subheading" ? "Subheading" : "Write here…"}
        style={style}
      />
    );
  }

  return (
    <div ref={setNodeRef} style={wrap} className="group/blk relative" onMouseDown={onSelect}>
      {editing && (
        <button
          type="button"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
          className={cn(
            "absolute -left-8 top-1 grid h-7 w-7 cursor-grab place-items-center rounded-[7px] text-text-3 opacity-0 transition-opacity hover:bg-surface-2 hover:text-text group-hover/blk:opacity-100 active:cursor-grabbing",
            active && "opacity-100",
          )}
        >
          <GripVertical size={15} />
        </button>
      )}
      <div className={cn("rounded-[6px] transition-shadow", active && editing && "ring-2 ring-accent/40")}>
        {inner}
      </div>
    </div>
  );
}
