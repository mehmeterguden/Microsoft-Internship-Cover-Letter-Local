import { cn } from "@/lib/utils";

/* ── Segmented control (e.g. tone selector) ─────────────────────── */
type SegmentedOption<T extends string> = { value: T; label: string };

type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function Segmented<T extends string>({ options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      className={cn("flex gap-1 rounded-[11px] border border-border bg-input p-1", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded-[8px] px-2 py-2 text-center text-[13px] font-medium outline-none transition-colors",
              active ? "text-white" : "text-fg-mid hover:text-fg",
            )}
            style={active ? { background: "var(--accent-grad)", boxShadow: "0 4px 14px -6px var(--accent-shadow)" } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Slider ─────────────────────────────────────────────────────── */
type SliderProps = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  "aria-label"?: string;
};

export function Slider({ value, min = 0, max = 100, step = 1, onChange, className, ...aria }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("relative h-4 select-none", className)}>
      <div className="absolute left-0 right-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-input" />
      <div
        className="absolute left-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full"
        style={{ width: `${pct}%`, background: "var(--accent-grad)" }}
      />
      <div
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,.5)]"
        style={{ left: `${pct}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        {...aria}
      />
    </div>
  );
}

/* ── Toggle (switch) ────────────────────────────────────────────── */
type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  "aria-label"?: string;
};

export function Toggle({ checked, onChange, className, ...aria }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-[42px] shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-weak",
        !checked && "border border-border bg-input",
        className,
      )}
      style={checked ? { background: "var(--accent-grad)" } : undefined}
      {...aria}
    >
      <span
        className={cn(
          "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,.4)] transition-[left]",
          checked ? "left-[19px]" : "left-0.5",
        )}
      />
    </button>
  );
}
