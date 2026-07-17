import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ══════════════════════════════════════════════════════════════════
   Anchored popover — fixed-position, portaled to <body> so it is never
   clipped by a scrollable modal body. Closes on outside click / Esc /
   scroll / resize.
   ══════════════════════════════════════════════════════════════════ */
type Pos = { left: number; top: number; width: number; up: boolean };

function useAnchored() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos>({ left: 0, top: 0, width: 0, up: false });

  useLayoutEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const up = below < 300 && r.top > below;
    setPos({ left: r.left, top: up ? r.top : r.bottom, width: r.width, up });
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, triggerRef, panelRef, pos };
}

const triggerBase =
  "flex h-10 w-full items-center gap-2 rounded-[9px] border border-border bg-input px-3 text-[13px] text-fg outline-none transition-[border-color,box-shadow] focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-weak hover:border-border-strong data-[open=true]:border-accent data-[open=true]:ring-2 data-[open=true]:ring-accent-weak";

function Panel({ panelRef, pos, className, children }: { panelRef: React.RefObject<HTMLDivElement | null>; pos: Pos; className?: string; children: ReactNode }) {
  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.up ? pos.top - 6 : pos.top + 6,
        transform: pos.up ? "translateY(-100%)" : undefined,
      }}
      className={cn(
        "cll-pop z-[80] rounded-[12px] border border-border-strong bg-surface-2 p-1.5 shadow-[0_20px_48px_-16px_rgba(0,0,0,.7)]",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

/* ══════════════════════════════════════════════════════════════════
   Select — on-brand dropdown (replaces native <select>)
   ══════════════════════════════════════════════════════════════════ */
export type Option = { value: string; label: string };

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  allowEmpty = true,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const { open, setOpen, triggerRef, panelRef, pos } = useAnchored();
  const selected = options.find((o) => o.value === value);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <>
      <button ref={triggerRef} type="button" data-open={open} onClick={() => setOpen((o) => !o)} className={cn(triggerBase, "justify-between")}>
        <span className={cn("truncate", selected ? "text-fg" : "text-fg-low")}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={15} className={cn("shrink-0 text-fg-low transition-transform duration-200", open && "rotate-180 text-accent-text")} />
      </button>
      {open ? (
        <Panel panelRef={panelRef} pos={pos} className="max-h-[248px] overflow-y-auto" >
          <div style={{ minWidth: pos.width }} role="listbox">
            {allowEmpty ? <OptionRow label="—" muted selected={!value} onPick={() => pick("")} /> : null}
            {options.map((o) => (
              <OptionRow key={o.value} label={o.label} selected={o.value === value} onPick={() => pick(o.value)} />
            ))}
          </div>
        </Panel>
      ) : null}
    </>
  );
}

function OptionRow({ label, selected, muted, onPick }: { label: string; selected: boolean; muted?: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] transition-colors",
        selected ? "bg-accent-weak font-medium text-accent-text" : muted ? "text-fg-low hover:bg-surface-3 hover:text-fg-mid" : "text-fg-mid hover:bg-surface-3 hover:text-fg",
      )}
    >
      <span className="truncate">{label}</span>
      {selected ? <Check size={14} className="shrink-0" /> : null}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════
   DateField — month picker, value is a "YYYY-MM" string
   ══════════════════════════════════════════════════════════════════ */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseYM(v: string): { y: number; m: number } | null {
  const m = /^(\d{4})(?:-(\d{1,2}))?/.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = m[2] ? Math.min(12, Math.max(1, Number(m[2]))) : 0;
  return { y, m: mo };
}

export function DateField({ value, onChange, placeholder = "YYYY-MM" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { open, setOpen, triggerRef, panelRef, pos } = useAnchored();
  const parsed = parseYM(value);
  const [year, setYear] = useState(() => parsed?.y ?? new Date().getFullYear());

  useEffect(() => {
    if (open) setYear(parseYM(value)?.y ?? new Date().getFullYear());
  }, [open, value]);

  const display = parsed && parsed.m ? `${MONTHS[parsed.m - 1]} ${parsed.y}` : parsed ? String(parsed.y) : "";
  const pick = (mo: number) => {
    onChange(`${year}-${String(mo).padStart(2, "0")}`);
    setOpen(false);
  };

  return (
    <>
      <button ref={triggerRef} type="button" data-open={open} onClick={() => setOpen((o) => !o)} className={cn(triggerBase, "justify-start")}>
        <Calendar size={14} className="shrink-0 text-fg-low" />
        <span className={cn("flex-1 truncate text-left", display ? "text-fg" : "text-fg-low")}>{display || placeholder}</span>
        {value ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-fg-low transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <X size={12} />
          </span>
        ) : null}
      </button>
      {open ? (
        <Panel panelRef={panelRef} pos={pos} className="w-[248px]">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="Previous year" className="grid h-7 w-7 place-items-center rounded-[8px] text-fg-mid transition-colors hover:bg-surface-3 hover:text-fg">
              <ChevronLeft size={16} />
            </button>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-fg">{year}</span>
            <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="Next year" className="grid h-7 w-7 place-items-center rounded-[8px] text-fg-mid transition-colors hover:bg-surface-3 hover:text-fg">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((label, i) => {
              const mo = i + 1;
              const active = parsed?.y === year && parsed?.m === mo;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => pick(mo)}
                  className={cn(
                    "rounded-[8px] py-2 text-[12px] font-medium transition-colors",
                    active ? "text-on-accent" : "text-fg-mid hover:bg-surface-3 hover:text-fg",
                  )}
                  style={active ? { background: "var(--accent-grad)" } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Panel>
      ) : null}
    </>
  );
}
