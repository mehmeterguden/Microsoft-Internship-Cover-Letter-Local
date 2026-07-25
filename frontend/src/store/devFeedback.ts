// TEMPORARY: Developer Feedback System (TO BE REMOVED BEFORE PRODUCTION)

import { create } from "zustand";

export type DevFeedbackCategory = "ui_layout" | "bug_fix" | "copy_text" | "feature_request" | "other";

export interface DevFeedbackItem {
  id: string;
  createdAt: string; // ISO string
  route: string;
  tagName: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  textSnippet: string;
  category: DevFeedbackCategory;
  notes: string;
  screenshotUrl?: string; // Data URL PNG
}

interface DevFeedbackState {
  inspectorActive: boolean;
  items: DevFeedbackItem[];
  toggleInspector: (active?: boolean) => void;
  addFeedback: (item: Omit<DevFeedbackItem, "id" | "createdAt">) => void;
  removeFeedback: (id: string) => void;
  clearAllFeedback: () => void;
  generateAiPrompt: () => string;
}

const STORAGE_KEY = "cll_dev_feedback_items_v1";

const loadInitialItems = (): DevFeedbackItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveItemsToStorage = (items: DevFeedbackItem[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("Failed to save dev feedback to storage", e);
  }
};

export const useDevFeedbackStore = create<DevFeedbackState>((set, get) => ({
  inspectorActive: false,
  items: loadInitialItems(),

  toggleInspector: (active) => {
    set((state) => ({
      inspectorActive: active !== undefined ? active : !state.inspectorActive,
    }));
  },

  addFeedback: (itemData) => {
    const newItem: DevFeedbackItem = {
      ...itemData,
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [newItem, ...get().items];
    saveItemsToStorage(updated);
    set({ items: updated, inspectorActive: false });
  },

  removeFeedback: (id) => {
    const updated = get().items.filter((item) => item.id !== id);
    saveItemsToStorage(updated);
    set({ items: updated });
  },

  clearAllFeedback: () => {
    saveItemsToStorage([]);
    set({ items: [] });
  },

  generateAiPrompt: () => {
    const items = get().items;
    if (items.length === 0) {
      return "No developer feedback items recorded yet.";
    }

    const lines: string[] = [
      "# Developer Feedback & UI Edits Request",
      "",
      `Please apply the following ${items.length} requested UI/code modifications:`,
      "",
    ];

    items.forEach((item, index) => {
      const categoryLabel =
        item.category === "ui_layout"
          ? "UI / Layout Adjustment"
          : item.category === "bug_fix"
          ? "Bug Fix"
          : item.category === "copy_text"
          ? "Copy / Text Change"
          : item.category === "feature_request"
          ? "Feature Request"
          : "General Feedback";

      lines.push(`### Item ${index + 1}: ${categoryLabel}`);
      lines.push(`- **Date**: ${new Date(item.createdAt).toLocaleString()}`);
      lines.push(`- **Page Route**: \`${item.route}\``);
      lines.push(`- **Target Element**: \`<${item.tagName.toLowerCase()}>\` (\`${item.selector}\`)`);
      lines.push(`- **Bounding Box**: \`x:${Math.round(item.rect.x)}, y:${Math.round(item.rect.y)}, ${Math.round(item.rect.width)}x${Math.round(item.rect.height)}px\``);
      if (item.textSnippet) {
        lines.push(`- **Element Content**: "${item.textSnippet.slice(0, 100)}"`);
      }
      lines.push(`- **Requested Edit / Instructions**: ${item.notes}`);
      lines.push("");
      lines.push("---");
      lines.push("");
    });

    return lines.join("\n");
  },
}));
