import type { ReactNode } from "react";

export type TemplateId =
  | "sidebar"
  | "classic"
  | "modern"
  | "minimal"
  | "executive"
  | "monogram"
  | "split"
  | "block"
  | "elegant"
  | "compact";

/** All text is inline-editable on the document, so content is a flat string map. */
export interface LetterContent {
  name: string;
  contact: string; // "phone · email · linkedin"
  place: string; // "Istanbul · 4 July 2026"
  greeting: string; // "Dear Hiring Team,"
  subject: string;
  body: string;
}

export interface LetterDesign {
  templateId: TemplateId;
  accent: string; // hex
  fontCss: string;
  fontScale: number; // multiplier applied to the base font size
}

/** Pre-built (already editable) pieces the template arranges. */
export interface LetterSlots {
  name: ReactNode;
  contact: ReactNode;
  place: ReactNode;
  greeting: ReactNode;
  subject: ReactNode;
  body: ReactNode;
  initials: string;
}

export interface TemplateProps {
  slots: LetterSlots;
  accent: string;
}
