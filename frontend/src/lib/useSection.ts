import { useEffect, useState } from "react";
import { toast } from "@/store/toast";

export interface SectionApi<T> {
  create: (item: T) => Promise<T>;
  update: (id: number, item: T) => Promise<T>;
  remove: (id: number) => Promise<void>;
}

export interface SectionState<T extends { id?: number | null }> {
  items: T[];
  busy: boolean;
  create: (item: T) => Promise<boolean>;
  update: (id: number, item: T) => Promise<boolean>;
  remove: (id: number) => Promise<void>;
  patch: (item: T, changes: Partial<T>) => Promise<void>;
}

/**
 * Local state + persistence for one editable list section (skills, experiences,
 * …). Keeps an in-memory copy in sync with the server: each mutation calls the
 * API, updates the list on success, and surfaces failures as a toast.
 */
export function useSection<T extends { id?: number | null }>(
  initial: T[],
  api: SectionApi<T>,
  label: string,
): SectionState<T> {
  const [items, setItems] = useState<T[]>(initial);
  const [busy, setBusy] = useState(false);

  // Re-seed when the parent finishes its initial load (or reloads).
  useEffect(() => setItems(initial), [initial]);

  async function create(item: T): Promise<boolean> {
    setBusy(true);
    try {
      const created = await api.create(item);
      setItems((prev) => [...prev, created]);
      return true;
    } catch (err) {
      toast.error(err, `Couldn't add ${label}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function update(id: number, item: T): Promise<boolean> {
    setBusy(true);
    try {
      const saved = await api.update(id, item);
      setItems((prev) => prev.map((x) => (x.id === id ? saved : x)));
      return true;
    } catch (err) {
      toast.error(err, `Couldn't update ${label}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number): Promise<void> {
    const prev = items;
    setItems((cur) => cur.filter((x) => x.id !== id)); // optimistic
    try {
      await api.remove(id);
    } catch (err) {
      setItems(prev); // roll back
      toast.error(err, `Couldn't remove ${label}`);
    }
  }

  /** Patch a single field of one item and persist it (used for inline edits). */
  async function patch(item: T, changes: Partial<T>): Promise<void> {
    if (item.id == null) return;
    const next = { ...item, ...changes };
    setItems((prev) => prev.map((x) => (x.id === item.id ? next : x)));
    try {
      await api.update(item.id, next);
    } catch (err) {
      setItems((prev) => prev.map((x) => (x.id === item.id ? item : x)));
      toast.error(err, `Couldn't update ${label}`);
    }
  }

  return { items, busy, create, update, remove, patch };
}
