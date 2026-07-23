import { useEffect, useRef, useState } from "react";
import { Activity, ChevronDown, Cpu, Sparkles, Timer, Zap } from "lucide-react";
import { getUsage } from "@/api/usage";
import { isAiActive, useAiActivity, type UsageRun } from "@/store/aiActivity";
import { cn } from "@/lib/utils";

function fmtCost(usd: number): string {
  if (!usd) return "$0.00";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
const fmtTokens = (n: number): string => n.toLocaleString();

/**
 * Global "AI usage" meter — mounted once in AppShell, so it appears on every AI
 * page automatically. Pulses while any AI request is in flight (client axios +
 * the backend's in-flight count, which also covers SSE generations), and shows
 * the last call's tokens/cost + today's total. Click to expand a breakdown.
 */
export function AiUsageMeter() {
  const active = useAiActivity(isAiActive);
  const last = useAiActivity((s) => s.last);
  const today = useAiActivity((s) => s.today);
  const recent = useAiActivity((s) => s.recent);
  const setUsage = useAiActivity((s) => s.setUsage);
  const [open, setOpen] = useState(false);

  // Poll usage: quickly while active (snappy), slowly when idle. Pauses when the
  // tab is hidden. This is also what makes SSE generations pulse the meter.
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    let alive = true;
    let timer: number;
    const tick = async () => {
      if (!alive) return;
      if (!document.hidden) {
        try {
          const u = await getUsage(12);
          if (alive) setUsage(u);
        } catch {
          /* backend not up yet — try again next tick */
        }
      }
      if (alive) timer = window.setTimeout(tick, activeRef.current ? 800 : 4000);
    };
    tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [setUsage]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-[280px] overflow-hidden rounded-[14px] border border-border bg-surface shadow-elevated" style={{ animation: "cll-rise 0.2s both" }}>
          <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
            <Sparkles size={15} className="text-accent-ink" />
            <span className="text-[13px] font-bold text-text">AI usage</span>
            <span className="ml-auto text-[11px] text-text-3">estimated</span>
          </div>
          <div className="grid grid-cols-3 gap-2 px-3.5 py-3">
            <Stat label="Calls today" value={String(today.calls)} />
            <Stat label="Tokens" value={fmtTokens(today.tokens)} />
            <Stat label="Cost" value={fmtCost(today.cost_usd)} />
          </div>
          {last && (
            <div className="border-t border-border px-3.5 py-2.5">
              <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-text-3">Last call</p>
              <RunRow run={last} />
            </div>
          )}
          {recent.length > 1 && (
            <div className="max-h-40 overflow-auto border-t border-border px-3.5 py-2">
              {recent.slice(0, 6).map((r) => <RunRow key={r.id} run={r} compact />)}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="AI usage"
        className={cn(
          "flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold shadow-soft transition-colors",
          active
            ? "border-accent/40 bg-accent-soft text-accent-ink"
            : "border-border bg-surface text-text-2 hover:border-border-strong hover:text-text",
        )}
      >
        <span className="relative grid h-4 w-4 place-items-center">
          {active ? (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </>
          ) : (
            <Activity size={14} />
          )}
        </span>
        {active ? (
          <span>AI working…</span>
        ) : last ? (
          <span className="tabular-nums">
            {fmtTokens(last.total_tokens)} tok · {fmtCost(last.cost_usd)}
            <span className="ml-1.5 text-text-3">today {fmtCost(today.cost_usd)}</span>
          </span>
        ) : (
          <span className="text-text-3">AI idle</span>
        )}
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-surface-2 px-2 py-2 text-center">
      <p className="truncate text-[15px] font-bold tabular-nums text-text">{value}</p>
      <p className="mt-0.5 text-[10px] text-text-3">{label}</p>
    </div>
  );
}

function RunRow({ run, compact = false }: { run: UsageRun; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 text-[12px]", compact ? "py-1" : "")}>
      <Cpu size={12} className="shrink-0 text-text-3" />
      <span className="min-w-0 flex-1 truncate text-text-2">{run.model || run.provider}</span>
      <span className="flex items-center gap-1 tabular-nums text-text-3">
        <Zap size={11} /> {fmtTokens(run.total_tokens)}
      </span>
      <span className="tabular-nums font-semibold text-text">{fmtCost(run.cost_usd)}</span>
      {!compact && (
        <span className="flex items-center gap-0.5 tabular-nums text-text-3">
          <Timer size={11} /> {run.latency_ms}ms
        </span>
      )}
    </div>
  );
}
