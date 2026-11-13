// src/store/useLogisticsStore.ts
import { create } from "zustand";
import { logisticsService } from "../services/logisticsService";
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
} from "../types/logistics";

interface LogisticsState {
  // Catalogs
  routes: RouteDto[];
  vehicles: VehicleDto[];
  loadingSheets: LoadingSheetSummaryDto[];
  selectedSheetDetail: LoadingSheetDetailDto | null;
  activeReconciliation: SettlementReconciliationDto | null;

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

  // Manifest Actions
  openCreateManifestModal: () => void;
  closeCreateManifestModal: () => void;
  createManifestDraft: (dto: CreateLoadingSheetDto) => Promise<LoadingSheetDetailDto>;
  issueManifestDispatch: (dto: IssueLoadingSheetDto) => Promise<void>;

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

  // Modals
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
  loadingSheets: [],
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
      set({ routes, vehicles, loadingSheets: sheets, isLoading: false });
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
      set({ loadingSheets: sheets, isLoading: false });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },

  fetchSheetDetail: async (sheetId: number) => {
    const detail = await logisticsService.getLoadingSheet(sheetId);
    set({ selectedSheetDetail: detail });
    return detail;
  },

  openCreateManifestModal: () => {
    set({ isLoadingManifestModalOpen: true, error: null, successMessage: null });
  },

  closeCreateManifestModal: () => {
    set({ isLoadingManifestModalOpen: false });
  },

  createManifestDraft: async (dto: CreateLoadingSheetDto) => {
    set({ isLoading: true, error: null });
    try {
      const detail = await logisticsService.createLoadingSheet(dto);
      set({
        selectedSheetDetail: detail,
        isLoading: false,
        isLoadingManifestModalOpen: false,
        successMessage: `Loading sheet ${detail.sheet_number} created as DRAFT`,
      });
      get().fetchLoadingSheets();
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
      set({
        isLoading: false,
        isLoadingManifestModalOpen: false,
        successMessage: `Sheet ${result.sheet_number} dispatched! Multi-location stock transferred.`,
      });
      get().fetchLoadingSheets();
      get().openGatePassModal(dto.sheet_id);
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), isLoading: false });
    }
  },

  openSettlementModal: async (sheetId: number) => {
    set({ isLoading: true, error: null, settlementSheetId: sheetId });
    try {
      const detail = await logisticsService.getLoadingSheet(sheetId);
      // Initialize scratchpad returns matching the loaded items
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

      // Compute initial reconciliation
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
      set({
        isLoading: false,
        isSettlementModalOpen: false,
        successMessage: `Van Settlement for ${result.sheet_number} completed successfully!`,
      });
      get().fetchLoadingSheets();
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
      const detail = await logisticsService.getLoadingSheet(sheetId);
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
