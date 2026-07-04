import { create } from "zustand";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
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
};
