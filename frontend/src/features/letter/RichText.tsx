import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Rich contentEditable storing HTML. Uncontrolled while focused (so the caret and
 * formatting selection are preserved); syncs from `html` only when the value
 * changes externally and the node isn't focused (e.g. AI streaming).
 */
export function RichText({
  html,
  onChange,
  onFocus,
  placeholder,
  className,
  style,
  autoFocus,
}: {
  html: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerHTML !== html) el.innerHTML = html;
  }, [html]);

  useEffect(() => {
    if (autoFocus && ref.current) {
      const el = ref.current;
      el.focus();
      // place caret at the end
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  }, [autoFocus]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-ph={placeholder}
      onFocus={onFocus}
      onInput={(e) => onChange(e.currentTarget.innerHTML)}
      className={cn("cursor-text rounded-[3px] outline-none focus:ring-2 focus:ring-accent/30", className)}
      style={style}
    />
  );
}
