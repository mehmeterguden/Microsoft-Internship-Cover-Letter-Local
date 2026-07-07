import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { fieldBase } from "./input";
import { cn } from "@/lib/utils";

// Profile dates are month-granular strings ("YYYY-MM", sometimes "YYYY"). This
// picker reads either, edits with a month grid, and writes back "YYYY-MM" (or a
// bare "YYYY" via "year only"). Built on Radix Popover to match the custom Select.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const pad = (n: number) => String(n).padStart(2, "0");

function parse(v?: string): { year: number | null; month: number | null } {
  const m = (v ?? "").match(/^(\d{4})(?:-(\d{1,2}))?/);
  if (!m) return { year: null, month: null };
  const month = m[2] ? Number(m[2]) : null;
  return { year: Number(m[1]), month: month && month >= 1 && month <= 12 ? month : null };
}

export interface MonthPickerProps {
  value?: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * How far into the future a month may be selected, in months from the current
   * month (default 2 — a start date can be at most ~2 months ahead). Pass `null`
   * to allow any future date (e.g. a certificate's expiry).
   */
  maxMonthsAhead?: number | null;
  "aria-invalid"?: boolean;
}

export function MonthPicker({
  value,
  onChange,
  id,
  placeholder = "Pick a month",
  disabled,
  className,
  maxMonthsAhead = 2,
  ...aria
}: MonthPickerProps) {
  const parsed = parse(value);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed.year ?? new Date().getFullYear());

  // Latest selectable (year, month), or null when the future is unrestricted.
  const cap = (() => {
    if (maxMonthsAhead == null) return null;
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + maxMonthsAhead, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  })();
  const beyondCap = (year: number, month: number) =>
    cap != null && (year > cap.year || (year === cap.year && month > cap.month));
  const nextYearBlocked = cap != null && viewYear >= cap.year;

  const label =
    parsed.year == null
      ? null
      : parsed.month == null
        ? `${parsed.year}`
        : `${MONTHS_LONG[parsed.month - 1]} ${parsed.year}`;

  function commit(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        if (o) setViewYear(parsed.year ?? new Date().getFullYear());
        setOpen(o);
      }}
    >
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          aria-invalid={aria["aria-invalid"]}
          className={cn(
            fieldBase,
            "group inline-flex items-center justify-between gap-2 text-left",
            "data-[state=open]:border-accent data-[state=open]:ring-[3px] data-[state=open]:ring-accent-soft",
            !label && "text-text-3",
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{label ?? placeholder}</span>
          <span className="flex shrink-0 items-center gap-1">
            {label && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear date"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }}
                className="grid place-items-center rounded-full p-0.5 text-text-3 hover:bg-surface-2 hover:text-danger"
              >
                <X size={13} />
              </span>
            )}
            <Calendar size={15} className="text-text-3" />
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-64 rounded-[12px] border border-border bg-surface p-3 shadow-elevated animate-[cll-select-in_140ms_ease-out]"
        >
          <div className="mb-2.5 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => setViewYear((y) => y - 1)}
              className="grid h-8 w-8 place-items-center rounded-[8px] text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[15px] font-bold tabular-nums text-text">{viewYear}</span>
            <button
              type="button"
              aria-label="Next year"
              disabled={nextYearBlocked}
              onClick={() => setViewYear((y) => y + 1)}
              className="grid h-8 w-8 place-items-center rounded-[8px] text-text-2 transition-colors hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-35"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((m, i) => {
              const selected = parsed.year === viewYear && parsed.month === i + 1;
              const blocked = beyondCap(viewYear, i + 1);
              return (
                <button
                  key={m}
                  type="button"
                  disabled={blocked}
                  title={blocked ? "Can't be more than 2 months in the future" : undefined}
                  onClick={() => commit(`${viewYear}-${pad(i + 1)}`)}
                  className={cn(
                    "rounded-[8px] py-2 text-[13px] font-semibold transition-colors",
                    selected
                      ? "bg-accent text-on-accent shadow-soft"
                      : "text-text-2 hover:bg-accent-soft hover:text-accent-ink",
                    blocked && "pointer-events-none opacity-30 hover:bg-transparent hover:text-text-2",
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5">
            <button
              type="button"
              onClick={() => commit("")}
              className="text-[12.5px] font-semibold text-text-3 transition-colors hover:text-danger"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={cap != null && viewYear > cap.year}
              onClick={() => commit(String(viewYear))}
              className="text-[12.5px] font-semibold text-text-2 transition-colors hover:text-accent-ink disabled:pointer-events-none disabled:opacity-35"
            >
              Use {viewYear} only
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
