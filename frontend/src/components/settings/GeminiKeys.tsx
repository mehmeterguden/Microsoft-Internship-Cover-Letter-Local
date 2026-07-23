import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Loader2, Plus, Trash2, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  addGeminiKey,
  removeGeminiKey,
  setGeminiActiveKey,
  setKeySwitchMode,
} from "@/api/settings";
import type { GeminiKeyConfig } from "@/api/types";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";

/** Show a key as `AQ.Ab8…yY5B2A` — enough to recognize it, never the whole secret. */
function mask(key: string): string {
  if (key.length <= 14) return key;
  return `${key.slice(0, 7)}…${key.slice(-6)}`;
}

/**
 * Manage the rotating pool of Gemini API keys.
 *
 * Gemini rate-limits each key separately, so the user can register several and
 * the app rotates between them. Every action (add / remove / select / mode)
 * persists to the DB immediately through its own endpoint — no "Save" needed,
 * and nothing is lost on a page reload.
 */
export function GeminiKeys({
  config,
  onChange,
}: {
  config: GeminiKeyConfig;
  onChange: (config: GeminiKeyConfig) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // action id in flight
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const { keys, active_id, mode } = config;

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(action: string, fn: () => Promise<GeminiKeyConfig>, ok?: [string, string]) {
    setBusy(action);
    try {
      onChange(await fn());
      if (ok) toast.success(ok[0], ok[1]);
    } catch (err) {
      toast.error(err, "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    const key = newKey.trim();
    if (!key) return;
    await run("add", () => addGeminiKey(key, newLabel.trim()), ["Key added", "Saved to your local database."]);
    setNewKey("");
    setNewLabel("");
  }

  const multiple = keys.length > 1;

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-text">
          API keys
          {keys.length > 0 && (
            <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-text-2">
              {keys.length}
            </span>
          )}
        </span>
      </div>

      <p className="-mt-1 text-[12px] leading-relaxed text-text-3">
        Gemini rate-limits each key on its own. Add several and the app keeps working when one runs out.
      </p>

      {/* Key list */}
      {keys.length > 0 && (
        <ul className="grid gap-2">
          {keys.map((k) => {
            const isActive = k.id === active_id;
            const selectable = mode === "manual";
            const show = revealed.has(k.id);
            return (
              <li
                key={k.id}
                className={cn(
                  "flex items-center gap-3 rounded-[10px] border px-3 py-2.5 transition-colors",
                  isActive ? "border-accent bg-accent-soft/40" : "border-border bg-surface",
                )}
              >
                {/* Active indicator / manual selector */}
                <button
                  type="button"
                  disabled={!selectable || busy != null}
                  onClick={() =>
                    selectable && !isActive
                      ? run("active", () => setGeminiActiveKey(k.id))
                      : undefined
                  }
                  title={
                    selectable
                      ? isActive
                        ? "In use"
                        : "Use this key"
                      : isActive
                        ? "In use now (rotates automatically)"
                        : undefined
                  }
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
                    isActive ? "border-accent bg-accent text-on-accent" : "border-border-strong text-transparent",
                    selectable && !isActive && "cursor-pointer hover:border-accent",
                    !selectable && "cursor-default",
                  )}
                >
                  {isActive ? <Check size={12} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />}
                </button>

                <KeyRound size={15} className="shrink-0 text-text-3" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-text">{k.label || "Untitled key"}</span>
                    {isActive && (
                      <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-accent-ink">
                        Active
                      </span>
                    )}
                  </div>
                  <span className="block truncate font-mono text-[11.5px] text-text-3">
                    {show ? k.key : mask(k.key)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => toggleReveal(k.id)}
                  title={show ? "Hide key" : "Reveal key"}
                  className="shrink-0 rounded-md p-1.5 text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => run("remove", () => removeGeminiKey(k.id))}
                  title="Remove key"
                  className="shrink-0 rounded-md p-1.5 text-text-3 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                >
                  {busy === "remove" ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add a key */}
      <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-border-strong bg-surface-2/50 p-2.5 sm:flex-row sm:items-center">
        <Input
          type="password"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="Paste a Gemini API key…"
          className="flex-1 bg-surface"
          aria-label="New Gemini API key"
        />
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="Label (optional)"
          className="bg-surface sm:w-40"
          aria-label="Label for the new key"
        />
        <Button size="sm" onClick={add} loading={busy === "add"} disabled={!newKey.trim() || busy != null}>
          <Plus size={16} /> Add
        </Button>
      </div>

      {/* When there is more than one key, ask how to handle running out */}
      {multiple && (
        <div className="mt-1 grid gap-2 rounded-[10px] border border-border bg-surface-2 p-3">
          <span className="text-[12.5px] font-semibold text-text">When a key hits its limit</span>
          <div className="grid grid-cols-2 gap-2">
            <ModeButton
              active={mode === "auto"}
              disabled={busy != null}
              onClick={() => mode !== "auto" && run("mode", () => setKeySwitchMode("auto"))}
              icon={<Zap size={15} />}
              title="Switch automatically"
              desc="Move to the next key with no interruption"
            />
            <ModeButton
              active={mode === "manual"}
              disabled={busy != null}
              onClick={() => mode !== "manual" && run("mode", () => setKeySwitchMode("manual"))}
              icon={<KeyRound size={15} />}
              title="Let me choose"
              desc="Stop and I'll pick which key to use"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col gap-1 rounded-[9px] border px-3 py-2.5 text-left transition-all disabled:opacity-60",
        active
          ? "border-accent bg-accent-soft/50 ring-1 ring-accent"
          : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <span className={cn("flex items-center gap-1.5 text-[13px] font-semibold", active ? "text-accent-ink" : "text-text")}>
        {icon} {title}
      </span>
      <span className="text-[11.5px] leading-snug text-text-3">{desc}</span>
    </button>
  );
}
