import { useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ProvenanceBadge } from "@/components/common/ProvenanceBadge";
import { cn } from "@/lib/utils";
import type { SectionState } from "@/lib/useSection";
import type { Sourced } from "@/api/types";

export type FieldType = "text" | "textarea" | "select" | "number" | "tags" | "switch";

export interface FieldSpec<T> {
  key: keyof T & string;
  label: string;
  type?: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  colSpan?: 1 | 2;
  hint?: string;
}

export interface SectionConfig<T> {
  singular: string; // "skill" — used in labels ("Add skill", "Remove skill")
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  make: () => T; // a fresh blank item
  fields: FieldSpec<T>[];
  primary: (item: T) => ReactNode; // card title
  secondary?: (item: T) => ReactNode; // card subtitle line
  meta?: (item: T) => ReactNode; // extra badges / inline controls
  body?: (item: T) => ReactNode; // longer description block
}

type Item = Sourced & { id?: number | null };

// ── One control in the editor dialog, bound to the draft item ────

function DynamicField<T extends Item>({
  spec,
  draft,
  set,
}: {
  spec: FieldSpec<T>;
  draft: T;
  set: (key: keyof T, value: unknown) => void;
}) {
  const id = `f-${String(spec.key)}`;
  const raw = draft[spec.key];
  const type = spec.type ?? "text";

  let control: ReactNode;
  if (type === "textarea") {
    control = (
      <Textarea id={id} value={(raw as string) ?? ""} placeholder={spec.placeholder}
        onChange={(e) => set(spec.key, e.target.value)} />
    );
  } else if (type === "select") {
    control = (
      <Select id={id} value={(raw as string) ?? ""} onChange={(e) => set(spec.key, e.target.value || null)}>
        <option value="">—</option>
        {spec.options?.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    );
  } else if (type === "switch") {
    control = (
      <div className="flex h-11 items-center">
        <Switch checked={Boolean(raw)} onCheckedChange={(v) => set(spec.key, v)} />
      </div>
    );
  } else if (type === "tags") {
    const value = Array.isArray(raw) ? (raw as string[]).join(", ") : "";
    control = (
      <Input id={id} value={value} placeholder={spec.placeholder}
        onChange={(e) => set(spec.key, e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
    );
  } else if (type === "number") {
    control = (
      <Input id={id} type="number" step="0.5" value={raw == null ? "" : String(raw)} placeholder={spec.placeholder}
        onChange={(e) => set(spec.key, e.target.value === "" ? null : Number(e.target.value))} />
    );
  } else {
    control = (
      <Input id={id} value={(raw as string) ?? ""} placeholder={spec.placeholder}
        onChange={(e) => set(spec.key, e.target.value)} />
    );
  }

  return (
    <Field label={spec.label} htmlFor={id} required={spec.required} hint={spec.hint}
      className={spec.colSpan === 2 ? "sm:col-span-2" : undefined}>
      {control}
    </Field>
  );
}

// ── The add/edit dialog ──────────────────────────────────────────

function EditorDialog<T extends Item>({
  config,
  open,
  initial,
  busy,
  onClose,
  onSave,
}: {
  config: SectionConfig<T>;
  open: boolean;
  initial: T;
  busy: boolean;
  onClose: () => void;
  onSave: (item: T) => void;
}) {
  const [draft, setDraft] = useState<T>(initial);
  const set = (key: keyof T, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));

  const missingRequired = config.fields.some(
    (f) => f.required && !String(draft[f.key] ?? "").trim(),
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(94vw,600px)]">
        <DialogHeader>
          <DialogTitle>
            {initial.id == null ? `Add ${config.singular}` : `Edit ${config.singular}`}
          </DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
          {config.fields.map((spec) => (
            <DynamicField key={String(spec.key)} spec={spec} draft={draft} set={set} />
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={missingRequired} onClick={() => onSave(draft)}>
            Save {config.singular}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── The section itself: header + cards + add button ──────────────

export function CrudSection<T extends Item>({
  config,
  section,
}: {
  config: SectionConfig<T>;
  section: SectionState<T>;
}) {
  const [editing, setEditing] = useState<T | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  async function save(item: T) {
    const ok = item.id == null
      ? await section.create(item)
      : await section.update(item.id, item);
    if (ok) setEditing(null);
  }

  return (
    <div className="grid gap-3">
      {section.items.length === 0 ? (
        <EmptyState
          icon={config.icon}
          title={config.emptyTitle}
          description={config.emptyDescription}
        />
      ) : (
        section.items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "group flex items-start justify-between gap-4 rounded-[12px] border border-border bg-surface p-4",
              "transition-colors hover:border-border-strong",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14.5px] font-bold text-text">{config.primary(item)}</span>
                {config.meta?.(item)}
                <ProvenanceBadge source={item.source} detail={item.source_detail} at={item.source_at} />
              </div>
              {config.secondary && (
                <p className="mt-0.5 text-[13px] text-text-2">{config.secondary(item)}</p>
              )}
              {config.body && <div className="mt-2 text-[13.5px] text-text-2">{config.body(item)}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                aria-label={`Edit ${config.singular}`}
                onClick={() => setEditing(item)}
                className="rounded-[7px] p-1.5 text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                aria-label={`Remove ${config.singular}`}
                onClick={() => item.id != null && setConfirmId(item.id)}
                className="rounded-[7px] p-1.5 text-text-3 transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))
      )}

      <div>
        <Button variant="dashed" onClick={() => setEditing(config.make())}>
          <Plus size={15} /> Add {config.singular}
        </Button>
      </div>

      {editing && (
        <EditorDialog
          config={config}
          open
          initial={editing}
          busy={section.busy}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}

      <ConfirmDialog
        open={confirmId != null}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title={`Remove this ${config.singular}?`}
        description="This can't be undone."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (confirmId != null) section.remove(confirmId);
          setConfirmId(null);
        }}
      />
    </div>
  );
}
