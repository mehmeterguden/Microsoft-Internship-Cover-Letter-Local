import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Editable } from "./Editable";
import { renderTemplate } from "./templates";
import type { LetterContent, LetterDesign, LetterSlots } from "./types";

// A4 at 96dpi (210 × 297 mm) — matches the multi-page PDF export.
const PAGE_W = 794;
const PAGE_H = 1123;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * The editable cover letter, rendered on real A4 page(s). Content flows in one
 * column; when it exceeds a page, the sheet grows by whole A4 pages and each new
 * page boundary is marked ("Page 2", "Page 3", …) — like a paginated PDF.
 */
export function LetterDocument({
  content,
  design,
  onChange,
}: {
  content: LetterContent;
  design: LetterDesign;
  onChange: (patch: Partial<LetterContent>) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setPages(Math.max(1, Math.ceil(el.scrollHeight / PAGE_H)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const root: CSSProperties = {
    fontFamily: design.fontCss,
    fontSize: 15 * design.fontScale,
    color: "#1f2430",
  };

  const slots: LetterSlots = {
    initials: initialsOf(content.name),
    name: <Editable value={content.name} onChange={(v) => onChange({ name: v })} placeholder="Your name" />,
    contact: <Editable value={content.contact} onChange={(v) => onChange({ contact: v })} placeholder="phone · email · links" />,
    place: <Editable value={content.place} onChange={(v) => onChange({ place: v })} placeholder="City · Date" />,
    greeting: <Editable value={content.greeting} onChange={(v) => onChange({ greeting: v })} placeholder="Dear Hiring Team," />,
    subject: <Editable value={content.subject} onChange={(v) => onChange({ subject: v })} placeholder="Subject" />,
    body: <Editable multiline value={content.body} onChange={(v) => onChange({ body: v })} placeholder="Write or generate your letter…" />,
  };

  return (
    <div className="mx-auto" style={{ width: PAGE_W, maxWidth: "100%" }}>
      <div
        id="letter-print"
        className="relative overflow-hidden rounded-[4px] bg-white shadow-elevated ring-1 ring-black/5"
        style={{ width: PAGE_W, minHeight: pages * PAGE_H }}
      >
        <div ref={contentRef} style={root}>
          {renderTemplate(design.templateId, { slots, accent: design.accent })}
        </div>

        {/* Page-break markers between A4 pages. */}
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
        {pages} page{pages > 1 ? "s" : ""} · A4
      </p>
    </div>
  );
}
