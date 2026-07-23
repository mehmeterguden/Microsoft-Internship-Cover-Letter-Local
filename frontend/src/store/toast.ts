import { create } from "zustand";
import { parseError } from "@/api/errors";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type ToastAction = { label: string; onClick: () => void };

export type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Raw technical string shown behind a "Show details" toggle (errors only). */
  detail?: string | null;
  /** Machine error code, surfaced alongside the detail. */
  code?: string | null;
  /** Optional single action button (e.g. "Open settings", "Try again"). */
  action?: ToastAction;
  /** Keep on screen until dismissed (default true for errors). */
  sticky?: boolean;
};

type ToastState = {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helper so any code can raise a toast without hooks. */
export const toast = {
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: "info", title, description }),
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: "success", title, description }),
  warning: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: "warning", title, description }),
  danger: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: "danger", title, description }),
  /**
   * Raise an error toast from any thrown/received value. Normalizes it to an
   * `AppError` (friendly title + message, raw detail behind a toggle) and stays on
   * screen until dismissed. Pass `title` to override the heading (e.g. "Save failed"),
   * keeping the classified message as the description.
   */
  error: (err: unknown, title?: string, action?: ToastAction) => {
    const e = parseError(err);
    return useToastStore.getState().push({
      tone: "danger",
      title: title ?? e.title,
      description: e.message,
      detail: e.detail,
      code: e.code,
      action,
      sticky: true,
    });
  },
};
