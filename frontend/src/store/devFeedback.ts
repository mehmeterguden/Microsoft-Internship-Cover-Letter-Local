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
  buttonLabel?: string;
  selectedText?: string;
  locationContext?: string;
  elementHierarchy?: string;
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

    const getCategoryLabel = (cat: DevFeedbackCategory) => {
      switch (cat) {
        case "ui_layout":
          return "UI / Layout";
        case "bug_fix":
          return "Bug Fix";
        case "copy_text":
          return "Copy / Text";
        case "feature_request":
          return "Feature Request";
        default:
          return "General Feedback";
      }
    };

    const lines: string[] = [
      "# 🛠️ AI Development Task: UI Modifications & Bug Fixes",
      "",
      `> **Role Context**: You are an elite senior full-stack AI engineer. Please inspect the codebase and execute the following **${items.length} requested UI refactoring tasks** precisely as described below. Enforce all established design tokens, clean code conventions, and project worktree guidelines.`,
      "",
      "---",
      "",
      "## 📋 Task Summary Index",
      "",
      "| # | Category | Route | Screen Location | Target Element | Action / Button |",
      "|---|---|---|---|---|---|",
    ];

    items.forEach((item, i) => {
      const loc = item.locationContext || "Workspace";
      const btn = item.buttonLabel ? `"${item.buttonLabel}"` : "-";
      lines.push(
        `| ${i + 1} | **${getCategoryLabel(item.category)}** | \`${item.route}\` | \`${loc}\` | \`<${item.tagName.toLowerCase()}>\` | ${btn} |`
      );
    });

    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## 🔍 Detailed Modification Instructions");
    lines.push("");

    items.forEach((item, index) => {
      lines.push(`### Item ${index + 1}: ${getCategoryLabel(item.category)}`);
      lines.push("");
      lines.push("#### 📌 Context & Location");
      lines.push(`- **Page Route**: \`${item.route}\``);
      lines.push(`- **Screen Location**: \`${item.locationContext || "Main Workspace"}\``);
      lines.push(`- **Component Path**: \`${item.elementHierarchy || `<${item.tagName.toLowerCase()}>`}\``);
      lines.push("");
      lines.push("#### 🎯 Target Element Specifications");
      lines.push(`- **Element Tag**: \`<${item.tagName.toLowerCase()}>\``);
      lines.push(`- **CSS Selector**: \`${item.selector}\``);
      lines.push(`- **Bounding Box**: \`x:${Math.round(item.rect.x)}px, y:${Math.round(item.rect.y)}px, ${Math.round(item.rect.width)}x${Math.round(item.rect.height)}px\``);
      if (item.buttonLabel) {
        lines.push(`- **Clicked Button / Action Label**: \`"${item.buttonLabel}"\``);
      }
      if (item.textSnippet) {
        lines.push(`- **Element Content Text**: \`"${item.textSnippet.slice(0, 150)}"\``);
      }
      if (item.selectedText) {
        lines.push(`- **Active Highlighted Selection**: \`"${item.selectedText.slice(0, 150)}"\``);
      }
      lines.push("");
      lines.push("#### 💡 Requested Refactoring & User Instructions");
      lines.push(`> ${item.notes.replace(/\n/g, "\n> ")}`);
      lines.push("");
      lines.push("---");
      lines.push("");
    });

    lines.push("## ⚙️ Execution Directives");
    lines.push("1. Create an isolated worktree for these changes cut from `origin/main`.");
    lines.push("2. Verify all modifications locally using `npm run build` with zero TypeScript/lint errors.");
    lines.push("3. Commit, open PR, squash merge, and update documentation.");

    return lines.join("\n");
  },
}));
