// src/store/useLogisticsStore.ts
import { create } from "zustand";
import { logisticsService } from "../services/logisticsService";
import { useInventoryStore } from "./useInventoryStore";
import {
  KhataTransaction,
  loadSavedKhataAccounts,
  saveKhataAccounts,
  loadSavedKhataTransactions,
  saveKhataTransactions,
} from "../types/khata";
import { loadSavedProducts } from "../types/products";
import {
  RouteDto,
  VehicleDto,
  LoadingSheetSummaryDto,
  LoadingSheetDetailDto,
  SettlementReconciliationDto,
  CreateLoadingSheetDto,
  IssueLoadingSheetDto,
  SubmitVanSettlementDto,
  LoadingSheetFilterDto,
  DailyDispatchRecord,
  DispatchLineItem,
  RecalibrateSheetPayload,
} from "../types/logistics";

const STORAGE_DAILY_DISPATCHES = "dogar_daily_dispatches_v1";

export const INITIAL_DAILY_DISPATCHES: DailyDispatchRecord[] = [
  {
    id: 1,
    sheetNumber: "LOAD-20261110-0001",
    date: "2026-11-10",
    routeId: 1,
    routeName: "City Center & Shahi Bazaar",
    salesmanId: 5,
    salesmanName: "Muhammad Ali",
    salesmanKhataId: 5,
    vehicleNumber: "LES-2489",
    status: "ISSUED",
    emptyCratesLoaded: 30,
    emptyCratesReturned: 0,
    items: [
      {
        productId: 1,
        productSku: "NC-250-RGB",
        productName: "Next Cola 250ml Glass Bottle",
        packName: "Crate",
        unitsPerPack: 24,
        wholesalePackPricePaisa: 216000,
        isGlass: true,
        dispatchedPacks: 50,
        dispatchedLoose: 0,
        totalDispatchedBase: 1200,
        soldPacks: 0,
        soldLoose: 0,
        totalSoldBase: 0,
        returnedIntactPacks: 0,
        returnedIntactLoose: 0,
        totalReturnedIntactBase: 0,
        damagedPacks: 0,
        damagedLoose: 0,
        totalDamagedBase: 0,
        lineRevenuePaisa: 0,
      },
      {
        productId: 2,
        productSku: "NC-1.5-PET",
        productName: "Next Cola 1.5L PET Bottle",
        packName: "Pack",
        unitsPerPack: 6,
        wholesalePackPricePaisa: 105000,
        isGlass: false,
        dispatchedPacks: 40,
        dispatchedLoose: 0,
        totalDispatchedBase: 240,
        soldPacks: 0,
        soldLoose: 0,
        totalSoldBase: 0,
        returnedIntactPacks: 0,
        returnedIntactLoose: 0,
        totalReturnedIntactBase: 0,
        damagedPacks: 0,
        damagedLoose: 0,
        totalDamagedBase: 0,
        lineRevenuePaisa: 0,
      },
    ],
    totalSalesRevenuePaisa: 0,
    cashDepositedPaisa: 0,
    unpaidBalancePaisa: 0,
    createdAt: "2026-11-10T08:15:00Z",
    updatedAt: "2026-11-10T08:15:00Z",
  },
  {
    id: 2,
    sheetNumber: "LOAD-20261110-0002",
    date: "2026-11-10",
    routeId: 2,
    routeName: "Khanpur Road Wholesale Beat",
    salesmanId: 6,
    salesmanName: "Rashid Mahmood",
    salesmanKhataId: 6,
    vehicleNumber: "RYK-8192",
    status: "SETTLED",
    emptyCratesLoaded: 50,
    emptyCratesReturned: 50,
    items: [
      {
        productId: 1,
        productSku: "NC-250-RGB",
        productName: "Next Cola 250ml Glass Bottle",
        packName: "Crate",
        unitsPerPack: 24,
        wholesalePackPricePaisa: 216000,
        isGlass: true,
        dispatchedPacks: 100,
        dispatchedLoose: 0,
        totalDispatchedBase: 2400,
        soldPacks: 80,
        soldLoose: 0,
        totalSoldBase: 1920,
        returnedIntactPacks: 20,
        returnedIntactLoose: 0,
        totalReturnedIntactBase: 480,
        damagedPacks: 0,
        damagedLoose: 0,
        totalDamagedBase: 0,
        lineRevenuePaisa: 17280000,
      },
    ],
    totalSalesRevenuePaisa: 17280000,
    cashDepositedPaisa: 17280000,
    unpaidBalancePaisa: 0,
    createdAt: "2026-11-10T08:30:00Z",
    updatedAt: "2026-11-10T18:00:00Z",
  },
];

export function loadSavedDailyDispatches(): DailyDispatchRecord[] {
  if (typeof window === "undefined") return INITIAL_DAILY_DISPATCHES;
  try {
    const raw = localStorage.getItem(STORAGE_DAILY_DISPATCHES);
    if (raw) {
      const records: DailyDispatchRecord[] = JSON.parse(raw);
      if (Array.isArray(records) && records.length > 0) return records;
    }
  } catch {
    // fallback
  }
  return INITIAL_DAILY_DISPATCHES;
}

export function saveDailyDispatches(records: DailyDispatchRecord[]): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_DAILY_DISPATCHES, JSON.stringify(records));
    } catch {
      // storage error
    }
  }
}

function dispatchRecordToSummaryDto(record: DailyDispatchRecord): LoadingSheetSummaryDto {
  return {
    id: record.id,
    sheet_number: record.sheetNumber,
    sheet_date: record.date,
    route_id: record.routeId,
    route_name: record.routeName,
    vehicle_number: record.vehicleNumber,
    driver_name: record.salesmanName,
    status: record.status,
    total_items_count: record.items.length,
    total_loaded_base: record.items.reduce((acc, it) => acc + (it.totalDispatchedBase || 0), 0),
    empty_crates_loaded: record.emptyCratesLoaded,
    total_load_retail_paisa: record.totalSalesRevenuePaisa,
    dispatched_at: record.createdAt,
  };
}

function dispatchRecordToDetailDto(record: DailyDispatchRecord): LoadingSheetDetailDto {
  return {
    id: record.id,
    sheet_number: record.sheetNumber,
    sheet_date: record.date,
    route_id: record.routeId,
    route_name: record.routeName,
    route_code: `R-0${record.routeId}`,
    vehicle_id: 1,
    vehicle_number: record.vehicleNumber,
    driver_id: record.salesmanId,
    driver_name: record.salesmanName,
    status: record.status,
    empty_crates_loaded: record.emptyCratesLoaded,
    empty_crates_returned: record.emptyCratesReturned,
    total_load_cost_paisa: 0,
    total_load_retail_paisa: record.totalSalesRevenuePaisa,
    expected_cash_paisa: record.totalSalesRevenuePaisa,
    actual_cash_paisa: record.cashDepositedPaisa,
    cash_variance_paisa: 0,
    empty_crates_expected: record.emptyCratesLoaded,
    crates_variance: record.emptyCratesReturned - record.emptyCratesLoaded,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    salesman_id: record.salesmanId,
    salesman_name: record.salesmanName,
    salesman_khata_id: record.salesmanKhataId,
    total_sales_revenue_paisa: record.totalSalesRevenuePaisa,
    cash_deposited_paisa: record.cashDepositedPaisa,
    unpaid_balance_paisa: record.unpaidBalancePaisa,
    khata_transaction_id: record.khataTransactionId,
    items: record.items.map((it, idx) => ({
      id: idx + 1,
      sheet_id: record.id,
      product_id: it.productId,
      product_sku: it.productSku,
      product_name: it.productName,
      pack_unit_name: it.packName,
      base_unit_name: "Bottle",
      units_per_pack: it.unitsPerPack,
      loaded_packs: it.dispatchedPacks,
      loaded_loose: it.dispatchedLoose,
      total_loaded_base: it.totalDispatchedBase,
      unit_cost_paisa: 0,
      unit_price_paisa: it.wholesalePackPricePaisa,
      unit_wholesale_price_paisa: Math.round(it.wholesalePackPricePaisa / (it.unitsPerPack || 1)),
      line_cost_paisa: 0,
      line_retail_paisa: it.lineRevenuePaisa,
      line_revenue_paisa: it.lineRevenuePaisa,
      line_wholesale_revenue_paisa: it.lineRevenuePaisa,
      sold_base: it.totalSoldBase,
      sold_packs: it.soldPacks,
      sold_loose: it.soldLoose,
      returned_packs: it.returnedIntactPacks,
      returned_loose: it.returnedIntactLoose,
      total_returned_base: it.totalReturnedIntactBase,
      breakage_base: it.totalDamagedBase,
      damaged_packs: it.damagedPacks,
      damaged_loose: it.damagedLoose,
      damaged_base: it.totalDamagedBase,
      variance_base: 0,
    })),
  };
}

interface LogisticsState {
  // Catalogs
  routes: RouteDto[];
  vehicles: VehicleDto[];
  loadingSheets: LoadingSheetSummaryDto[];
  selectedSheetDetail: LoadingSheetDetailDto | null;
  activeReconciliation: SettlementReconciliationDto | null;
  dailyDispatches: DailyDispatchRecord[];

  // Filter & Search
  filter: LoadingSheetFilterDto;
  searchQuery: string;

  // UI Modal Controls
  isRouteModalOpen: boolean;
  isVehicleModalOpen: boolean;
  isLoadingManifestModalOpen: boolean;
  isSettlementModalOpen: boolean;
  isGatePassModalOpen: boolean;

  // Editing Entities
  editingRoute: RouteDto | null;
  editingVehicle: VehicleDto | null;

  // Settlement Scratchpad State
  settlementSheetId: number | null;
  closingKm: number;
  physicalReturns: Record<number, { packs: number; loose: number; breakage: number; notes: string }>;
  physicalCashPaisa: number;
  emptyCratesReturned: number;
  routeExpensesPaisa: number;
  shortageAction: "CHARGE_DRIVER" | "EXPENSE_WAIVER";
  supervisorPin: string;
  settlementNotes: string;

  // Status
  isLoading: boolean;
  isCalculating: boolean;
  error: string | null;
  successMessage: string | null;

  // Actions
  fetchInitialData: () => Promise<void>;
  fetchRoutes: () => Promise<void>;
  fetchVehicles: () => Promise<void>;
  fetchLoadingSheets: (filter?: LoadingSheetFilterDto) => Promise<void>;
  fetchSheetDetail: (sheetId: number) => Promise<LoadingSheetDetailDto>;
  fetchDailyDispatches: () => Promise<DailyDispatchRecord[]>;
  getDailyDispatchById: (id: number) => DailyDispatchRecord | undefined;
  getDailyDispatchBySheetNumber: (sheetNumber: string) => DailyDispatchRecord | undefined;

  // Manifest Actions
  openCreateManifestModal: () => void;
  closeCreateManifestModal: () => void;
  createManifestDraft: (dto: CreateLoadingSheetDto) => Promise<LoadingSheetDetailDto>;
  issueManifestDispatch: (dto: IssueLoadingSheetDto) => Promise<void>;

  // Direct Unified Dispatch Actions
  createDailyDispatch: (record: Omit<DailyDispatchRecord, "id" | "createdAt" | "updatedAt">) => Promise<DailyDispatchRecord>;
  confirmMorningDispatch: (sheetIdOrNumber: number | string) => Promise<DailyDispatchRecord>;
  confirmEveningReturn: (
    sheetIdOrNumber: number | string,
    returns: Array<{
      productId: number;
      returnedIntactPacks?: number;
      returnedIntactLoose?: number;
      returnedIntactBase?: number;
      damagedPacks?: number;
      damagedLoose?: number;
      damagedBase?: number;
      breakage_base?: number;
    }>,
    cashDepositedPaisa?: number,
    notes?: string
  ) => Promise<DailyDispatchRecord>;

  // Multi-Edit Engine
  recalibrateDispatchSheet: (payload: RecalibrateSheetPayload) => Promise<DailyDispatchRecord>;
  recalibrateSheet: (payload: RecalibrateSheetPayload) => Promise<DailyDispatchRecord>;
  recalibrateSheetSnapshot: (payload: RecalibrateSheetPayload) => Promise<DailyDispatchRecord>;
  editDailyDispatch: (payload: RecalibrateSheetPayload) => Promise<DailyDispatchRecord>;

  // Khata Synchronization
  syncSalesmanKhataDebit: (salesmanAccountId: number, sheetNumber: string, amountPaisa: number, date?: string) => void;
  recalibrateSalesmanKhata: (salesmanAccountId: number, sheetNumber: string, newAmountPaisa: number, date?: string) => void;

  // Settlement Actions
  openSettlementModal: (sheetId: number) => Promise<void>;
  closeSettlementModal: () => void;
  updateReturnLine: (productId: number, field: "packs" | "loose" | "breakage", value: number) => void;
  updateSettlementFinancials: (
    cashPaisa: number,
    cratesReturned: number,
    expensesPaisa: number,
    closingKm?: number
  ) => void;
  recalculateSettlement: () => Promise<void>;
  submitSettlement: () => Promise<void>;

  // Modals & Search
  openRouteModal: (route?: RouteDto) => void;
  closeRouteModal: () => void;
  openVehicleModal: (vehicle?: VehicleDto) => void;
  closeVehicleModal: () => void;
  openGatePassModal: (sheetId: number) => Promise<void>;
  closeGatePassModal: () => void;
  setSearchQuery: (q: string) => void;
  setFilter: (f: LoadingSheetFilterDto) => void;
  setShortageAction: (action: "CHARGE_DRIVER" | "EXPENSE_WAIVER") => void;
  setSupervisorPin: (pin: string) => void;
  setSettlementNotes: (notes: string) => void;
  clearError: () => void;
}

export const useLogisticsStore = create<LogisticsState>((set, get) => ({
  routes: [],
  vehicles: [],
  loadingSheets: loadSavedDailyDispatches().map(dispatchRecordToSummaryDto),
  dailyDispatches: loadSavedDailyDispatches(),
  selectedSheetDetail: null,
  activeReconciliation: null,

  filter: {},
  searchQuery: "",

  isRouteModalOpen: false,
  isVehicleModalOpen: false,
  isLoadingManifestModalOpen: false,
  isSettlementModalOpen: false,
  isGatePassModalOpen: false,

  editingRoute: null,
  editingVehicle: null,

  settlementSheetId: null,
  closingKm: 0,
  physicalReturns: {},
  physicalCashPaisa: 0,
  emptyCratesReturned: 0,
  routeExpensesPaisa: 0,
  shortageAction: "CHARGE_DRIVER",
  supervisorPin: "",
  settlementNotes: "",

  isLoading: false,
  isCalculating: false,
  error: null,
  successMessage: null,

  fetchInitialData: async () => {
    set({ isLoading: true, error: null });
    try {
      const [routes, vehicles, sheets] = await Promise.all([
        logisticsService.getRoutes(),
        logisticsService.getVehicles(),
        logisticsService.listLoadingSheets(),
      ]);
      const dispatches = loadSavedDailyDispatches();
      const dispatchSummaries = dispatches.map(dispatchRecordToSummaryDto);
      // Merge unique summaries
      const existingIds = new Set(dispatchSummaries.map((s) => s.id));
      const combinedSheets = [
        ...dispatchSummaries,
        ...sheets.filter((s) => !existingIds.has(s.id)),
      ];
      set({ routes, vehicles, loadingSheets: combinedSheets, dailyDispatches: dispatches, isLoading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },

  fetchRoutes: async () => {
    try {
      const routes = await logisticsService.getRoutes();
      set({ routes });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  fetchVehicles: async () => {
    try {
      const vehicles = await logisticsService.getVehicles();
      set({ vehicles });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  fetchLoadingSheets: async (filter) => {
    set({ isLoading: true });
    try {
      const sheets = await logisticsService.listLoadingSheets(filter || get().filter);
      const dispatches = loadSavedDailyDispatches();
      const dispatchSummaries = dispatches.map(dispatchRecordToSummaryDto);
      const existingIds = new Set(dispatchSummaries.map((s) => s.id));
      const combined = [
        ...dispatchSummaries,
        ...sheets.filter((s) => !existingIds.has(s.id)),
      ];
      set({ loadingSheets: combined, dailyDispatches: dispatches, isLoading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },

  fetchDailyDispatches: async () => {
    const dispatches = loadSavedDailyDispatches();
    set({ dailyDispatches: dispatches });
    return dispatches;
  },

  getDailyDispatchById: (id: number) => {
    return get().dailyDispatches.find((d) => d.id === id);
  },

  getDailyDispatchBySheetNumber: (sheetNumber: string) => {
    return get().dailyDispatches.find((d) => d.sheetNumber === sheetNumber);
  },

  fetchSheetDetail: async (sheetId: number) => {
    // If present in dailyDispatches, convert to detail DTO
    const dispatch = get().dailyDispatches.find((d) => d.id === sheetId);
    if (dispatch) {
      const detail = dispatchRecordToDetailDto(dispatch);
      set({ selectedSheetDetail: detail });
      return detail;
    }
    const detail = await logisticsService.getLoadingSheet(sheetId);
    set({ selectedSheetDetail: detail });
    return detail;
  },

  openCreateManifestModal: () => {
    // Zero quantity leakage: ensure clean slate on modal open
    set({
      isLoadingManifestModalOpen: true,
      error: null,
      successMessage: null,
    });
  },

  closeCreateManifestModal: () => {
    set({ isLoadingManifestModalOpen: false });
  },

  createManifestDraft: async (dto: CreateLoadingSheetDto) => {
    set({ isLoading: true, error: null });
    try {
      // Zero leakage: filter out unentered or 0-quantity items
      const sanitizedItems = dto.items.filter(
        (it) => (Number(it.pack_qty) || 0) > 0 || (Number(it.loose_qty) || 0) > 0
      );
      const sanitizedDto = { ...dto, items: sanitizedItems };

      const detail = await logisticsService.createLoadingSheet(sanitizedDto);
      const allProducts = loadSavedProducts();

      // Resolve salesman ID & Name
      const route = get().routes.find((r) => r.id === dto.route_id);
      const vehicle = get().vehicles.find((v) => v.id === dto.vehicle_id);
      const salesmanName = dto.driver_name || route?.default_driver_name || "Muhammad Ali";
      const salesmanId = dto.driver_id || 5;

      const lineItems: DispatchLineItem[] = sanitizedItems.map((it) => {
        const prod = allProducts.find((p) => p.id === it.product_id);
        const unitsPerPack = prod?.bottlesPerPack || 1;
        const totalBase = it.pack_qty * unitsPerPack + it.loose_qty;
        const wholesalePackPricePaisa = prod?.wholesalePackPricePaisa || 0;
        return {
          productId: it.product_id,
          productSku: prod?.sku || `SKU-${it.product_id}`,
          productName: prod?.name || `Product #${it.product_id}`,
          packName: prod?.requiresCrate ? "Crate" : "Pack",
          unitsPerPack,
          wholesalePackPricePaisa,
          isGlass: prod?.requiresCrate || false,
          dispatchedPacks: it.pack_qty,
          dispatchedLoose: it.loose_qty,
          totalDispatchedBase: totalBase,
          soldPacks: 0,
          soldLoose: 0,
          totalSoldBase: 0,
          returnedIntactPacks: 0,
          returnedIntactLoose: 0,
          totalReturnedIntactBase: 0,
          damagedPacks: 0,
          damagedLoose: 0,
          totalDamagedBase: 0,
          lineRevenuePaisa: 0,
        };
      });

      const newDispatch: DailyDispatchRecord = {
        id: detail.id,
        sheetNumber: detail.sheet_number,
        date: dto.sheet_date || new Date().toISOString().slice(0, 10),
        routeId: dto.route_id,
        routeName: route?.route_name || detail.route_name || "City Beat",
        salesmanId,
        salesmanName,
        salesmanKhataId: salesmanId,
        vehicleNumber: dto.vehicle_number || vehicle?.vehicle_number || detail.vehicle_number || "LES-2489",
        status: "DRAFT",
        emptyCratesLoaded: dto.empty_crates_loaded || 0,
        emptyCratesReturned: 0,
        items: lineItems,
        totalSalesRevenuePaisa: 0,
        cashDepositedPaisa: 0,
        unpaidBalancePaisa: 0,
        notes: dto.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updatedDispatches = [newDispatch, ...get().dailyDispatches];
      saveDailyDispatches(updatedDispatches);

      const summary = dispatchRecordToSummaryDto(newDispatch);
      const updatedSummaries = [summary, ...get().loadingSheets.filter((s) => s.id !== detail.id)];

      set({
        dailyDispatches: updatedDispatches,
        loadingSheets: updatedSummaries,
        selectedSheetDetail: detail,
        isLoading: false,
        isLoadingManifestModalOpen: false,
        successMessage: `Loading sheet ${detail.sheet_number} created as DRAFT`,
      });

      return detail;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, isLoading: false });
      throw new Error(msg);
    }
  },

  issueManifestDispatch: async (dto: IssueLoadingSheetDto) => {
    set({ isLoading: true, error: null });
    try {
      const result = await logisticsService.issueLoadingSheet(dto);
      const dispatches = get().dailyDispatches;
      const target = dispatches.find((d) => d.id === dto.sheet_id);

      if (target) {
        // Morning stock deduction for all items on the dispatch sheet
        for (const item of target.items) {
          const baseUnits = item.totalDispatchedBase || (item.dispatchedPacks * item.unitsPerPack + item.dispatchedLoose);
          if (baseUnits > 0) {
            await useInventoryStore.getState().deductWarehouseStock(item.productId, baseUnits);
          }
        }
        target.status = "ISSUED";
        target.updatedAt = new Date().toISOString();
        saveDailyDispatches(dispatches);
      }

      set({
        isLoading: false,
        isLoadingManifestModalOpen: false,
        successMessage: `Sheet ${result.sheet_number} dispatched! Warehouse stock deducted.`,
      });
      await get().fetchLoadingSheets();
      get().openGatePassModal(dto.sheet_id);
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },

  createDailyDispatch: async (recordData) => {
    const dispatches = get().dailyDispatches;
    const newId = Date.now();
    const sheetNum = recordData.sheetNumber || `LOAD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(dispatches.length + 1).padStart(4, "0")}`;

    // Filter items with zero quantities
    const nonZeroItems = recordData.items.filter(
      (it) => it.dispatchedPacks > 0 || it.dispatchedLoose > 0
    );

    const newRecord: DailyDispatchRecord = {
      ...recordData,
      id: newId,
      sheetNumber: sheetNum,
      items: nonZeroItems,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // If created directly in OPEN or ISSUED state, deduct morning warehouse stock immediately
    if (newRecord.status === "OPEN" || newRecord.status === "ISSUED") {
      for (const item of newRecord.items) {
        const baseUnits = item.totalDispatchedBase || (item.dispatchedPacks * item.unitsPerPack + item.dispatchedLoose);
        if (baseUnits > 0) {
          await useInventoryStore.getState().deductWarehouseStock(item.productId, baseUnits);
        }
      }
    }

    const updatedDispatches = [newRecord, ...dispatches];
    saveDailyDispatches(updatedDispatches);

    const summary = dispatchRecordToSummaryDto(newRecord);
    set({
      dailyDispatches: updatedDispatches,
      loadingSheets: [summary, ...get().loadingSheets],
    });

    return newRecord;
  },

  confirmMorningDispatch: async (sheetIdOrNumber: number | string) => {
    const dispatches = get().dailyDispatches;
    const record = dispatches.find(
      (d) => d.id === sheetIdOrNumber || d.sheetNumber === String(sheetIdOrNumber)
    );
    if (!record) {
      throw new Error(`Dispatch record not found: ${sheetIdOrNumber}`);
    }

    if (record.status === "DRAFT") {
      // Deduct warehouse stock for morning dispatch
      for (const item of record.items) {
        const baseUnits = item.totalDispatchedBase || (item.dispatchedPacks * item.unitsPerPack + item.dispatchedLoose);
        if (baseUnits > 0) {
          await useInventoryStore.getState().deductWarehouseStock(item.productId, baseUnits);
        }
      }
      record.status = "ISSUED";
      record.updatedAt = new Date().toISOString();
      saveDailyDispatches(dispatches);

      const summary = dispatchRecordToSummaryDto(record);
      set({
        dailyDispatches: [...dispatches],
        loadingSheets: get().loadingSheets.map((s) => (s.id === record.id ? summary : s)),
      });
    }

    return record;
  },

  confirmEveningReturn: async (sheetIdOrNumber, returns, cashDepositedPaisa = 0, notes) => {
    const dispatches = get().dailyDispatches;
    const record = dispatches.find(
      (d) => d.id === sheetIdOrNumber || d.sheetNumber === String(sheetIdOrNumber)
    );
    if (!record) {
      throw new Error(`Dispatch record not found: ${sheetIdOrNumber}`);
    }

    let grossRevenuePaisa = 0;

    for (const item of record.items) {
      const ret = returns.find((r) => r.productId === item.productId);
      const unitsPerPack = item.unitsPerPack || 1;
      const intactBase =
        ret?.returnedIntactBase !== undefined
          ? ret.returnedIntactBase
          : (ret?.returnedIntactPacks || 0) * unitsPerPack + (ret?.returnedIntactLoose || 0);

      const damagedBase =
        ret?.damagedBase !== undefined
          ? ret.damagedBase
          : (ret?.damagedPacks || 0) * unitsPerPack + (ret?.damagedLoose || 0) + (ret?.breakage_base || 0);

      // Evening return: replenish intact stock into warehouse
      if (intactBase > 0) {
        await useInventoryStore.getState().restoreWarehouseStock(item.productId, intactBase);
      }

      // Log damaged stock into dedicated breakage log (never sellable stock)
      if (damagedBase > 0) {
        await useInventoryStore
          .getState()
          .recordDamagedStock(record.sheetNumber, item.productId, damagedBase, "Evening Return Damaged Stock");
      }

      const dispatchedBase = item.totalDispatchedBase || (item.dispatchedPacks * unitsPerPack + item.dispatchedLoose);
      const soldBase = Math.max(0, dispatchedBase - intactBase - damagedBase);
      const unitPrice = Math.round((item.wholesalePackPricePaisa || 0) / unitsPerPack);
      const lineRevenue = soldBase * unitPrice;

      item.returnedIntactPacks = ret?.returnedIntactPacks || Math.floor(intactBase / unitsPerPack);
      item.returnedIntactLoose = ret?.returnedIntactLoose || intactBase % unitsPerPack;
      item.totalReturnedIntactBase = intactBase;

      item.damagedPacks = ret?.damagedPacks || Math.floor(damagedBase / unitsPerPack);
      item.damagedLoose = ret?.damagedLoose || damagedBase % unitsPerPack;
      item.totalDamagedBase = damagedBase;

      item.soldPacks = Math.floor(soldBase / unitsPerPack);
      item.soldLoose = soldBase % unitsPerPack;
      item.totalSoldBase = soldBase;
      item.lineRevenuePaisa = lineRevenue;

      grossRevenuePaisa += lineRevenue;
    }

    record.totalSalesRevenuePaisa = grossRevenuePaisa;
    record.cashDepositedPaisa = cashDepositedPaisa;
    const unpaidBalance = Math.max(0, grossRevenuePaisa - cashDepositedPaisa);
    record.unpaidBalancePaisa = unpaidBalance;
    record.status = "SETTLED";
    if (notes) record.notes = notes;
    record.updatedAt = new Date().toISOString();

    // Salesman Khata Ledger Posting
    if (unpaidBalance > 0) {
      const salesmanAccId = record.salesmanKhataId || record.salesmanId || 5;
      get().recalibrateSalesmanKhata(salesmanAccId, record.sheetNumber, unpaidBalance, record.date);
    } else {
      const salesmanAccId = record.salesmanKhataId || record.salesmanId || 5;
      get().recalibrateSalesmanKhata(salesmanAccId, record.sheetNumber, 0, record.date);
    }

    saveDailyDispatches(dispatches);
    const summary = dispatchRecordToSummaryDto(record);
    set({
      dailyDispatches: [...dispatches],
      loadingSheets: get().loadingSheets.map((s) => (s.id === record.id ? summary : s)),
    });

    return record;
  },

  // Snapshot Rollback & Re-apply Algorithm for Multi-Edit Persistence
  recalibrateDispatchSheet: async (payload: RecalibrateSheetPayload) => {
    const dispatches = get().dailyDispatches;
    let oldRecord = dispatches.find(
      (d) => d.id === payload.sheetId || d.id === Number(payload.sheetId) || d.sheetNumber === String(payload.sheetId)
    );

    if (!oldRecord) {
      // Check in loadingSheets / default
      oldRecord = INITIAL_DAILY_DISPATCHES.find(
        (d) => d.id === payload.sheetId || d.id === Number(payload.sheetId) || d.sheetNumber === String(payload.sheetId)
      );
      if (!oldRecord) {
        throw new Error(`Sheet ID ${payload.sheetId} not found for recalibration`);
      }
    }

    // 1. Revert previous net stock deduction
    if (oldRecord.status !== "DRAFT") {
      for (const item of oldRecord.items) {
        const oldDispatched = item.totalDispatchedBase ?? (item.dispatchedPacks * item.unitsPerPack + item.dispatchedLoose);
        const oldReturnedIntact = item.totalReturnedIntactBase ?? (item.returnedIntactPacks * item.unitsPerPack + item.returnedIntactLoose);
        const oldNetOut = oldDispatched - oldReturnedIntact;
        if (oldNetOut > 0) {
          await useInventoryStore.getState().restoreWarehouseStock(item.productId, oldNetOut);
        } else if (oldNetOut < 0) {
          await useInventoryStore.getState().deductWarehouseStock(item.productId, Math.abs(oldNetOut));
        }
      }
    }

    // 2. Revert previous khata transaction for this sheet if any
    let accounts = loadSavedKhataAccounts();
    let transactions = loadSavedKhataTransactions();
    const sheetRef = oldRecord.sheetNumber;
    const oldKhataTxId = oldRecord.khataTransactionId;
    transactions = transactions.filter(
      (t) => !(t.referenceNo === sheetRef || (oldKhataTxId && t.id === oldKhataTxId))
    );

    // 3. Apply new net stock deduction & log damages
    const allProducts = loadSavedProducts();
    const newStatus = payload.status || oldRecord.status;
    const updatedItems: DispatchLineItem[] = [];
    let totalRevenuePaisa = 0;

    for (const itemPayload of payload.items) {
      const prod = allProducts.find((p) => p.id === itemPayload.productId);
      const unitsPerPack = itemPayload.unitsPerPack || prod?.bottlesPerPack || 1;
      const wholesalePackPricePaisa =
        itemPayload.wholesalePackPricePaisa !== undefined
          ? itemPayload.wholesalePackPricePaisa
          : prod?.wholesalePackPricePaisa || 0;
      const unitWholesalePrice = Math.round(wholesalePackPricePaisa / unitsPerPack);

      const newDispatchedBase =
        (itemPayload.dispatchedPacks || 0) * unitsPerPack + (itemPayload.dispatchedLoose || 0);
      const newReturnedIntactBase =
        (itemPayload.returnedIntactPacks || 0) * unitsPerPack + (itemPayload.returnedIntactLoose || 0);
      const newDamagedBase =
        (itemPayload.damagedPacks || 0) * unitsPerPack + (itemPayload.damagedLoose || 0);

      const newNetOut = newDispatchedBase - newReturnedIntactBase;

      // Stock deduction applied only if not draft
      if (newStatus !== "DRAFT") {
        if (newNetOut > 0) {
          await useInventoryStore.getState().deductWarehouseStock(itemPayload.productId, newNetOut);
        } else if (newNetOut < 0) {
          await useInventoryStore.getState().restoreWarehouseStock(itemPayload.productId, Math.abs(newNetOut));
        }
      }

      // 4. Log new damaged quantities to breakage log (ensuring broken stock is never returned to sellable stock)
      const oldItem = oldRecord.items.find((it) => it.productId === itemPayload.productId);
      const oldDamagedBase = oldItem
        ? oldItem.totalDamagedBase ?? (oldItem.damagedPacks * oldItem.unitsPerPack + oldItem.damagedLoose)
        : 0;
      if (newDamagedBase > oldDamagedBase) {
        const additionalDamaged = newDamagedBase - oldDamagedBase;
        await useInventoryStore
          .getState()
          .recordDamagedStock(
            oldRecord.sheetNumber,
            itemPayload.productId,
            additionalDamaged,
            "Multi-Edit Damage Adjustment"
          );
      }

      // 5. Calculate total revenue: sum of soldBase * unitWholesalePrice
      const soldBase = Math.max(0, newDispatchedBase - newReturnedIntactBase - newDamagedBase);
      const soldPacks = Math.floor(soldBase / unitsPerPack);
      const soldLoose = soldBase % unitsPerPack;
      const lineRevenuePaisa = soldBase * unitWholesalePrice;
      totalRevenuePaisa += lineRevenuePaisa;

      updatedItems.push({
        productId: itemPayload.productId,
        productSku: prod?.sku || `SKU-${itemPayload.productId}`,
        productName: prod?.name || `Product #${itemPayload.productId}`,
        packName: prod?.requiresCrate ? "Crate" : "Pack",
        unitsPerPack,
        wholesalePackPricePaisa,
        isGlass: prod?.requiresCrate || false,
        dispatchedPacks: itemPayload.dispatchedPacks,
        dispatchedLoose: itemPayload.dispatchedLoose,
        totalDispatchedBase: newDispatchedBase,
        soldPacks,
        soldLoose,
        totalSoldBase: soldBase,
        returnedIntactPacks: itemPayload.returnedIntactPacks,
        returnedIntactLoose: itemPayload.returnedIntactLoose,
        totalReturnedIntactBase: newReturnedIntactBase,
        damagedPacks: itemPayload.damagedPacks,
        damagedLoose: itemPayload.damagedLoose,
        totalDamagedBase: newDamagedBase,
        lineRevenuePaisa,
      });
    }

    // 6. Calculate unpaid balance
    const cashDeposited =
      payload.cashDepositedPaisa !== undefined
        ? payload.cashDepositedPaisa
        : oldRecord.cashDepositedPaisa;
    const isSettledState = newStatus === "SETTLED" || newStatus === "FINALIZED";
    const unpaidBalancePaisa = isSettledState ? Math.max(0, totalRevenuePaisa - cashDeposited) : 0;

    // 7. Post or update DEBIT transaction to salesman's khata account
    let newKhataTxId: number | undefined = undefined;
    const salesmanAccountId =
      payload.salesmanKhataId || oldRecord.salesmanKhataId || oldRecord.salesmanId || 5;

    let salesmanAccount = accounts.find((a) => a.id === salesmanAccountId);
    if (!salesmanAccount && oldRecord.salesmanName) {
      salesmanAccount = accounts.find(
        (a) =>
          a.category === "SALESMAN" &&
          a.holderName.toLowerCase().includes(oldRecord!.salesmanName.toLowerCase())
      );
    }
    if (!salesmanAccount) {
      salesmanAccount = accounts.find((a) => a.category === "SALESMAN");
    }

    if (salesmanAccount) {
      if (unpaidBalancePaisa > 0) {
        const unpaidRupees = unpaidBalancePaisa / 100;
        const nextTxId = transactions.length > 0 ? Math.max(...transactions.map((t) => t.id)) + 1 : 1;
        const newTx: KhataTransaction = {
          id: nextTxId,
          accountId: salesmanAccount.id,
          accountName: `${salesmanAccount.holderName} (${salesmanAccount.shopName})`,
          transactionDate: oldRecord.date || new Date().toISOString().slice(0, 10),
          transactionType: "DEBIT",
          amount: unpaidRupees,
          paymentReceived: 0,
          paymentGiven: 0,
          description: `Unpaid van route sales on Sheet ${oldRecord.sheetNumber}`,
          previousBalance: 0,
          newBalance: 0,
          referenceNo: oldRecord.sheetNumber,
          createdAt: new Date().toISOString(),
        };
        transactions.push(newTx);
        newKhataTxId = nextTxId;
      }

      // 8. Recalculate salesman khata running balance from ground-truth opening balance
      const accountTxs = transactions.filter((t) => t.accountId === salesmanAccount!.id);
      accountTxs.sort((a, b) => a.id - b.id);
      let running = salesmanAccount.openingBalance;
      for (const tx of accountTxs) {
        tx.previousBalance = running;
        if (tx.transactionType === "DEBIT") {
          running += tx.amount;
        } else if (tx.transactionType === "CREDIT") {
          running -= tx.amount;
        }
        tx.newBalance = running;
      }
      salesmanAccount.currentBalance = running;
      salesmanAccount.updatedAt = new Date().toISOString();

      accounts = accounts.map((a) => (a.id === salesmanAccount!.id ? salesmanAccount! : a));
      saveKhataAccounts(accounts);
      saveKhataTransactions(transactions);
    }

    // 9. Update sheet record with new status, totals, and values
    const updatedRecord: DailyDispatchRecord = {
      ...oldRecord,
      status: newStatus,
      items: updatedItems,
      totalSalesRevenuePaisa: totalRevenuePaisa,
      cashDepositedPaisa: cashDeposited,
      unpaidBalancePaisa,
      khataTransactionId: newKhataTxId,
      notes: payload.notes !== undefined ? payload.notes : oldRecord.notes,
      updatedAt: new Date().toISOString(),
    };

    const updatedDispatches = dispatches.map((d) => (d.id === updatedRecord.id ? updatedRecord : d));
    if (!dispatches.some((d) => d.id === updatedRecord.id)) {
      updatedDispatches.unshift(updatedRecord);
    }
    saveDailyDispatches(updatedDispatches);

    // Synchronize summaries
    const summary = dispatchRecordToSummaryDto(updatedRecord);
    const updatedSummaries = get().loadingSheets.map((s) =>
      s.id === updatedRecord.id ? summary : s
    );
    if (!get().loadingSheets.some((s) => s.id === updatedRecord.id)) {
      updatedSummaries.unshift(summary);
    }

    const detailDto = dispatchRecordToDetailDto(updatedRecord);

    set({
      dailyDispatches: updatedDispatches,
      loadingSheets: updatedSummaries,
      selectedSheetDetail:
        get().selectedSheetDetail?.id === updatedRecord.id ? detailDto : get().selectedSheetDetail,
    });

    return updatedRecord;
  },

  recalibrateSheet: async (payload: RecalibrateSheetPayload) => {
    return get().recalibrateDispatchSheet(payload);
  },

  recalibrateSheetSnapshot: async (payload: RecalibrateSheetPayload) => {
    return get().recalibrateDispatchSheet(payload);
  },

  editDailyDispatch: async (payload: RecalibrateSheetPayload) => {
    return get().recalibrateDispatchSheet(payload);
  },

  syncSalesmanKhataDebit: (
    salesmanAccountId: number,
    sheetNumber: string,
    amountPaisa: number,
    date?: string
  ) => {
    if (amountPaisa <= 0) return;
    let accounts = loadSavedKhataAccounts();
    let transactions = loadSavedKhataTransactions();
    const acc = accounts.find((a) => a.id === salesmanAccountId);
    if (!acc) return;

    const unpaidRupees = amountPaisa / 100;
    const nextTxId = transactions.length > 0 ? Math.max(...transactions.map((t) => t.id)) + 1 : 1;
    const newTx: KhataTransaction = {
      id: nextTxId,
      accountId: acc.id,
      accountName: `${acc.holderName} (${acc.shopName})`,
      transactionDate: date || new Date().toISOString().slice(0, 10),
      transactionType: "DEBIT",
      amount: unpaidRupees,
      paymentReceived: 0,
      paymentGiven: 0,
      description: `Unpaid van route sales on Sheet ${sheetNumber}`,
      previousBalance: acc.currentBalance,
      newBalance: acc.currentBalance + unpaidRupees,
      referenceNo: sheetNumber,
      createdAt: new Date().toISOString(),
    };

    transactions.push(newTx);

    const accTxs = transactions.filter((t) => t.accountId === acc.id);
    accTxs.sort((a, b) => a.id - b.id);
    let running = acc.openingBalance;
    for (const tx of accTxs) {
      tx.previousBalance = running;
      if (tx.transactionType === "DEBIT") running += tx.amount;
      else if (tx.transactionType === "CREDIT") running -= tx.amount;
      tx.newBalance = running;
    }
    acc.currentBalance = running;
    acc.updatedAt = new Date().toISOString();

    accounts = accounts.map((a) => (a.id === acc.id ? acc : a));
    saveKhataAccounts(accounts);
    saveKhataTransactions(transactions);
  },

  recalibrateSalesmanKhata: (
    salesmanAccountId: number,
    sheetNumber: string,
    newAmountPaisa: number,
    date?: string
  ) => {
    let accounts = loadSavedKhataAccounts();
    let transactions = loadSavedKhataTransactions();
    const acc = accounts.find((a) => a.id === salesmanAccountId);
    if (!acc) return;

    // Revert previous transaction(s) for this sheet
    transactions = transactions.filter((t) => t.referenceNo !== sheetNumber);

    if (newAmountPaisa > 0) {
      const unpaidRupees = newAmountPaisa / 100;
      const nextTxId = transactions.length > 0 ? Math.max(...transactions.map((t) => t.id)) + 1 : 1;
      const newTx: KhataTransaction = {
        id: nextTxId,
        accountId: acc.id,
        accountName: `${acc.holderName} (${acc.shopName})`,
        transactionDate: date || new Date().toISOString().slice(0, 10),
        transactionType: "DEBIT",
        amount: unpaidRupees,
        paymentReceived: 0,
        paymentGiven: 0,
        description: `Unpaid van route sales on Sheet ${sheetNumber}`,
        previousBalance: 0,
        newBalance: 0,
        referenceNo: sheetNumber,
        createdAt: new Date().toISOString(),
      };
      transactions.push(newTx);
    }

    const accTxs = transactions.filter((t) => t.accountId === acc.id);
    accTxs.sort((a, b) => a.id - b.id);
    let running = acc.openingBalance;
    for (const tx of accTxs) {
      tx.previousBalance = running;
      if (tx.transactionType === "DEBIT") running += tx.amount;
      else if (tx.transactionType === "CREDIT") running -= tx.amount;
      tx.newBalance = running;
    }
    acc.currentBalance = running;
    acc.updatedAt = new Date().toISOString();

    accounts = accounts.map((a) => (a.id === acc.id ? acc : a));
    saveKhataAccounts(accounts);
    saveKhataTransactions(transactions);
  },

  openSettlementModal: async (sheetId: number) => {
    set({ isLoading: true, error: null, settlementSheetId: sheetId });
    try {
      const detail = await get().fetchSheetDetail(sheetId);
      const initialReturns: Record<number, { packs: number; loose: number; breakage: number; notes: string }> = {};
      detail.items.forEach((it) => {
        initialReturns[it.product_id] = {
          packs: it.returned_packs || 0,
          loose: it.returned_loose || 0,
          breakage: it.breakage_base || 0,
          notes: "",
        };
      });

      set({
        selectedSheetDetail: detail,
        physicalReturns: initialReturns,
        closingKm: (detail.opening_km || 0) + 48,
        emptyCratesReturned: detail.empty_crates_loaded || 0,
        physicalCashPaisa: detail.expected_cash_paisa || 8500000,
        routeExpensesPaisa: 0,
        isSettlementModalOpen: true,
        isLoading: false,
      });

      await get().recalculateSettlement();
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },

  closeSettlementModal: () => {
    set({ isSettlementModalOpen: false, settlementSheetId: null, activeReconciliation: null });
  },

  updateReturnLine: (productId: number, field: "packs" | "loose" | "breakage", value: number) => {
    const prev = get().physicalReturns;
    const current = prev[productId] || { packs: 0, loose: 0, breakage: 0, notes: "" };
    set({
      physicalReturns: {
        ...prev,
        [productId]: {
          ...current,
          [field]: Math.max(0, value),
        },
      },
    });
  },

  updateSettlementFinancials: (
    cashPaisa: number,
    cratesReturned: number,
    expensesPaisa: number,
    closingKm?: number
  ) => {
    set({
      physicalCashPaisa: cashPaisa,
      emptyCratesReturned: cratesReturned,
      routeExpensesPaisa: expensesPaisa,
      closingKm: closingKm !== undefined ? closingKm : get().closingKm,
    });
  },

  recalculateSettlement: async () => {
    const sheetId = get().settlementSheetId;
    if (!sheetId) return;

    set({ isCalculating: true });
    try {
      const returns = Object.entries(get().physicalReturns).map(([pid, val]) => ({
        product_id: Number(pid),
        returned_packs: val.packs,
        returned_loose: val.loose,
        breakage_base: val.breakage,
        notes: val.notes,
      }));

      const recon = await logisticsService.calculateVanSettlement({
        sheet_id: sheetId,
        returns,
        actual_cash_paisa: get().physicalCashPaisa,
        empty_crates_returned: get().emptyCratesReturned,
        route_expenses_paisa: get().routeExpensesPaisa,
      });

      set({ activeReconciliation: recon, isCalculating: false });
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isCalculating: false,
      });
    }
  },

  submitSettlement: async () => {
    const sheetId = get().settlementSheetId;
    if (!sheetId) return;

    const recon = get().activeReconciliation;
    if (recon && !recon.is_balanced) {
      if (get().shortageAction === "EXPENSE_WAIVER" || recon.total_driver_shortage_liability_paisa > 0) {
        const pinValid = await logisticsService.verifySupervisorPin(get().supervisorPin);
        if (!pinValid) {
          set({ error: "Invalid Supervisor PIN. Shortage resolution requires valid Admin PIN." });
          return;
        }
      }
    }

    set({ isLoading: true, error: null });
    try {
      const returns = Object.entries(get().physicalReturns).map(([pid, val]) => ({
        product_id: Number(pid),
        returned_packs: val.packs,
        returned_loose: val.loose,
        breakage_base: val.breakage,
        notes: val.notes,
      }));

      const dto: SubmitVanSettlementDto = {
        sheet_id: sheetId,
        settlement_date: new Date().toISOString().slice(0, 10),
        closing_km: get().closingKm,
        returns,
        actual_cash_paisa: get().physicalCashPaisa,
        empty_crates_returned: get().emptyCratesReturned,
        route_expenses_paisa: get().routeExpensesPaisa,
        shortage_action: get().shortageAction,
        settlement_notes: get().settlementNotes,
      };

      const result = await logisticsService.submitVanSettlement(dto);

      // Perform stock restoration and Khata settlement
      const returnsFormatted = Object.entries(get().physicalReturns).map(([pid, val]) => ({
        productId: Number(pid),
        returnedIntactPacks: val.packs,
        returnedIntactLoose: val.loose,
        damagedBase: val.breakage,
      }));

      try {
        await get().confirmEveningReturn(
          sheetId,
          returnsFormatted,
          get().physicalCashPaisa,
          get().settlementNotes
        );
      } catch {
        // Fallback if sheet not in dailyDispatches
      }

      set({
        isLoading: false,
        isSettlementModalOpen: false,
        successMessage: `Van Settlement for ${result.sheet_number} completed successfully!`,
      });
      await get().fetchLoadingSheets();
      get().openGatePassModal(sheetId);
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },

  openRouteModal: (route) => {
    set({ isRouteModalOpen: true, editingRoute: route || null });
  },

  closeRouteModal: () => {
    set({ isRouteModalOpen: false, editingRoute: null });
  },

  openVehicleModal: (vehicle) => {
    set({ isVehicleModalOpen: true, editingVehicle: vehicle || null });
  },

  closeVehicleModal: () => {
    set({ isVehicleModalOpen: false, editingVehicle: null });
  },

  openGatePassModal: async (sheetId: number) => {
    set({ isLoading: true });
    try {
      const detail = await get().fetchSheetDetail(sheetId);
      set({ selectedSheetDetail: detail, isGatePassModalOpen: true, isLoading: false });
    } catch {
      set({ isGatePassModalOpen: true, isLoading: false });
    }
  },

  closeGatePassModal: () => {
    set({ isGatePassModalOpen: false });
  },

  setSearchQuery: (q: string) => set({ searchQuery: q }),
  setFilter: (f: LoadingSheetFilterDto) => set({ filter: f }),
  setShortageAction: (action) => set({ shortageAction: action }),
  setSupervisorPin: (pin) => set({ supervisorPin: pin }),
  setSettlementNotes: (notes) => set({ settlementNotes: notes }),
  clearError: () => set({ error: null, successMessage: null }),
}));
