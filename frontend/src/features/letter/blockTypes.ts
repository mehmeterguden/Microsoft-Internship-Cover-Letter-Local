/** Block model for the Canva-style letter editor. */

export type BlockType = "heading" | "subheading" | "text" | "divider" | "spacer";
export type Align = "left" | "center" | "right";

export interface Block {
  id: string;
  type: BlockType;
  html: string; // rich HTML for text blocks
  align: Align;
  fontFamily?: string; // per-block override; falls back to the document font
  size?: number; // font-size multiplier for text/heading blocks
}

export interface LetterDoc {
  blocks: Block[];
  accent: string;
  fontCss: string; // document base font
  fontScale: number; // document base text-size multiplier
}

let counter = 0;
export function uid(): string {
  counter += 1;
  return `b${Date.now().toString(36)}${counter}`;
}

export function makeBlock(type: BlockType, html = "", align: Align = "left"): Block {
  return { id: uid(), type, html, align };
}

/** A sensible starting letter. */
export function defaultBlocks(): Block[] {
  return [
    { id: uid(), type: "heading", html: "Your Name", align: "left" },
    { id: uid(), type: "text", html: "phone · email · linkedin", align: "left", size: 0.85 },
    { id: uid(), type: "divider", html: "", align: "left" },
    { id: uid(), type: "text", html: "City · Date", align: "left", size: 0.85 },
    { id: uid(), type: "subheading", html: "Application for the Software Engineer position", align: "left" },
    { id: uid(), type: "text", html: "Dear Hiring Team,", align: "left" },
    {
      id: uid(),
      type: "text",
      html:
        "I've always been obsessed with making software feel effortless — the kind of tool that disappears into the work. That's exactly why this role caught my attention.",
      align: "left",
    },
    {
      id: uid(),
      type: "text",
      html:
        "Across my projects I've shipped end to end and watched real people rely on what I built. I care about craft: polish, ownership, and tools people actually use.",
      align: "left",
    },
    { id: uid(), type: "text", html: "I'd love to bring that energy to your team.", align: "left" },
  ];
}

/** Escape plain text and split on blank lines into paragraph blocks (for AI output). */
export function paragraphsToBlocks(text: string): Block[] {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => makeBlock("text", esc(p).replace(/\n/g, "<br>")));
}
