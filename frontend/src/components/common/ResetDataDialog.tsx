import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetAllData } from "@/api/data";
import { errorMessage } from "@/api/client";
import { toast } from "@/store/toast";

const WIPES = [
  "Your profile, contact details & skills",
  "Experience, education, projects, certificates, languages, links",
  "Imported GitHub repositories",
  "Past cover letters & your learned writing voice (RAG index)",
  "Saved applications & generated letters",
];

/** Two-step, type-to-confirm guard for permanently erasing all profile data. */
export function ResetDataDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    onOpenChange(false);
    // reset local state after the close animation
    window.setTimeout(() => { setStep(1); setConfirmText(""); }, 200);
  }

  async function doReset() {
    setBusy(true);
    try {
      const res = await resetAllData();
      toast.success("All data deleted", `${res.total} records removed. Starting fresh.`);
      close();
      window.setTimeout(() => { window.location.href = "/"; }, 600);
    } catch (err) {
      toast.danger("Reset failed", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger">
            <AlertTriangle size={22} />
          </div>
          <DialogTitle>{step === 1 ? "Reset all profile data?" : "This is permanent"}</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "This permanently deletes everything you've added. It cannot be undone."
              : "There is no way to recover this data afterwards. Type DELETE to confirm."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <ul className="grid gap-1.5 rounded-[12px] bg-danger-soft p-3.5">
            {WIPES.map((w) => (
              <li key={w} className="flex items-start gap-2 text-[13px] text-text">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" /> {w}
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid gap-2">
            <label className="text-[13px] font-semibold text-text">Type <span className="font-mono text-danger">DELETE</span> to confirm</label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" autoFocus />
            <p className="text-[12px] text-text-3">Your settings (model & keys) are kept. Everything else is erased.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          {step === 1 ? (
            <Button variant="danger" onClick={() => setStep(2)}>I understand, continue</Button>
          ) : (
            <Button variant="danger" loading={busy} disabled={confirmText.trim() !== "DELETE"} onClick={doReset}>
              Delete everything
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
