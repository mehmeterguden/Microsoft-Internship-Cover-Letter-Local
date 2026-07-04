import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Inline-editable text rendered directly on the document. Uncontrolled by design:
 * the DOM owns the text while the user types (so the caret never jumps), and we
 * only push `value` back into the node when it changes externally (e.g. AI
 * streaming or a profile seed) AND the node isn't currently focused.
 */
export function Editable({
  value,
  onChange,
  placeholder,
  multiline = false,
  className,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerText !== value) {
      el.innerText = value;
    }
  }, [value]);

  return (
    <div
      ref={ref}
      role="textbox"
      aria-label={placeholder}
      contentEditable
      suppressContentEditableWarning
      data-ph={placeholder}
      onInput={(e) => onChange(e.currentTarget.innerText)}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") e.preventDefault();
      }}
      className={cn(
        "cursor-text rounded-[4px] outline-none transition-shadow",
        "hover:bg-black/[0.02] focus:bg-accent/5 focus:ring-2 focus:ring-accent/40",
        multiline && "whitespace-pre-wrap",
        className,
      )}
      style={style}
    />
  );
}
