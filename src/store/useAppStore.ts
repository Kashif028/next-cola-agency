import { create } from "zustand";
import { dbService } from "../services/dbService";
import { AppSettings, UpdateAppSettingsDto } from "../types/domain";

interface AppStoreState {
  settings: AppSettings | null;
  isLoading: boolean;
  error: string | null;

  fetchSettings: () => Promise<void>;
  updateSettings: (dto: UpdateAppSettingsDto) => Promise<AppSettings>;
}

export const useAppStore = create<AppStoreState>((set) => ({
  settings: null,
  isLoading: false,
  error: null,

  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await dbService.getAppSettings();
      set({ settings, isLoading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },

  updateSettings: async (dto: UpdateAppSettingsDto) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await dbService.updateAppSettings(dto);
      set({ settings: updated, isLoading: false });
      return updated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },
}));
