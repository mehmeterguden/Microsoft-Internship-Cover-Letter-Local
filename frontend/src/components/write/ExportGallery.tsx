import { useMemo, useState } from "react";
import { Check, FileDown, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import {
  EXPORT_TEMPLATES,
  buildLetterHtml,
  exportLetter,
  type ExportFormat,
  type ExportOptions,
  type ExportTemplate,
} from "./letterTools";

/**
 * [11] Export gallery — pick one of a few professional templates, see a live
 * preview, and download the letter as PDF or Word. Export goes through the
 * `exportLetter` seam (P1's `@/api/coverLetter` on integration).
 */
export function ExportGallery({
  open,
  onOpenChange,
  text,
  company,
  role,
  applicant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  company?: string;
  role?: string;
  applicant?: string;
}) {
  const [template, setTemplate] = useState<ExportTemplate>("classic");
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const options: ExportOptions = useMemo(
    () => ({ template, text, company, role, applicant }),
    [template, text, company, role, applicant],
  );
  const previewHtml = useMemo(() => buildLetterHtml(options), [options]);

  async function handleExport(format: ExportFormat) {
    setBusy(format);
    try {
      await exportLetter(format, options);
      toast.success(
        format === "pdf" ? "Opening print preview" : "Word document downloaded",
        format === "pdf" ? "Save as PDF from the print dialog." : "Find it in your downloads.",
      );
    } catch (err) {
      toast.error(err, "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,900px)]">
        <DialogHeader>
          <DialogTitle>Export letter</DialogTitle>
          <DialogDescription>Choose a template, preview it, then download.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          {/* Template picker */}
          <div className="flex flex-col gap-2">
            {EXPORT_TEMPLATES.map((t) => {
              const active = t.id === template;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-[12px] border p-3 text-left transition-colors",
                    active
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-surface hover:border-border-strong",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13.5px] font-semibold text-text">{t.name}</span>
                    {active && (
                      <span className="grid h-4 w-4 place-items-center rounded-full bg-accent text-on-accent">
                        <Check size={11} />
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-text-2">{t.blurb}</p>
                </button>
              );
            })}
          </div>

          {/* Live preview */}
          <div className="overflow-hidden rounded-[12px] border border-border bg-surface-2">
            <div className="border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">
              Live preview
            </div>
            <iframe
              title="Letter preview"
              srcDoc={previewHtml}
              className="h-[46vh] w-full bg-white"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => handleExport("docx")}
            loading={busy === "docx"}
            disabled={busy !== null}
          >
            <FileText size={16} /> Download Word
          </Button>
          <Button
            onClick={() => handleExport("pdf")}
            loading={busy === "pdf"}
            disabled={busy !== null}
          >
            <FileDown size={16} /> Download PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
