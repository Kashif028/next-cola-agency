import { create } from "zustand";
import { inventoryService } from "../services/inventoryService";
import {
  StockItemOverviewDto,
  StockFilterDto,
  EmptiesOverviewDto,
  BreakageLogDto,
  CustomerCrateLedgerDto,
  AdjustStockDto,
  RecordCrateTransactionDto,
  RecordSecurityDepositDto,
  RefundSecurityDepositDto,
  RecordBreakageDto,
} from "../types/domain";

interface InventoryState {
  stockItems: StockItemOverviewDto[];
  emptiesOverview: EmptiesOverviewDto | null;
  breakageLogs: BreakageLogDto[];
  activeCustomerCrateLedger: CustomerCrateLedgerDto[];
  filter: StockFilterDto;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchStockOverview: (filterOverride?: StockFilterDto) => Promise<void>;
  setFilter: (partial: Partial<StockFilterDto>) => void;
  adjustStock: (dto: AdjustStockDto) => Promise<void>;
  fetchEmptiesOverview: () => Promise<void>;
  recordCrateTransaction: (dto: RecordCrateTransactionDto) => Promise<void>;
  fetchCustomerCrateLedger: (customerId: number) => Promise<void>;
  recordSecurityDeposit: (dto: RecordSecurityDepositDto) => Promise<void>;
  refundSecurityDeposit: (dto: RefundSecurityDepositDto) => Promise<void>;
  recordBreakage: (dto: RecordBreakageDto) => Promise<void>;
  fetchBreakageLogs: (productId?: number) => Promise<void>;
  clearError: () => void;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  stockItems: [],
  emptiesOverview: null,
  breakageLogs: [],
  activeCustomerCrateLedger: [],
  filter: {},
  isLoading: false,
  error: null,

  fetchStockOverview: async (filterOverride) => {
    const filter = filterOverride || get().filter;
    set({ isLoading: true, error: null });
    try {
      const items = await inventoryService.getStockOverview(filter);
      set({ stockItems: items, isLoading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },

  setFilter: (partial) => {
    const updated = { ...get().filter, ...partial };
    set({ filter: updated });
    get().fetchStockOverview(updated);
  },

  adjustStock: async (dto) => {
    set({ isLoading: true, error: null });
    try {
      await inventoryService.adjustStock(dto);
      await get().fetchStockOverview();
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
      throw err;
    }
  },

  fetchEmptiesOverview: async () => {
    try {
      const overview = await inventoryService.getEmptiesOverview();
      set({ emptiesOverview: overview });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  recordCrateTransaction: async (dto) => {
    set({ isLoading: true, error: null });
    try {
      await inventoryService.recordCrateTransaction(dto);
      await Promise.all([get().fetchEmptiesOverview(), get().fetchStockOverview()]);
      set({ isLoading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
      throw err;
    }
  },

  fetchCustomerCrateLedger: async (customerId: number) => {
    try {
      const ledger = await inventoryService.getCustomerCrateLedger(customerId);
      set({ activeCustomerCrateLedger: ledger });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  recordSecurityDeposit: async (dto) => {
    set({ isLoading: true, error: null });
    try {
      await inventoryService.recordSecurityDeposit(dto);
      await get().fetchEmptiesOverview();
      set({ isLoading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
      throw err;
    }
  },

  refundSecurityDeposit: async (dto) => {
    set({ isLoading: true, error: null });
    try {
      await inventoryService.refundSecurityDeposit(dto);
      await get().fetchEmptiesOverview();
      set({ isLoading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
      throw err;
    }
  },

  recordBreakage: async (dto) => {
    set({ isLoading: true, error: null });
    try {
      await inventoryService.recordBreakage(dto);
      await Promise.all([get().fetchStockOverview(), get().fetchBreakageLogs()]);
      set({ isLoading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
      throw err;
    }
  },

  fetchBreakageLogs: async (productId) => {
    try {
      const logs = await inventoryService.getBreakageLogs(productId);
      set({ breakageLogs: logs });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  clearError: () => set({ error: null }),
}));
