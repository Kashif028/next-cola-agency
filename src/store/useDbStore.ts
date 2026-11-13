import { create } from "zustand";
import { dbService } from "../services/dbService";
import {
  DbHealthReport,
  InitSchemaResult,
  BackupResult,
  RestoreResult,
} from "../types/ipc";

interface DbStoreState {
  health: DbHealthReport | null;
  latestBackup: BackupResult | null;
  lastRestore: RestoreResult | null;
  schemaInitResult: InitSchemaResult | null;
  isLoading: boolean;
  error: string | null;

  fetchHealth: () => Promise<void>;
  initDatabaseSchema: (forceReseed?: boolean) => Promise<InitSchemaResult>;
  createHotBackup: (notes?: string) => Promise<BackupResult>;
  restoreDatabase: (backupFilePath: string, adminPin: string) => Promise<RestoreResult>;
}

export const useDbStore = create<DbStoreState>((set) => ({
  health: null,
  latestBackup: null,
  lastRestore: null,
  schemaInitResult: null,
  isLoading: false,
  error: null,

  fetchHealth: async () => {
    set({ isLoading: true, error: null });
    try {
      const health = await dbService.checkDbHealth();
      set({ health, isLoading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },

  initDatabaseSchema: async (forceReseed = false) => {
    set({ isLoading: true, error: null });
    try {
      const result = await dbService.initSchema({ force_reseed: forceReseed });
      set({ schemaInitResult: result, isLoading: false });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  createHotBackup: async (notes?: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await dbService.triggerHotBackup({ notes });
      set({ latestBackup: result, isLoading: false });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  restoreDatabase: async (backupFilePath: string, adminPin: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await dbService.triggerRestore({
        backup_file_path: backupFilePath,
        admin_pin: adminPin,
      });
      set({ lastRestore: result, isLoading: false });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw err;
    }
  },
}));
