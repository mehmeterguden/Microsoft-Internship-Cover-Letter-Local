import { useCallback, useEffect, useState } from "react";
import { Check, CheckCircle2, Cpu, Download, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { downloadFoundryModel, getFoundryModels, type FoundryModels as FoundryModelsData } from "@/api/settings";
import { toast } from "@/store/toast";

/**
 * On-device model manager for Microsoft Foundry Local: shows what's installed,
 * lets the user pick one, and — when the Foundry Local SDK is present — download
 * a model from the catalog with one click (otherwise it shows the CLI command).
 */
export function FoundryModels({
  baseUrl,
  selected,
  onSelect,
}: {
  baseUrl: string;
  selected: string;
  onSelect: (model: string) => void;
}) {
  const [data, setData] = useState<FoundryModelsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getFoundryModels(baseUrl));
    } catch (err) {
      setData(null);
      toast.error(err, "Couldn't reach Foundry Local");
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  async function download(alias: string) {
    setDownloading(alias);
    try {
      await downloadFoundryModel(alias);
      toast.success("Model downloaded", `${alias} is ready on-device.`);
      onSelect(alias);
      await load();
    } catch (err) {
      toast.error(err, "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  const installed = data?.installed ?? [];
  const catalog = (data?.catalog ?? []).filter((m) => !installed.includes(m));

  return (
    <div className="grid gap-3 rounded-[13px] border border-border bg-surface-2 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-text">
          <Cpu size={14} className="text-accent-ink" /> On-device models
          {installed.length > 0 && <Badge tone="neutral">{installed.length} installed</Badge>}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-2 transition-colors hover:text-accent-ink"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : undefined} /> Refresh
        </button>
      </div>

      {/* Health — connected & on-device emphasis, or a reachability warning */}
      {data && !data.error ? (
        <p className="flex items-start gap-1.5 text-[12px] text-good">
          <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
          <span>
            Connected &amp; healthy — models run on your device via ONNX Runtime. No API key, nothing
            leaves your machine.
          </span>
        </p>
      ) : (
        data?.error && (
          <Alert tone="warning" title="Foundry Local isn't reachable">
            {data.error} Start it with <code className="font-mono">foundry service start</code>, then Refresh. You can
            still pick a model name below.
          </Alert>
        )
      )}

      {/* Installed — click to use */}
      {installed.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {installed.map((m) => {
            const active = m === selected;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onSelect(m)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "border-accent bg-accent-soft text-accent-ink"
                    : "border-border bg-surface text-text-2 hover:border-border-strong hover:text-text",
                )}
              >
                {active && <Check size={13} />} {m}
              </button>
            );
          })}
        </div>
      ) : (
        !loading && !data?.error && <p className="text-[12.5px] text-text-3">No models installed yet — download one below.</p>
      )}

      {/* Catalog — download (SDK) or show the CLI command */}
      {catalog.length > 0 && (
        <div className="grid gap-1.5 border-t border-border pt-3">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-text-3">
            Catalog {data && !data.catalog_live && "· common models"}
          </p>
          {!data?.can_download && (
            <p className="flex items-center gap-1.5 text-[12px] text-text-3">
              <TriangleAlert size={12} className="text-gold" />
              Install <code className="font-mono">foundry-local-sdk</code> to download here, or use the CLI.
            </p>
          )}
          <ul className="grid gap-1.5">
            {catalog.map((m) => (
              <li key={m} className="flex items-center justify-between gap-2 rounded-[9px] bg-surface px-2.5 py-1.5">
                <span className="truncate font-mono text-[12.5px] text-text-2">{m}</span>
                {data?.can_download ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => download(m)}
                    loading={downloading === m}
                    disabled={downloading != null}
                  >
                    <Download size={13} /> Download
                  </Button>
                ) : (
                  <code
                    className="shrink-0 rounded-[7px] bg-surface-2 px-2 py-1 font-mono text-[11px] text-text-3"
                    title="Run this in a terminal"
                  >
                    foundry model download {m}
                  </code>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && !data && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-text-3">
          <Loader2 size={13} className="animate-spin" /> Checking on-device models…
        </p>
      )}
    </div>
  );
}
