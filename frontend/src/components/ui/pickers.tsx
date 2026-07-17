import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ══════════════════════════════════════════════════════════════════
   Anchored popover — fixed-position, portaled to <body> so it is never
   clipped by a scrollable modal body. Closes on outside click / Esc /
   page scroll / resize — but NOT when scrolling inside the panel itself.
   ══════════════════════════════════════════════════════════════════ */
type Pos = { left: number; top: number; width: number; up: boolean };

function useAnchored<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos>({ left: 0, top: 0, width: 0, up: false });
  // Portal into the enclosing modal (if any) so the popover stays inside the
  // dialog's focus + interaction scope; position is relative to that box.
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (!el) return;
    const host = (el.closest('[role="dialog"]') as HTMLElement | null) ?? null;
    setContainer(host);
    const r = el.getBoundingClientRect();
    const c = host?.getBoundingClientRect();
    const cLeft = c?.left ?? 0;
    const cTop = c?.top ?? 0;
    const below = window.innerHeight - r.bottom;
    const up = below < 320 && r.top > below;
    setPos({ left: r.left - cLeft, top: (up ? r.top : r.bottom) - cTop, width: r.width, up });
    const onScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
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

  return { open, setOpen, triggerRef, panelRef, pos, container };
}

const triggerBase =
  "flex h-10 w-full items-center gap-2 rounded-[9px] border border-border bg-input px-3 text-[13px] text-fg outline-none transition-[border-color,box-shadow] focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-weak hover:border-border-strong data-[open=true]:border-accent data-[open=true]:ring-2 data-[open=true]:ring-accent-weak";

function Panel({
  panelRef,
  pos,
  container,
  className,
  children,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  pos: Pos;
  container: HTMLElement | null;
  className?: string;
  children: ReactNode;
}) {
  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.up ? pos.top - 6 : pos.top + 6,
        transform: pos.up ? "translateY(-100%)" : undefined,
        minWidth: pos.width,
      }}
      className={cn(
        "cll-pop z-[80] overflow-hidden rounded-[12px] border border-border-strong bg-surface-2 shadow-[0_20px_48px_-16px_rgba(0,0,0,.7)]",
        className,
      )}
    >
      {children}
    </div>,
    container ?? document.body,
  );
}

function OptionRow({ label, selected, muted, onPick }: { label: ReactNode; selected: boolean; muted?: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] transition-colors",
        selected ? "bg-accent-weak font-medium text-accent-text" : muted ? "text-accent-text hover:bg-surface-3" : "text-fg-mid hover:bg-surface-3 hover:text-fg",
      )}
    >
      <span className="truncate">{label}</span>
      {selected ? <Check size={14} className="shrink-0" /> : null}
    </button>
  );
}

export type Option = { value: string; label: string };

/* ══════════════════════════════════════════════════════════════════
   SearchSelect — dropdown with an in-panel search box + scrollable list.
   `allowCustom` lets the user commit a typed value not in the list.
   The search box appears when the list is long or custom values are allowed.
   ══════════════════════════════════════════════════════════════════ */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  allowCustom = false,
  searchPlaceholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  allowCustom?: boolean;
  searchPlaceholder?: string;
}) {
  const { open, setOpen, triggerRef, panelRef, pos, container } = useAnchored<HTMLButtonElement>();
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const searchable = allowCustom || options.length > 7;

  useEffect(() => {
    if (!open) return;
    setQ("");
    const id = window.setTimeout(() => searchRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const display = selected ? selected.label : value;
  const ql = q.trim().toLowerCase();
  const filtered = ql ? options.filter((o) => o.label.toLowerCase().includes(ql)) : options;
  const exact = options.some((o) => o.label.toLowerCase() === ql || o.value.toLowerCase() === ql);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <>
      <button ref={triggerRef} type="button" data-open={open} onClick={() => setOpen((o) => !o)} className={cn(triggerBase, "justify-between")}>
        <span className={cn("truncate", display ? "text-fg" : "text-fg-low")}>{display || placeholder}</span>
        <ChevronDown size={15} className={cn("shrink-0 text-fg-low transition-transform duration-200", open && "rotate-180 text-accent-text")} />
      </button>
      {open ? (
        <Panel panelRef={panelRef} pos={pos} container={container}>
          {searchable ? (
            <div className="border-b border-border p-1.5">
              <div className="flex items-center gap-2 rounded-[8px] bg-input px-2.5">
                <Search size={14} className="shrink-0 text-fg-low" />
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={searchPlaceholder}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (filtered[0]) pick(filtered[0].value);
                      else if (allowCustom && q.trim()) pick(q.trim());
                    }
                  }}
                  className="h-9 flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-low outline-none"
                />
                {q ? (
                  <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="grid h-5 w-5 place-items-center rounded-full text-fg-low hover:bg-surface-3 hover:text-fg">
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <div style={{ maxHeight: 264 }} className="overflow-y-auto p-1.5">
            {allowCustom && q.trim() && !exact ? (
              <OptionRow label={<>Use “<span className="font-medium text-fg">{q.trim()}</span>”</>} selected={false} muted onPick={() => pick(q.trim())} />
            ) : null}
            {!allowCustom && value ? <OptionRow label="— Clear —" selected={false} muted onPick={() => pick("")} /> : null}
            {filtered.map((o) => (
              <OptionRow key={o.value} label={o.label} selected={o.value === value} onPick={() => pick(o.value)} />
            ))}
            {!filtered.length && !(allowCustom && q.trim()) ? (
              <div className="px-2.5 py-6 text-center text-[12px] text-fg-low">No matches</div>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TagField — chips + suggestions. Value is a comma-separated string.
   ══════════════════════════════════════════════════════════════════ */
export function TagField({
  value,
  onChange,
  suggestions = [],
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const { open, setOpen, triggerRef, panelRef, pos, container } = useAnchored<HTMLDivElement>();
  const [draft, setDraft] = useState("");
  const tags = value.split(",").map((s) => s.trim()).filter(Boolean);

  const add = (t: string) => {
    const v = t.trim().replace(/,+$/, "").trim();
    if (!v) return;
    if (!tags.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...tags, v].join(", "));
    setDraft("");
  };
  const remove = (t: string) => onChange(tags.filter((x) => x !== t).join(", "));

  const dl = draft.trim().toLowerCase();
  const avail = suggestions.filter((s) => !tags.some((x) => x.toLowerCase() === s.toLowerCase()) && (!dl || s.toLowerCase().includes(dl)));

  return (
    <div ref={triggerRef} className="relative">
      <div
        className={cn(
          "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-[9px] border border-border bg-input px-2 py-1.5 transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-weak",
          open && "border-accent",
        )}
        onClick={() => triggerRef.current?.querySelector("input")?.focus()}
      >
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-[7px] border border-border bg-surface-2 py-0.5 pl-2 pr-1 font-mono text-[11px] text-fg-mid">
            {t}
            <button type="button" onClick={() => remove(t)} aria-label={`Remove ${t}`} className="grid h-4 w-4 place-items-center rounded-full text-fg-low transition-colors hover:bg-surface-3 hover:text-danger">
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={tags.length ? "" : placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            if (suggestions.length && !open) setOpen(true);
          }}
          onFocus={() => suggestions.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && tags.length) {
              remove(tags[tags.length - 1]);
            }
          }}
          className="h-6 min-w-[90px] flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-low outline-none"
        />
      </div>
      {open && avail.length ? (
        <Panel panelRef={panelRef} pos={pos} container={container}>
          <div style={{ maxHeight: 224 }} className="overflow-y-auto p-1.5">
            {avail.slice(0, 60).map((s) => (
              <OptionRow key={s} label={s} selected={false} onPick={() => add(s)} />
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
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
  const { open, setOpen, triggerRef, panelRef, pos, container } = useAnchored<HTMLButtonElement>();
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
        <Panel panelRef={panelRef} pos={pos} container={container} className="w-[248px]">
          <div className="p-2">
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
                    className={cn("rounded-[8px] py-2 text-[12px] font-medium transition-colors", active ? "text-on-accent" : "text-fg-mid hover:bg-surface-3 hover:text-fg")}
                    style={active ? { background: "var(--accent-grad)" } : undefined}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
