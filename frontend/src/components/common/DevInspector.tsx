import { useMemo, useState } from "react";
import { Braces, Check, ChevronDown, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Developer panel: reveals the raw AI/backend output for a page — the parsed
 * JSON and, when available, the model's raw text. Collapsed by default.
 */
export function DevInspector({
  json,
  raw,
  title = "Developer · view AI output",
}: {
  json: unknown;
  raw?: string | null;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"json" | "raw">("json");
  const [copied, setCopied] = useState(false);

  const pretty = useMemo(() => {
    try {
      return JSON.stringify(json, null, 2);
    } catch {
      return String(json);
    }
  }, [json]);

  const shown = tab === "raw" ? (raw ?? "") : pretty;

  function copy() {
    navigator.clipboard?.writeText(shown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-6 overflow-hidden rounded-[14px] border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-[13px] font-semibold text-text-2 transition-colors hover:text-text"
      >
        <Braces size={15} className="text-accent-ink" />
        {title}
        <ChevronDown size={16} className={cn("ml-auto transition-transform text-text-3", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-line p-3">
          <div className="mb-2 flex items-center gap-2">
            {raw != null && (
              <div className="inline-flex rounded-[9px] border border-border bg-surface-2 p-0.5">
                {(["json", "raw"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      "rounded-[7px] px-3 py-1 text-[12px] font-semibold transition-colors",
                      tab === t ? "bg-surface text-text shadow-soft" : "text-text-3 hover:text-text",
                    )}
                  >
                    {t === "json" ? "Structured JSON" : "Raw model text"}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={copy}
              className="ml-auto inline-flex items-center gap-1.5 rounded-[8px] border border-border px-2.5 py-1 text-[12px] font-semibold text-text-2 transition-colors hover:text-text"
            >
              {copied ? <Check size={13} className="text-good" /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="max-h-[440px] overflow-auto rounded-[10px] bg-navy p-4 font-mono text-[12px] leading-relaxed text-white/90">
            <code>{shown || "— empty —"}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
