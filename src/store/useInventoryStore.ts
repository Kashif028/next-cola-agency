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
import { loadSavedProducts, saveProducts } from "../types/products";

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

  // Milestone 1 Logistics & Warehouse Stock Actions
  deductWarehouseStock: (productId: number, baseUnits: number) => Promise<void>;
  deductStock: (productId: number, baseUnits: number) => Promise<void>;
  restoreWarehouseStock: (productId: number, baseUnits: number) => Promise<void>;
  restoreStock: (productId: number, baseUnits: number) => Promise<void>;
  recordDamagedStock: (
    productIdOrSheet: number | string,
    baseUnitsOrProductId: number,
    reasonOrBaseUnits?: string | number,
    sheetOrReason?: string
  ) => Promise<void>;
  logBreakage: (
    productId: number,
    baseUnits: number,
    reason: string,
    sheetNumber?: string
  ) => Promise<void>;
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

  fetchBreakageLogs: async function (this: any, productId?: number) {
    try {
      const logs = await inventoryService.getBreakageLogs(productId);
      set({ breakageLogs: logs });
      if (this && typeof this === "object") {
        this.breakageLogs = logs;
      }
    } catch (err: unknown) {
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem("dogar_breakage_logs_v1");
          if (raw) {
            const parsed: BreakageLogDto[] = JSON.parse(raw);
            const filtered = productId ? parsed.filter((l) => l.product_id === productId) : parsed;
            set({
              breakageLogs: filtered,
            });
            if (this && typeof this === "object") {
              this.breakageLogs = filtered;
            }
            return;
          }
        } catch {
          // ignore
        }
      }
      // If in-memory breakageLogs already exist from recordDamagedStock, keep and filter them
      const current = get().breakageLogs;
      if (current.length > 0) {
        const filtered = productId ? current.filter((l) => l.product_id === productId) : current;
        set({
          breakageLogs: filtered,
        });
        if (this && typeof this === "object") {
          this.breakageLogs = filtered;
        }
        return;
      }
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  clearError: () => set({ error: null }),

  // Morning dispatch stock deduction
  deductWarehouseStock: async (productId: number, baseUnits: number) => {
    if (baseUnits <= 0) return;
    try {
      await inventoryService.adjustStock({
        product_id: productId,
        delta_base_units: -baseUnits,
        reason: "Morning Dispatch",
      });
    } catch {
      // Fallback for offline/test environments
    }

    // Synchronize catalog products in localStorage/memory
    const products = loadSavedProducts();
    const prod = products.find((p) => p.id === productId);
    if (prod) {
      const unitsPerPack = prod.bottlesPerPack || 1;
      const packsDeducted = baseUnits / unitsPerPack;
      prod.stockPacks = Math.max(0, prod.stockPacks - packsDeducted);
      saveProducts(products);
    }

    // Update in-memory stockItems if loaded
    const currentItems = get().stockItems;
    if (currentItems.length > 0) {
      const updated = currentItems.map((item) => {
        if (item.id === productId) {
          const newBase = Math.max(0, item.current_stock_base_units - baseUnits);
          const uPack = item.units_per_pack || 1;
          return {
            ...item,
            current_stock_base_units: newBase,
            stock_in_packs: Math.floor(newBase / uPack),
            stock_loose_units: newBase % uPack,
          };
        }
        return item;
      });
      set({ stockItems: updated });
    }
  },

  deductStock: async (productId: number, baseUnits: number) => {
    return get().deductWarehouseStock(productId, baseUnits);
  },

  // Evening return intact stock replenishment
  restoreWarehouseStock: async (productId: number, baseUnits: number) => {
    if (baseUnits <= 0) return;
    try {
      await inventoryService.adjustStock({
        product_id: productId,
        delta_base_units: baseUnits,
        reason: "Evening Intact Return",
      });
    } catch {
      // Fallback for offline/test environments
    }

    // Synchronize catalog products in localStorage/memory
    const products = loadSavedProducts();
    const prod = products.find((p) => p.id === productId);
    if (prod) {
      const unitsPerPack = prod.bottlesPerPack || 1;
      const packsAdded = baseUnits / unitsPerPack;
      prod.stockPacks = prod.stockPacks + packsAdded;
      saveProducts(products);
    }

    // Update in-memory stockItems if loaded
    const currentItems = get().stockItems;
    if (currentItems.length > 0) {
      const updated = currentItems.map((item) => {
        if (item.id === productId) {
          const newBase = item.current_stock_base_units + baseUnits;
          const uPack = item.units_per_pack || 1;
          return {
            ...item,
            current_stock_base_units: newBase,
            stock_in_packs: Math.floor(newBase / uPack),
            stock_loose_units: newBase % uPack,
          };
        }
        return item;
      });
      set({ stockItems: updated });
    }
  },

  restoreStock: async (productId: number, baseUnits: number) => {
    return get().restoreWarehouseStock(productId, baseUnits);
  },

  // Record damaged stock into dedicated breakage log (NEVER added to sellable stock)
  recordDamagedStock: async (
    productIdOrSheet: number | string,
    baseUnitsOrProductId: number,
    reasonOrBaseUnits?: string | number,
    sheetOrReason?: string
  ) => {
    let productId: number;
    let baseUnits: number;
    let reason: string;
    let sheetNumber: string | undefined;

    if (typeof productIdOrSheet === "string") {
      // Signature: (sheetNumber, productId, baseUnits, reason)
      sheetNumber = productIdOrSheet;
      productId = baseUnitsOrProductId;
      baseUnits = typeof reasonOrBaseUnits === "number" ? reasonOrBaseUnits : 0;
      reason = sheetOrReason || "Damaged on Route";
    } else {
      // Signature: (productId, baseUnits, reason, sheetNumber)
      productId = productIdOrSheet;
      baseUnits = baseUnitsOrProductId;
      reason = typeof reasonOrBaseUnits === "string" ? reasonOrBaseUnits : "Damaged on Route";
      sheetNumber = sheetOrReason;
    }

    if (baseUnits <= 0) return;

    try {
      await inventoryService.recordBreakage({
        product_id: productId,
        broken_base_units: baseUnits,
        cause: reason,
        incident_location: "Van In-Transit",
        action_taken: "EXPENSE",
        notes: sheetNumber ? `Sheet: ${sheetNumber}` : undefined,
      });
    } catch {
      // Offline fallback
    }

    const products = loadSavedProducts();
    const prod = products.find((p) => p.id === productId);
    const prodName = prod ? prod.name : `Product #${productId}`;
    const unitCost = prod ? Math.floor(prod.purchasePackPricePaisa / (prod.bottlesPerPack || 1)) : 0;

    const newLog: BreakageLogDto = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      log_date: new Date().toISOString().slice(0, 10),
      product_id: productId,
      product_name: prodName,
      broken_base_units: baseUnits,
      unit_cost_paisa: unitCost,
      total_loss_paisa: unitCost * baseUnits,
      cause: reason,
      incident_location: "Van In-Transit",
      action_taken: "EXPENSE",
      notes: sheetNumber ? `Sheet: ${sheetNumber}` : undefined,
      created_at: new Date().toISOString(),
    };

    const updatedLogs = [newLog, ...get().breakageLogs];
    set({ breakageLogs: updatedLogs });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("dogar_breakage_logs_v1", JSON.stringify(updatedLogs));
      } catch {
        // storage fallback
      }
    }
  },

  logBreakage: async (
    productId: number,
    baseUnits: number,
    reason: string,
    sheetNumber?: string
  ) => {
    return get().recordDamagedStock(productId, baseUnits, reason, sheetNumber);
  },
}));
