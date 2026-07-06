import type { CSSProperties } from "react";
import { Rnd } from "react-rnd";
import { RichText } from "../letter/RichText";
import { PAGE_W, PAGE_H, type El } from "./types";
import { cn } from "@/lib/utils";

export interface CanvasOps {
  selectedId: string | null;
  editingId: string | null;
  setSelectedId: (id: string | null) => void;
  setEditingId: (id: string | null) => void;
  update: (id: string, patch: Partial<El>) => void;
  setHtml: (id: string, html: string) => void;
}

const HANDLE: CSSProperties = {
  width: 10,
  height: 10,
  background: "#fff",
  border: "1.5px solid var(--accent)",
  borderRadius: 3,
};

function ElementView({ el, editing, onEditStart, onHtml }: { el: El; editing: boolean; onEditStart: () => void; onHtml: (h: string) => void }) {
  if (el.type === "line") {
    return <div style={{ width: "100%", height: "100%", background: el.color, borderRadius: 999 }} />;
  }
  if (el.type === "rect") {
    return <div style={{ width: "100%", height: "100%", background: el.color, borderRadius: el.radius ?? 0 }} />;
  }
  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    fontFamily: el.fontFamily ?? "var(--font-sans)",
    fontSize: el.fontSize ?? 16,
    fontWeight: el.weight ?? 400,
    color: el.color ?? "#1f2430",
    textAlign: el.align ?? "left",
    lineHeight: 1.5,
    overflow: "hidden",
    cursor: editing ? "text" : "move",
  };
  if (editing) {
    return <RichText autoFocus html={el.html ?? ""} onChange={onHtml} style={style} />;
  }
  return (
    <div
      style={style}
      onDoubleClick={onEditStart}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: el.html ?? "" }}
    />
  );
}

/** The A4 artboard: free-positioned, draggable & resizable elements (Canva-style). */
export function Canvas({ elements, ops }: { elements: El[]; ops: CanvasOps }) {
  return (
    <div
      id="letter-print"
      className="relative mx-auto overflow-hidden bg-white shadow-elevated ring-1 ring-black/5"
      style={{ width: PAGE_W, height: PAGE_H }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          ops.setSelectedId(null);
          ops.setEditingId(null);
        }
      }}
    >
      {elements.map((el, i) => {
        const selected = ops.selectedId === el.id;
        const editing = ops.editingId === el.id;
        return (
          <Rnd
            key={el.id}
            size={{ width: el.w, height: el.h }}
            position={{ x: el.x, y: el.y }}
            bounds="parent"
            enableResizing={selected && !editing}
            disableDragging={editing}
            resizeHandleStyles={selected ? { topLeft: HANDLE, topRight: HANDLE, bottomLeft: HANDLE, bottomRight: HANDLE } : undefined}
            onDragStart={() => ops.setSelectedId(el.id)}
            onDragStop={(_e, d) => ops.update(el.id, { x: d.x, y: d.y })}
            onResizeStop={(_e, _dir, ref, _delta, pos) => ops.update(el.id, { w: ref.offsetWidth, h: ref.offsetHeight, x: pos.x, y: pos.y })}
            style={{ zIndex: i }}
            className={cn("rounded-[3px]", selected && "outline outline-2 outline-accent", !editing && "cursor-move")}
            onMouseDown={() => ops.setSelectedId(el.id)}
          >
            <ElementView el={el} editing={editing} onEditStart={() => ops.setEditingId(el.id)} onHtml={(h) => ops.setHtml(el.id, h)} />
          </Rnd>
        );
      })}
    </div>
  );
}
