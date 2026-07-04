import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export function FileDropzone({
  accept,
  onFile,
  hint,
  disabled = false,
  className,
}: {
  accept?: string;
  onFile: (file: File) => void;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border-[1.5px] border-dashed px-6 py-12 text-center transition-colors",
        dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-surface-2",
        disabled && "opacity-55",
        className,
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent-ink">
        <UploadCloud size={22} />
      </span>
      <div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="text-[14.5px] font-semibold text-accent-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Choose a file
        </button>
        <span className="text-[14px] text-text-2"> or drag it here</span>
        {hint && <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-text-3">{hint}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
