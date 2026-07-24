import { create } from "zustand";
import { getSettings, saveSettings as apiSaveSettings } from "@/api/settings";
import { checkHealth, type HealthResult } from "@/api/llm";
import type { Settings } from "@/api/types";

interface SettingsState {
  settings: Settings | null;
  health: HealthResult | null;
  loading: boolean;
  healthLoading: boolean;
  error: string | null;
  fetchSettings: () => Promise<Settings>;
  checkModelHealth: () => Promise<HealthResult | null>;
  updateSettings: (newSettings: Settings) => Promise<Settings>;
  setSettingsLocally: (newSettings: Settings) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  health: null,
  loading: false,
  healthLoading: false,
  error: null,

  fetchSettings: async () => {
    set({ loading: true });
    try {
      const data = await getSettings();
      set({ settings: data, loading: false, error: null });
      // Background health check
      void get().checkModelHealth();
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load settings";
      set({ error: msg, loading: false });
      throw err;
    }
  },

  checkModelHealth: async () => {
    set({ healthLoading: true });
    try {
      const res = await checkHealth();
      set({ health: res, healthLoading: false });
      return res;
    } catch (err: unknown) {
      const fallback: HealthResult = {
        ok: false,
        provider: get().settings?.llm_provider || "foundry_local",
        model: get().settings?.llm_model || "",
        detail: err instanceof Error ? err.message : "Unreachable",
      };
      set({ health: fallback, healthLoading: false });
      return fallback;
    }
  },

  updateSettings: async (newSettings: Settings) => {
    set({ loading: true });
    try {
      const updated = await apiSaveSettings(newSettings);
      set({ settings: updated, loading: false, error: null });
      // Re-check model health for newly saved model
      void get().checkModelHealth();
      return updated;
    } catch (err: unknown) {
      set({ loading: false });
      throw err;
    }
  },

  setSettingsLocally: (newSettings: Settings) => {
    set({ settings: newSettings });
  },
}));
