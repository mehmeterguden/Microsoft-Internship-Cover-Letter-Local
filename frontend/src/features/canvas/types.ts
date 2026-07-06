/** Free-canvas element model (Canva-style). */

export type ElType = "text" | "heading" | "line" | "rect";
export type Align = "left" | "center" | "right";

export interface El {
  id: string;
  type: ElType;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  html?: string; // text / heading content (rich HTML)
  color?: string; // text color, line color, or rect fill
  align?: Align;
  fontFamily?: string;
  fontSize?: number; // px
  weight?: number;
  radius?: number; // rect corner radius
}

export interface CanvasDoc {
  elements: El[];
  accent: string;
}

export const PAGE_W = 794;
export const PAGE_H = 1123;

let n = 0;
export function uid(): string {
  n += 1;
  return `e${Date.now().toString(36)}${n}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function makeEl(type: ElType, x: number, y: number): El {
  const base = { id: uid(), x, y, rot: 0, align: "left" as Align };
  if (type === "heading") return { ...base, type, w: 520, h: 60, html: "Heading", fontSize: 34, weight: 800, color: "#131a2e" };
  if (type === "text") return { ...base, type, w: 520, h: 90, html: "New text — double-click to edit.", fontSize: 16, weight: 400, color: "#1f2430" };
  if (type === "line") return { ...base, type, w: 520, h: 3, color: "#0ea373" };
  return { ...base, type: "rect", w: 220, h: 140, color: "#e6f5ef", radius: 12 };
}

/** A starting cover letter laid out on the page. */
export function defaultElements(accent: string): El[] {
  return [
    { id: uid(), type: "heading", x: 64, y: 64, w: 620, h: 52, rot: 0, align: "left", html: "Your Name", fontSize: 34, weight: 800, color: "#131a2e" },
    { id: uid(), type: "text", x: 64, y: 120, w: 620, h: 28, rot: 0, align: "left", html: "phone · email · linkedin", fontSize: 13, weight: 400, color: "#55617a" },
    { id: uid(), type: "line", x: 64, y: 162, w: 666, h: 3, rot: 0, color: accent },
    { id: uid(), type: "text", x: 64, y: 182, w: 300, h: 24, rot: 0, align: "left", html: "City · Date", fontSize: 13, weight: 400, color: "#55617a" },
    { id: uid(), type: "heading", x: 64, y: 220, w: 666, h: 34, rot: 0, align: "left", html: "Application for the Software Engineer position", fontSize: 20, weight: 700, color: accent },
    {
      id: uid(), type: "text", x: 64, y: 272, w: 666, h: 340, rot: 0, align: "left", fontSize: 16, weight: 400, color: "#1f2430",
      html:
        esc("Dear Hiring Team,") +
        "<br><br>" +
        esc("I've always been obsessed with making software feel effortless — the kind of tool that disappears into the work. That's exactly why this role caught my attention.") +
        "<br><br>" +
        esc("Across my projects I've shipped end to end and watched real people rely on what I built. I care about craft: polish, ownership, and tools people actually use.") +
        "<br><br>" +
        esc("I'd love to bring that energy to your team."),
    },
  ];
}

export { esc };
