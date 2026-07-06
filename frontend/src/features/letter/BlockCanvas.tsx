import { useLayoutEffect, useRef, useState } from "react";
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableBlock } from "./SortableBlock";
import { EditorToolbar } from "./EditorToolbar";
import type { Block, BlockType, LetterDoc } from "./blockTypes";

const PAGE_W = 794;
const PAGE_H = 1123;
const PAD = 64;

export interface BlockOps {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  update: (id: string, patch: Partial<Block>) => void;
  reorder: (ids: string[]) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  add: (type: BlockType) => void;
  setHtml: (id: string, html: string) => void;
}

export function BlockCanvas({ doc, ops }: { doc: LetterDoc; ops: BlockOps }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setPages(Math.max(1, Math.ceil(el.scrollHeight / PAGE_H)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const active = doc.blocks.find((b) => b.id === ops.activeId) ?? null;

  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const ids = doc.blocks.map((b) => b.id);
    const from = ids.indexOf(String(a.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    ops.reorder(ids);
  }

  return (
    <div className="mx-auto flex max-w-full flex-col items-center gap-4">
      <div className="sticky top-2 z-20 w-full max-w-[794px]">
        <EditorToolbar
          active={active}
          onBlock={(patch) => ops.activeId && ops.update(ops.activeId, patch)}
          onDelete={() => ops.activeId && ops.remove(ops.activeId)}
          onDuplicate={() => ops.activeId && ops.duplicate(ops.activeId)}
          onAdd={ops.add}
        />
      </div>

      <div style={{ width: PAGE_W, maxWidth: "100%" }}>
        <div
          id="letter-print"
          className="relative overflow-hidden rounded-[4px] bg-white shadow-elevated ring-1 ring-black/5"
          style={{ width: PAGE_W, minHeight: pages * PAGE_H }}
        >
          <div ref={contentRef} style={{ padding: PAD }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={doc.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                {doc.blocks.map((b) => (
                  <SortableBlock
                    key={b.id}
                    block={b}
                    doc={doc}
                    editing
                    active={ops.activeId === b.id}
                    onSelect={() => ops.setActiveId(b.id)}
                    onFocus={() => ops.setActiveId(b.id)}
                    onChange={(html) => ops.setHtml(b.id, html)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          {Array.from({ length: pages - 1 }, (_, i) => (
            <div key={i} className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top: (i + 1) * PAGE_H }}>
              <div className="absolute inset-x-0 top-0 border-t border-dashed border-black/12" />
              <span className="-translate-y-1/2 rounded-full border border-border bg-surface px-2.5 py-0.5 font-mono text-[10px] font-semibold text-text-3 shadow-soft">
                Page {i + 2}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-center font-mono text-[11px] uppercase tracking-wide text-text-3">
          {pages} page{pages > 1 ? "s" : ""} · A4 · drag the ⣿ handle to reorder
        </p>
      </div>
    </div>
  );
}
