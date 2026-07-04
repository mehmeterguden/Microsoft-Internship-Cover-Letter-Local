import type { CSSProperties } from "react";
import { Editable } from "./Editable";
import { renderTemplate } from "./templates";
import type { LetterContent, LetterDesign, LetterSlots } from "./types";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** The editable cover-letter document: an A4-ratio sheet rendering the chosen template. */
export function LetterDocument({
  content,
  design,
  onChange,
}: {
  content: LetterContent;
  design: LetterDesign;
  onChange: (patch: Partial<LetterContent>) => void;
}) {
  const root: CSSProperties = {
    fontFamily: design.fontCss,
    fontSize: 15 * design.fontScale,
    color: "#1f2430",
    width: "100%",
    minHeight: "100%",
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
    <div
      id="letter-print"
      className="mx-auto w-full max-w-[820px] overflow-hidden rounded-[6px] bg-white shadow-elevated ring-1 ring-black/5"
      style={{ aspectRatio: "1 / 1.294", minHeight: 900 }}
    >
      <div style={root}>{renderTemplate(design.templateId, { slots, accent: design.accent })}</div>
    </div>
  );
}
