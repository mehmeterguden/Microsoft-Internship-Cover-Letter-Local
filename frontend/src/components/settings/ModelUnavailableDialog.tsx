import { useEffect, useState } from "react";
import { CloudOff, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { getSettings, saveSettings } from "@/api/settings";
import { listModels } from "@/api/llm";
import { toast } from "@/store/toast";

// Fallback list if live discovery is unavailable, most-recommended first.
const CURATED = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.5-flash-lite"];
// Preference order when auto-selecting a replacement.
const PREFERRED = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash", "gemini-2.5-pro"];

function recommend(models: string[]): string {
  return PREFERRED.find((m) => models.includes(m)) ?? models[0] ?? "";
}

/**
 * Shown when a generation fails because the *model itself* is unavailable (e.g. a
 * 503 "high demand"). Lets the user pick a different model and retry in place — their
 * API keys and the rest of their settings are untouched. Reusable across features.
 */
export function ModelUnavailableDialog({
  open,
  onOpenChange,
  currentModel,
  onSwitched,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentModel: string;
  /** Called after the new model is saved; the caller re-runs the failed action. */
  onSwitched: (model: string) => void;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [chosen, setChosen] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listModels("gemini")
      .then((r) => (r.models.length ? r.models : CURATED))
      .catch(() => CURATED)
      .then((models) => {
        const alts = models.filter((m) => m !== currentModel);
        const list = alts.length ? alts : models;
        setOptions(list);
        setChosen(recommend(list));
      })
      .finally(() => setLoading(false));
  }, [open, currentModel]);

  const recommended = recommend(options);

  async function switchModel() {
    if (!chosen) return;
    setSaving(true);
    try {
      const settings = await getSettings();
      await saveSettings({ ...settings, llm_model: chosen });
      toast.success("Model switched", `Now using ${chosen}. Retrying…`);
      onOpenChange(false);
      onSwitched(chosen);
    } catch (err) {
      toast.error(err, "Couldn't switch model");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-gold-soft text-gold">
            <CloudOff size={22} />
          </div>
          <DialogTitle>Model unavailable</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-[13px] text-text">{currentModel || "The selected model"}</span> isn’t
            responding right now — usually high demand on the provider’s side. Pick another model to continue.
            Your API keys and everything else stay exactly as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-text">Switch to</span>
          {loading ? (
            <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3.5 py-2.5 text-[13.5px] text-text-3">
              <Loader2 size={15} className="animate-spin" /> Finding available models…
            </div>
          ) : (
            <Select value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label="Replacement model">
              {options.map((m) => (
                <option key={m} value={m}>
                  {m}
                  {m === recommended ? "  ·  recommended" : ""}
                </option>
              ))}
            </Select>
          )}
          <p className="text-[12px] text-text-3">
            You can change this any time in Settings → Language model.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button onClick={switchModel} loading={saving} disabled={loading || !chosen}>
            Switch &amp; try again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
