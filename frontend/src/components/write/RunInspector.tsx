import { useState } from "react";
import { Check, ChevronDown, Clock, Cpu, Layers, Minus, Telescope } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RunMeta } from "./letterTools";

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-[11px] border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">
        <Icon size={12} className="text-accent-ink" />
        {label}
      </div>
      <div className="mt-1 truncate text-[15px] font-semibold text-text" title={value}>
        {value}
      </div>
    </div>
  );
}

/**
 * [7] "Behind the scenes" run inspector — a collapsible panel revealing how the
 * last letter was built: the context sources that fed it, the pipeline steps,
 * and timing/model metadata (from the run's RunMeta). Also renders a loading
 * state while a generation is still streaming.
 */
export function RunInspector({ meta, loading }: { meta: RunMeta | null; loading: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-[13px] font-semibold text-text-2 transition-colors hover:text-text"
      >
        <Telescope size={15} className="text-accent-ink" />
        Behind the scenes
        {loading && (
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-3">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> building…
          </span>
        )}
        {meta && !loading && (
          <span className="font-mono text-[11px] font-normal text-text-3">
            {meta.durationS.toFixed(1)}s · {meta.context.filter((c) => c.included).length} sources
          </span>
        )}
        <ChevronDown
          size={16}
          className={cn("ml-auto text-text-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-line p-4">
          {loading && !meta ? (
            <div className="space-y-2">
              <div className="h-16 animate-pulse rounded-[11px] bg-surface-2" />
              <div className="h-24 animate-pulse rounded-[11px] bg-surface-2" />
            </div>
          ) : !meta ? (
            <p className="py-6 text-center text-[13px] text-text-3">
              Generate a letter to see how it was built.
            </p>
          ) : (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Stat icon={Clock} label="Duration" value={`${meta.durationS.toFixed(1)}s`} />
                <Stat icon={Layers} label="Words" value={meta.approxWords ? `~${meta.approxWords}` : "—"} />
                <Stat icon={Cpu} label="Model" value={meta.model ?? "—"} />
                <Stat icon={Cpu} label="Provider" value={meta.provider ?? "—"} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {/* Context that fed the letter */}
                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">
                    Context used
                  </div>
                  <ul className="grid gap-1.5">
                    {meta.context.map((c) => (
                      <li
                        key={c.label}
                        className={cn(
                          "flex items-center gap-2 rounded-[9px] border px-2.5 py-1.5 text-[12.5px]",
                          c.included
                            ? "border-border bg-surface-2 text-text"
                            : "border-dashed border-border text-text-3",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-4 w-4 shrink-0 place-items-center rounded-full",
                            c.included ? "bg-good-soft text-good" : "bg-surface-2 text-text-3",
                          )}
                        >
                          {c.included ? <Check size={11} /> : <Minus size={11} />}
                        </span>
                        <span className="font-medium">{c.label}</span>
                        {c.detail && <span className="ml-auto truncate text-text-3">{c.detail}</span>}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Pipeline steps */}
                <div>
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">
                    Steps
                  </div>
                  <ol className="relative ml-1.5 grid gap-3 border-l border-border pl-4">
                    {meta.steps.map((s) => (
                      <li key={s.label} className="relative">
                        <span className="absolute -left-[22px] top-0.5 grid h-4 w-4 place-items-center rounded-full bg-accent-soft text-accent-ink">
                          <Check size={10} />
                        </span>
                        <div className="text-[13px] font-semibold text-text">{s.label}</div>
                        {s.detail && <div className="text-[12px] text-text-3">{s.detail}</div>}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
