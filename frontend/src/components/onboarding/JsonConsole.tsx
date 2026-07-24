import { useEffect, useMemo, useRef } from "react";

/* ── Tiny streaming JSON tokenizer (no external lib) ─────────────────
   Best-effort over partial/invalid text. Emits {t, cls} tokens; whitespace
   carries the newlines so the renderer can lay out line numbers. */
type Cls = "key" | "str" | "num" | "kw" | "punct" | "ws" | "plain";
type Token = { t: string; cls: Cls };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") {
      let j = i + 1;
      while (j < n && (src[j] === " " || src[j] === "\n" || src[j] === "\t" || src[j] === "\r")) j++;
      out.push({ t: src.slice(i, j), cls: "ws" });
      i = j;
    } else if (ch === '"') {
      let j = i + 1;
      let esc = false;
      while (j < n) {
        const c = src[j];
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') {
          j++;
          break;
        }
        j++;
      }
      // key vs string: peek past whitespace for a ':'
      let k = j;
      while (k < n && (src[k] === " " || src[k] === "\n" || src[k] === "\t" || src[k] === "\r")) k++;
      out.push({ t: src.slice(i, j), cls: src[k] === ":" ? "key" : "str" });
      i = j;
    } else if (ch === "{" || ch === "}" || ch === "[" || ch === "]" || ch === ":" || ch === ",") {
      out.push({ t: ch, cls: "punct" });
      i++;
    } else if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1;
      while (j < n && /[0-9.eE+-]/.test(src[j])) j++;
      out.push({ t: src.slice(i, j), cls: "num" });
      i = j;
    } else if (/[a-z]/i.test(ch)) {
      let j = i + 1;
      while (j < n && /[a-z]/i.test(src[j])) j++;
      const word = src.slice(i, j);
      out.push({ t: word, cls: word === "true" || word === "false" || word === "null" ? "kw" : "plain" });
      i = j;
    } else {
      out.push({ t: ch, cls: "plain" });
      i++;
    }
  }
  return out;
}

const CLS: Record<Cls, string> = {
  key: "text-accent-text",
  str: "text-success",
  num: "text-warning",
  kw: "text-warning",
  punct: "text-fg-low",
  ws: "",
  plain: "text-reading-ink",
};

export function JsonConsole({ text, parsing, statusTime }: { text: string; parsing: boolean; statusTime: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Group tokens into lines of colored segments.
  const lines = useMemo(() => {
    const rows: Token[][] = [[]];
    for (const tk of tokenize(text)) {
      const parts = tk.t.split("\n");
      parts.forEach((seg, idx) => {
        if (idx > 0) rows.push([]);
        if (seg) rows[rows.length - 1].push({ t: seg, cls: tk.cls });
      });
    }
    return rows;
  }, [text]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && parsing) el.scrollTop = el.scrollHeight;
  }, [text, parsing]);

  return (
    <div className="flex w-full h-full min-h-0 flex-col overflow-hidden rounded-[12px] border border-border bg-reading">
      {/* mac-style header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3.5 py-2.5">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--danger)" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--warning)" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--success)" }} />
        </span>
        <span className="ml-1 font-mono text-[11px] font-semibold text-reading-ink">response.json</span>
        <span
          className={`ml-auto flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] ${parsing ? "text-accent-text" : "text-success"}`}
          style={parsing ? { background: "var(--accent-weak)", backgroundSize: "500px 100%", animation: "cll-shimmer 1.6s ease-in-out infinite" } : undefined}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: parsing ? "var(--accent)" : "var(--success)", animation: parsing ? "cll-pulse 1.3s ease-in-out infinite" : undefined }}
          />
          {parsing ? "streaming" : "done"} · {statusTime}s
        </span>
      </div>

      {/* code body with a line-number gutter */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto font-mono text-[11.5px] leading-[1.7]">
        {text ? (
          <div className="flex min-w-full">
            <div className="sticky left-0 shrink-0 select-none border-r border-border/50 bg-reading px-2 py-3 text-right text-reading-ink/35">
              {lines.map((_, i) => (
                <div key={i} className="tabular-nums">
                  {i + 1}
                </div>
              ))}
            </div>
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words px-3 py-3 text-reading-ink">
              {lines.map((segs, li) => (
                <div key={li}>
                  {segs.length === 0 ? "​" : segs.map((s, si) => <span key={si} className={CLS[s.cls]}>{s.t}</span>)}
                  {parsing && li === lines.length - 1 ? <span className="cll-caret" /> : null}
                </div>
              ))}
            </pre>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 py-10 text-center text-[11.5px] text-reading-ink/50">
            {parsing ? (
              <span>
                Waiting for the model to respond…
                <span className="cll-caret" />
              </span>
            ) : (
              "No output yet."
            )}
          </div>
        )}
      </div>
    </div>
  );
}
