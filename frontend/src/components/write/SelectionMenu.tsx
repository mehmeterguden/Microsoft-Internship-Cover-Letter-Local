import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Scissors, SlidersHorizontal, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditAction } from "./letterTools";
import type { Tone } from "@/api/types";

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "warm", label: "Warm" },
  { value: "confident", label: "Confident" },
  { value: "concise", label: "Concise" },
];

const ACTIONS: { action: EditAction; label: string; icon: typeof Wand2 }[] = [
  { action: "improve", label: "Improve", icon: Wand2 },
  { action: "shorten", label: "Shorten", icon: Scissors },
  { action: "extend", label: "Extend", icon: Maximize2 },
];

export interface SelectionAnchor {
  x: number;
  y: number;
}

/**
 * [8] Floating AI action menu shown when the user selects text in the letter.
 * Positioned at the pointer, clamped to the viewport. Emits an edit action
 * (optionally with a tone for "Change tone") back to the Write page.
 */
export function SelectionMenu({
  anchor,
  busy,
  onAction,
  onClose,
}: {
  anchor: SelectionAnchor | null;
  busy: boolean;
  onAction: (action: EditAction, tone?: Tone) => void;
  onClose: () => void;
}) {
  const [toneOpen, setToneOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Collapse the tone sub-menu whenever the menu re-anchors or closes.
  useEffect(() => {
    setToneOpen(false);
  }, [anchor]);

  // Close on Escape or on a pointer-down outside the menu. Using mousedown (not a
  // blocking overlay) lets the user start a fresh text selection right away.
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;

  // Clamp so the menu never spills off-screen.
  const width = 260;
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(anchor.y + 10, window.innerHeight - 200));

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Edit selection with AI"
      className="fixed z-50 w-[260px] overflow-hidden rounded-[14px] border border-border bg-surface shadow-elevated"
      style={{ left, top, animation: "cll-select-in 140ms ease-out" }}
    >
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        <Wand2 size={13} className="text-accent-ink" />
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-2">
          Edit with AI
        </span>
        {busy && <Loader2 size={13} className="ml-auto animate-spin text-accent-ink" />}
      </div>

      <div className="p-1.5">
        {ACTIONS.map(({ action, label, icon: Icon }) => (
          <button
            key={action}
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => onAction(action)}
            className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] font-medium text-text transition-colors hover:bg-accent-soft hover:text-accent-ink disabled:pointer-events-none disabled:opacity-55"
          >
            <Icon size={15} className="text-text-3" />
            {label}
          </button>
        ))}

        <button
          type="button"
          aria-expanded={toneOpen}
          disabled={busy}
          onClick={() => setToneOpen((o) => !o)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] font-medium text-text transition-colors hover:bg-accent-soft hover:text-accent-ink disabled:pointer-events-none disabled:opacity-55",
            toneOpen && "bg-surface-2",
          )}
        >
          <SlidersHorizontal size={15} className="text-text-3" />
          Change tone
        </button>

        {toneOpen && (
          <div className="mt-1 grid grid-cols-2 gap-1 px-1 pb-1">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                disabled={busy}
                onClick={() => onAction("retone", t.value)}
                className="rounded-[8px] border border-border bg-surface px-2 py-1.5 text-[12px] font-medium text-text-2 transition-colors hover:border-accent hover:text-accent-ink disabled:pointer-events-none disabled:opacity-55"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
