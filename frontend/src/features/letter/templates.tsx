import type { CSSProperties } from "react";
import type { TemplateId, TemplateProps } from "./types";

/*
 * Ten cover-letter layouts modeled on common professional styles. Each arranges
 * the same editable slots differently; sizes use `em` so the text-size control
 * (root font-size) scales everything proportionally. `accent` colors the
 * template's signature elements.
 */

const ink = "#1f2430";
const muted = "#6a7284";

function Sidebar({ slots, accent }: TemplateProps) {
  return (
    <div style={{ display: "flex", minHeight: "100%", background: "#fff", color: ink }}>
      <aside style={{ width: "34%", padding: "2.4em 1.8em", background: `${accent}12`, borderRight: `3px solid ${accent}` }}>
        <div style={{ fontSize: "1.9em", fontWeight: 800, lineHeight: 1.1, color: accent }}>{slots.name}</div>
        <div style={{ marginTop: "1.4em", fontSize: "0.82em", lineHeight: 1.9, color: muted }}>{slots.contact}</div>
      </aside>
      <div style={{ flex: 1, padding: "2.6em" }}>
        <div style={{ fontSize: "0.82em", color: muted }}>{slots.place}</div>
        <div style={{ margin: "1.1em 0 1em", fontSize: "1.25em", fontWeight: 700, color: accent }}>{slots.subject}</div>
        <div style={{ marginBottom: "1em" }}>{slots.greeting}</div>
        <div style={{ lineHeight: 1.75 }}>{slots.body}</div>
      </div>
    </div>
  );
}

function Classic({ slots, accent }: TemplateProps) {
  return (
    <div style={{ minHeight: "100%", background: "#fff", color: ink, padding: "3em" }}>
      <div style={{ textAlign: "center", borderBottom: `2px solid ${accent}`, paddingBottom: "1.1em" }}>
        <div style={{ fontSize: "2em", fontWeight: 800, letterSpacing: "0.02em" }}>{slots.name}</div>
        <div style={{ marginTop: "0.5em", fontSize: "0.82em", color: muted }}>{slots.contact}</div>
      </div>
      <div style={{ margin: "1.4em 0 1em", textAlign: "right", fontSize: "0.85em", color: muted }}>{slots.place}</div>
      <div style={{ marginBottom: "1em", fontSize: "1.2em", fontWeight: 700, color: accent }}>{slots.subject}</div>
      <div style={{ marginBottom: "1em" }}>{slots.greeting}</div>
      <div style={{ lineHeight: 1.75 }}>{slots.body}</div>
    </div>
  );
}

function Modern({ slots, accent }: TemplateProps) {
  return (
    <div style={{ minHeight: "100%", background: "#fff", color: ink }}>
      <header style={{ background: accent, color: "#fff", padding: "1.8em 2.4em" }}>
        <div style={{ fontSize: "2em", fontWeight: 800, lineHeight: 1.1 }}>{slots.name}</div>
        <div style={{ marginTop: "0.5em", fontSize: "0.82em", opacity: 0.92 }}>{slots.contact}</div>
      </header>
      <div style={{ padding: "2.4em" }}>
        <div style={{ marginBottom: "1em", fontSize: "0.85em", color: muted }}>{slots.place}</div>
        <div style={{ marginBottom: "1em", fontSize: "1.25em", fontWeight: 700, color: accent }}>{slots.subject}</div>
        <div style={{ marginBottom: "1em" }}>{slots.greeting}</div>
        <div style={{ lineHeight: 1.75 }}>{slots.body}</div>
      </div>
    </div>
  );
}

function Minimal({ slots, accent }: TemplateProps) {
  return (
    <div style={{ minHeight: "100%", background: "#fff", color: ink, padding: "3.2em" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: "1.7em", fontWeight: 700 }}>{slots.name}</div>
        <div style={{ fontSize: "0.82em", color: muted }}>{slots.place}</div>
      </div>
      <div style={{ marginTop: "0.4em", fontSize: "0.82em", color: muted }}>{slots.contact}</div>
      <div style={{ height: 2, width: 56, background: accent, margin: "1.5em 0" }} />
      <div style={{ marginBottom: "1em", fontSize: "1.15em", fontWeight: 700, color: accent }}>{slots.subject}</div>
      <div style={{ marginBottom: "1em" }}>{slots.greeting}</div>
      <div style={{ lineHeight: 1.75 }}>{slots.body}</div>
    </div>
  );
}

function Executive({ slots, accent }: TemplateProps) {
  return (
    <div style={{ minHeight: "100%", background: "#fff", color: ink, padding: "3em" }}>
      <div style={{ borderTop: `1px solid ${accent}`, borderBottom: `1px solid ${accent}`, padding: "1.2em 0", textAlign: "center" }}>
        <div style={{ fontSize: "1.9em", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.16em" }}>{slots.name}</div>
        <div style={{ marginTop: "0.7em", fontSize: "0.8em", color: muted, letterSpacing: "0.04em" }}>{slots.contact}</div>
      </div>
      <div style={{ margin: "1.6em 0 1em", fontSize: "0.85em", color: muted }}>{slots.place}</div>
      <div style={{ marginBottom: "1em", fontSize: "1.15em", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: accent }}>{slots.subject}</div>
      <div style={{ marginBottom: "1em" }}>{slots.greeting}</div>
      <div style={{ lineHeight: 1.8 }}>{slots.body}</div>
    </div>
  );
}

function Monogram({ slots, accent }: TemplateProps) {
  return (
    <div style={{ minHeight: "100%", background: "#fff", color: ink, padding: "3em" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1.1em" }}>
        <div style={{ width: "3em", height: "3em", flexShrink: 0, borderRadius: "50%", background: accent, color: "#fff", display: "grid", placeItems: "center", fontSize: "1.2em", fontWeight: 800 }}>
          {slots.initials}
        </div>
        <div>
          <div style={{ fontSize: "1.7em", fontWeight: 800, lineHeight: 1.1 }}>{slots.name}</div>
          <div style={{ marginTop: "0.3em", fontSize: "0.82em", color: muted }}>{slots.contact}</div>
        </div>
      </div>
      <div style={{ height: 1, background: "#e6e9ef", margin: "1.6em 0" }} />
      <div style={{ marginBottom: "1em", fontSize: "0.85em", color: muted }}>{slots.place}</div>
      <div style={{ marginBottom: "1em", fontSize: "1.2em", fontWeight: 700, color: accent }}>{slots.subject}</div>
      <div style={{ marginBottom: "1em" }}>{slots.greeting}</div>
      <div style={{ lineHeight: 1.75 }}>{slots.body}</div>
    </div>
  );
}

function Split({ slots, accent }: TemplateProps) {
  return (
    <div style={{ minHeight: "100%", background: "#fff", color: ink }}>
      <div style={{ height: 6, background: accent }} />
      <div style={{ padding: "2.6em 3em" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1em", flexWrap: "wrap" }}>
          <div style={{ fontSize: "2em", fontWeight: 800, lineHeight: 1 }}>{slots.name}</div>
          <div style={{ textAlign: "right", fontSize: "0.8em", color: muted, lineHeight: 1.7 }}>{slots.contact}</div>
        </div>
        <div style={{ margin: "1.6em 0 1em", fontSize: "0.85em", color: muted }}>{slots.place}</div>
        <div style={{ marginBottom: "1em", fontSize: "1.2em", fontWeight: 700, color: accent }}>{slots.subject}</div>
        <div style={{ marginBottom: "1em" }}>{slots.greeting}</div>
        <div style={{ lineHeight: 1.75 }}>{slots.body}</div>
      </div>
    </div>
  );
}

function Block({ slots, accent }: TemplateProps) {
  return (
    <div style={{ minHeight: "100%", background: "#fff", color: ink, padding: "2.6em 3em" }}>
      <div style={{ display: "inline-block", background: accent, color: "#fff", padding: "0.5em 0.9em", borderRadius: "0.4em", fontSize: "1.9em", fontWeight: 800, lineHeight: 1 }}>
        {slots.name}
      </div>
      <div style={{ marginTop: "0.9em", fontSize: "0.82em", color: muted }}>{slots.contact}</div>
      <div style={{ margin: "1.6em 0 1em", fontSize: "0.85em", color: muted }}>{slots.place}</div>
      <div style={{ marginBottom: "1em", fontSize: "1.2em", fontWeight: 700, color: accent }}>{slots.subject}</div>
      <div style={{ marginBottom: "1em" }}>{slots.greeting}</div>
      <div style={{ lineHeight: 1.75 }}>{slots.body}</div>
    </div>
  );
}

function Elegant({ slots, accent }: TemplateProps) {
  return (
    <div style={{ minHeight: "100%", background: "#fff", color: ink, padding: "3.4em" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2.1em", fontWeight: 700, letterSpacing: "0.01em" }}>{slots.name}</div>
        <div style={{ marginTop: "0.6em", fontSize: "0.8em", color: muted }}>{slots.contact}</div>
        <div style={{ width: 40, height: 1, background: accent, margin: "1.2em auto" }} />
      </div>
      <div style={{ marginBottom: "0.8em", fontSize: "0.85em", color: muted }}>{slots.place}</div>
      <div style={{ marginBottom: "1em", fontSize: "0.95em", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.18em", color: accent }}>{slots.subject}</div>
      <div style={{ marginBottom: "1em" }}>{slots.greeting}</div>
      <div style={{ lineHeight: 1.85, textAlign: "justify" }}>{slots.body}</div>
    </div>
  );
}

function Compact({ slots, accent }: TemplateProps) {
  return (
    <div style={{ minHeight: "100%", background: "#fff", color: ink, padding: "2.6em 3em" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.7em", flexWrap: "wrap" }}>
        <div style={{ fontSize: "1.5em", fontWeight: 800 }}>{slots.name}</div>
        <div style={{ fontSize: "0.8em", color: muted }}>{slots.contact}</div>
      </div>
      <div style={{ height: 2, background: accent, margin: "1em 0 1.2em" }} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1em", flexWrap: "wrap" }}>
        <div style={{ fontSize: "1.1em", fontWeight: 700, color: accent }}>{slots.subject}</div>
        <div style={{ fontSize: "0.82em", color: muted }}>{slots.place}</div>
      </div>
      <div style={{ margin: "1em 0" }}>{slots.greeting}</div>
      <div style={{ lineHeight: 1.7 }}>{slots.body}</div>
    </div>
  );
}

const COMPONENTS: Record<TemplateId, (p: TemplateProps) => React.ReactElement> = {
  sidebar: Sidebar,
  classic: Classic,
  modern: Modern,
  minimal: Minimal,
  executive: Executive,
  monogram: Monogram,
  split: Split,
  block: Block,
  elegant: Elegant,
  compact: Compact,
};

export const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: "sidebar", label: "Sidebar" },
  { id: "classic", label: "Classic" },
  { id: "modern", label: "Modern" },
  { id: "minimal", label: "Minimal" },
  { id: "executive", label: "Executive" },
  { id: "monogram", label: "Monogram" },
  { id: "split", label: "Split" },
  { id: "block", label: "Block" },
  { id: "elegant", label: "Elegant" },
  { id: "compact", label: "Compact" },
];

export function renderTemplate(id: TemplateId, props: TemplateProps) {
  return COMPONENTS[id](props);
}

/** A tiny abstract preview of each layout for the picker. */
export function TemplateThumb({ id, accent }: { id: TemplateId; accent: string }) {
  const bar = (w: string, o = 0.28): CSSProperties => ({ height: 3, width: w, borderRadius: 2, background: "#9aa2b1", opacity: o });
  const acc = (s: CSSProperties): CSSProperties => ({ ...s, background: accent, opacity: 1 });
  const lines = (
    <>
      <div style={bar("80%")} />
      <div style={bar("90%")} />
      <div style={bar("70%")} />
    </>
  );
  const wrap: CSSProperties = { width: "100%", height: "100%", background: "#fff", overflow: "hidden" };

  switch (id) {
    case "sidebar":
      return (
        <div style={{ ...wrap, display: "flex" }}>
          <div style={{ width: "34%", background: `${accent}22`, borderRight: `2px solid ${accent}` }} />
          <div style={{ flex: 1, padding: 6, display: "grid", gap: 4 }}>
            <div style={acc(bar("50%", 1))} />
            {lines}
          </div>
        </div>
      );
    case "modern":
      return (
        <div style={{ ...wrap, display: "grid", gridTemplateRows: "30% 1fr" }}>
          <div style={{ background: accent }} />
          <div style={{ padding: 6, display: "grid", gap: 4 }}>{lines}</div>
        </div>
      );
    case "classic":
      return (
        <div style={{ ...wrap, padding: 6, display: "grid", gap: 4, justifyItems: "center" }}>
          <div style={bar("60%", 0.7)} />
          <div style={{ height: 2, width: "100%", background: accent }} />
          <div style={{ display: "grid", gap: 4, width: "100%", marginTop: 2 }}>{lines}</div>
        </div>
      );
    case "minimal":
      return (
        <div style={{ ...wrap, padding: 6, display: "grid", gap: 4 }}>
          <div style={bar("45%", 0.7)} />
          <div style={{ height: 2, width: 16, background: accent }} />
          {lines}
        </div>
      );
    case "executive":
      return (
        <div style={{ ...wrap, padding: 6, display: "grid", gap: 4 }}>
          <div style={{ borderTop: `1px solid ${accent}`, borderBottom: `1px solid ${accent}`, padding: "5px 0", display: "grid", justifyItems: "center" }}>
            <div style={bar("55%", 0.7)} />
          </div>
          {lines}
        </div>
      );
    case "monogram":
      return (
        <div style={{ ...wrap, padding: 6, display: "grid", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: accent }} />
            <div style={bar("45%", 0.7)} />
          </div>
          {lines}
        </div>
      );
    case "split":
      return (
        <div style={{ ...wrap, display: "grid", gridTemplateRows: "6px 1fr" }}>
          <div style={{ background: accent }} />
          <div style={{ padding: 6, display: "grid", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={bar("30%", 0.7)} />
              <div style={bar("25%")} />
            </div>
            {lines}
          </div>
        </div>
      );
    case "block":
      return (
        <div style={{ ...wrap, padding: 6, display: "grid", gap: 4 }}>
          <div style={{ width: "50%", height: 12, borderRadius: 3, background: accent }} />
          {lines}
        </div>
      );
    case "elegant":
      return (
        <div style={{ ...wrap, padding: 6, display: "grid", gap: 4, justifyItems: "center" }}>
          <div style={bar("50%", 0.7)} />
          <div style={{ width: 14, height: 1, background: accent }} />
          <div style={{ display: "grid", gap: 4, width: "100%" }}>{lines}</div>
        </div>
      );
    case "compact":
      return (
        <div style={{ ...wrap, padding: 6, display: "grid", gap: 4 }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <div style={bar("30%", 0.8)} />
            <div style={bar("35%")} />
          </div>
          <div style={{ height: 2, background: accent }} />
          {lines}
        </div>
      );
  }
}
