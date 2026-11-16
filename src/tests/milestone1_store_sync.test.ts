/**
 * src/tests/milestone1_store_sync.test.ts
 *
 * Milestone 1 Comprehensive Integration Suite:
 * Core Models, Synchronization & Multi-Edit Store Engine (DOGAR TRADERS)
 *
 * Verifies:
 * 1. Zero Quantity Leakage & Entry Isolation (R1)
 * 2. Morning Dispatch Warehouse Stock Deduction (R1)
 * 3. Evening Return Intact Restocking & Breakage Quarantine (R2)
 * 4. Automated Sales Calculation & Salesman Khata DEBIT Posting (R4)
 * 5. Snapshot Rollback & Re-apply Algorithm across Multi-Pass Edits (R3)
 * 6. Multi-Edit Invariants & Ground-Truth Idempotency (Zero Numerical Drift)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useLogisticsStore } from "../store/useLogisticsStore";
import { useInventoryStore } from "../store/useInventoryStore";
import {
  loadSavedKhataAccounts,
  saveKhataAccounts,
  loadSavedKhataTransactions,
  saveKhataTransactions,
  INITIAL_KHATA_ACCOUNTS,
} from "../types/khata";
import { loadSavedProducts, saveProducts, INITIAL_PRODUCTS } from "../types/products";
import type { RecalibrateSheetPayload } from "../types/logistics";

// Mock localStorage for headless Node test environment
class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
  get length(): number {
    return Object.keys(this.store).length;
  }
  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
}

describe("Milestone 1: Core Models, Stock Synchronization & Multi-Edit Store Engine", () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = mockStorage;

    // Initialize mock storage with initial products & khata accounts
    saveProducts([...INITIAL_PRODUCTS.map((p) => ({ ...p }))]);
    saveKhataAccounts([...INITIAL_KHATA_ACCOUNTS.map((a) => ({ ...a }))]);
    saveKhataTransactions([]);
    mockStorage.setItem("dogar_breakage_logs_v1", JSON.stringify([]));
    mockStorage.setItem("dogar_daily_dispatches_v1", JSON.stringify([]));

    // Reset Zustand stores
    useInventoryStore.setState({
      stockItems: [],
      emptiesOverview: null,
      breakageLogs: [],
      activeCustomerCrateLedger: [],
      filter: {},
      isLoading: false,
      error: null,
    });

    useLogisticsStore.setState({
      routes: [],
      vehicles: [],
      loadingSheets: [],
      dailyDispatches: [],
      selectedSheetDetail: null,
      activeReconciliation: null,
      filter: {},
      searchQuery: "",
      isRouteModalOpen: false,
      isVehicleModalOpen: false,
      isLoadingManifestModalOpen: false,
      isSettlementModalOpen: false,
      isGatePassModalOpen: false,
      settlementSheetId: null,
      physicalReturns: {},
      physicalCashPaisa: 0,
      emptyCratesReturned: 0,
      routeExpensesPaisa: 0,
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // SECTION 1: Zero Quantity Leakage & Entry Isolation
  // ==========================================================================
  describe("1. Zero Quantity Leakage & Entry Isolation", () => {
    it("M1.1: Manifest modal resets scratchpad state on open (no stale quantities)", () => {
      const store = useLogisticsStore.getState();
      store.openCreateManifestModal();
      expect(useLogisticsStore.getState().isLoadingManifestModalOpen).toBe(true);
      expect(useLogisticsStore.getState().error).toBeNull();
    });

    it("M1.2: Unselected or 0-quantity items are strictly excluded from dispatch drafts", async () => {
      const store = useLogisticsStore.getState();

      const created = await store.createManifestDraft({
        route_id: 1,
        sheet_date: "2026-11-16",
        vehicle_id: 1,
        vehicle_number: "LES-2489",
        driver_id: 5,
        driver_name: "Muhammad Ali",
        items: [
          { product_id: 1, pack_qty: 10, loose_qty: 0 },
          { product_id: 2, pack_qty: 0, loose_qty: 0 }, // Unselected / 0-qty item
          { product_id: 3, pack_qty: 0, loose_qty: 0 }, // Unselected / 0-qty item
        ],
      });

      expect(created.items.length).toBe(1);
      expect(created.items[0].product_id).toBe(1);

      // Verify the matching DailyDispatchRecord also excluded 0-quantity items
      const dispatch = store.getDailyDispatchById(created.id);
      expect(dispatch).toBeDefined();
      expect(dispatch!.items.length).toBe(1);
      expect(dispatch!.items[0].productId).toBe(1);
    });

    it("M1.3: Creating consecutive dispatches maintains session isolation (no leakage)", async () => {
      const store = useLogisticsStore.getState();

      const d1 = await store.createDailyDispatch({
        sheetNumber: "LOAD-TEST-001",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Center",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        vehicleNumber: "LES-2489",
        status: "DRAFT",
        emptyCratesLoaded: 20,
        emptyCratesReturned: 0,
        items: [
          {
            productId: 1,
            productSku: "CN-2250-PET",
            productName: "Cola Next 2250 ML",
            packName: "Pack",
            unitsPerPack: 4,
            wholesalePackPricePaisa: 108000,
            isGlass: false,
            dispatchedPacks: 15,
            dispatchedLoose: 0,
            totalDispatchedBase: 60,
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
      });

      const d2 = await store.createDailyDispatch({
        sheetNumber: "LOAD-TEST-002",
        date: "2026-11-16",
        routeId: 2,
        routeName: "Khanpur Road",
        salesmanId: 6,
        salesmanName: "Rashid Mahmood",
        vehicleNumber: "RYK-8192",
        status: "DRAFT",
        emptyCratesLoaded: 30,
        emptyCratesReturned: 0,
        items: [
          {
            productId: 2,
            productSku: "CN-1500-PET",
            productName: "Cola Next 1500 ML",
            packName: "Pack",
            unitsPerPack: 6,
            wholesalePackPricePaisa: 105000,
            isGlass: false,
            dispatchedPacks: 25,
            dispatchedLoose: 0,
            totalDispatchedBase: 150,
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
      });

      expect(d1.items.length).toBe(1);
      expect(d1.items[0].productId).toBe(1);
      expect(d2.items.length).toBe(1);
      expect(d2.items[0].productId).toBe(2);
      expect(d1.sheetNumber).not.toBe(d2.sheetNumber);
    });
  });

  // ==========================================================================
  // SECTION 2: Morning Dispatch Stock Deduction
  // ==========================================================================
  describe("2. Morning Stock Deduction", () => {
    it("M2.1: Confirming morning dispatch deducts exact dispatched base units from inventory", async () => {
      const logisticsStore = useLogisticsStore.getState();
      const initialProducts = loadSavedProducts();
      const prod1 = initialProducts.find((p) => p.id === 1)!;
      const initialStockPacks = prod1.stockPacks; // 250 packs

      // Create draft dispatch of 20 packs (80 base units for 4 bottles/pack)
      const dispatch = await logisticsStore.createDailyDispatch({
        sheetNumber: "LOAD-MORN-01",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Center",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        vehicleNumber: "LES-2489",
        status: "DRAFT",
        emptyCratesLoaded: 20,
        emptyCratesReturned: 0,
        items: [
          {
            productId: 1,
            productSku: prod1.sku,
            productName: prod1.name,
            packName: "Pack",
            unitsPerPack: prod1.bottlesPerPack, // 4
            wholesalePackPricePaisa: prod1.wholesalePackPricePaisa,
            isGlass: false,
            dispatchedPacks: 20,
            dispatchedLoose: 0,
            totalDispatchedBase: 80,
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
      });

      expect(dispatch.status).toBe("DRAFT");
      // Before confirmation: warehouse stock unchanged
      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStockPacks);

      // Confirm morning dispatch
      await logisticsStore.confirmMorningDispatch(dispatch.id);

      // Verify status transitioned to ISSUED
      const updated = logisticsStore.getDailyDispatchById(dispatch.id)!;
      expect(updated.status).toBe("ISSUED");

      // Verify warehouse stock deducted by exactly 20 packs
      const afterStockPacks = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
      expect(afterStockPacks).toBe(initialStockPacks - 20);
    });

    it("M2.2: Dispatching with loose units deducts fractional packs / exact base units", async () => {
      const logisticsStore = useLogisticsStore.getState();
      const prod2 = loadSavedProducts().find((p) => p.id === 2)!; // bottlesPerPack: 6, stock: 320
      const initialStockPacks = prod2.stockPacks;

      // 10 packs + 3 loose units = 63 base units = 10.5 packs
      await logisticsStore.createDailyDispatch({
        sheetNumber: "LOAD-MORN-02",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Center",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        vehicleNumber: "LES-2489",
        status: "OPEN", // created directly as OPEN
        emptyCratesLoaded: 10,
        emptyCratesReturned: 0,
        items: [
          {
            productId: 2,
            productSku: prod2.sku,
            productName: prod2.name,
            packName: "Pack",
            unitsPerPack: 6,
            wholesalePackPricePaisa: prod2.wholesalePackPricePaisa,
            isGlass: false,
            dispatchedPacks: 10,
            dispatchedLoose: 3,
            totalDispatchedBase: 63,
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
      });

      const updatedProd = loadSavedProducts().find((p) => p.id === 2)!;
      expect(updatedProd.stockPacks).toBe(initialStockPacks - 10.5);
    });
  });

  // ==========================================================================
  // SECTION 3: Evening Return Restocking & Breakage Quarantine
  // ==========================================================================
  describe("3. Evening Return Restocking & Breakage Quarantine", () => {
    it("M3.1: Intact returns replenish sellable warehouse stock; damaged stock is quarantined to breakage log", async () => {
      const logisticsStore = useLogisticsStore.getState();
      const inventoryStore = useInventoryStore.getState();

      const prod = loadSavedProducts().find((p) => p.id === 1)!; // bottlesPerPack: 4
      const initialStock = prod.stockPacks;

      // Dispatch 50 packs (200 base units)
      const dispatch = await logisticsStore.createDailyDispatch({
        sheetNumber: "LOAD-EVE-01",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Center",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        salesmanKhataId: 5,
        vehicleNumber: "LES-2489",
        status: "OPEN",
        emptyCratesLoaded: 50,
        emptyCratesReturned: 0,
        items: [
          {
            productId: 1,
            productSku: prod.sku,
            productName: prod.name,
            packName: "Pack",
            unitsPerPack: 4,
            wholesalePackPricePaisa: 108000,
            isGlass: false,
            dispatchedPacks: 50,
            dispatchedLoose: 0,
            totalDispatchedBase: 200,
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
      });

      // Stock right after dispatch = initial - 50 packs
      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 50);

      // Evening return:
      // Sold: 35 packs (140 base units)
      // Returned Intact: 12 packs (48 base units)
      // Damaged/Broken: 3 packs (12 base units)
      // Reconciled: 140 + 48 + 12 = 200 base units
      await logisticsStore.confirmEveningReturn(
        dispatch.id,
        [
          {
            productId: 1,
            returnedIntactPacks: 12,
            returnedIntactLoose: 0,
            damagedPacks: 3,
            damagedLoose: 0,
          },
        ],
        // Cash deposited = 35 packs * 1,080 PKR = 37,800 PKR = 3,780,000 Paisa (full cash)
        3780000
      );

      // 1. Warehouse stock should have gained back exactly 12 packs (intact return)
      const finalStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
      expect(finalStock).toBe(initialStock - 50 + 12); // net deduction = 38 packs (35 sold + 3 damaged)

      // 2. Damaged 3 packs (12 bottles) must NOT be returned to sellable stock
      expect(finalStock).not.toBe(initialStock - 35);

      // 3. Breakage log must contain the 12 broken base units
      await inventoryStore.fetchBreakageLogs(1);
      const logs = useInventoryStore.getState().breakageLogs;
      expect(logs.length).toBeGreaterThanOrEqual(1);
      const logEntry = logs.find((l) => l.product_id === 1);
      expect(logEntry).toBeDefined();
      expect(logEntry!.broken_base_units).toBe(12);

      // 4. Dispatch record marked SETTLED
      const settled = logisticsStore.getDailyDispatchById(dispatch.id)!;
      expect(settled.status).toBe("SETTLED");
      expect(settled.totalSalesRevenuePaisa).toBe(3780000);
      expect(settled.unpaidBalancePaisa).toBe(0);
    });
  });

  // ==========================================================================
  // SECTION 4: Sales Calculation & Salesman Khata DEBIT Posting
  // ==========================================================================
  describe("4. Sales Calculation & Salesman Khata Ledger Posting", () => {
    it("M4.1: Partial cash deposit posts exact unpaid balance as DEBIT to salesman ledger account", async () => {
      const logisticsStore = useLogisticsStore.getState();
      const prod = loadSavedProducts().find((p) => p.id === 1)!;

      // Salesman: Muhammad Ali (ID: 5, category: SALESMAN)
      const accountsBefore = loadSavedKhataAccounts();
      const salesmanAcc = accountsBefore.find((a) => a.id === 5)!;
      expect(salesmanAcc.category).toBe("SALESMAN");
      const initialSalesmanBalance = salesmanAcc.currentBalance; // 0

      // Dispatch 20 packs
      const dispatch = await logisticsStore.createDailyDispatch({
        sheetNumber: "LOAD-KHATA-01",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Center",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        salesmanKhataId: 5,
        vehicleNumber: "LES-2489",
        status: "OPEN",
        emptyCratesLoaded: 20,
        emptyCratesReturned: 0,
        items: [
          {
            productId: 1,
            productSku: prod.sku,
            productName: prod.name,
            packName: "Pack",
            unitsPerPack: 4,
            wholesalePackPricePaisa: 108000, // 1,080 PKR per pack
            isGlass: false,
            dispatchedPacks: 20,
            dispatchedLoose: 0,
            totalDispatchedBase: 80,
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
      });

      // Evening return:
      // Sold: 20 packs (80 units). Gross revenue = 20 * 1,080 = 21,600 PKR (2,160,000 Paisa).
      // Cash deposited: 15,000 PKR (1,500,000 Paisa).
      // Unpaid balance: 21,600 - 15,000 = 6,600 PKR (660,000 Paisa).
      await logisticsStore.confirmEveningReturn(
        dispatch.id,
        [{ productId: 1, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
        1500000 // partial cash deposit
      );

      // Verify salesman khata account was updated
      const accountsAfter = loadSavedKhataAccounts();
      const updatedSalesman = accountsAfter.find((a) => a.id === 5)!;
      expect(updatedSalesman.currentBalance).toBe(initialSalesmanBalance + 6600);

      // Verify DEBIT transaction was posted
      const txs = loadSavedKhataTransactions();
      const sheetTx = txs.find((t) => t.referenceNo === "LOAD-KHATA-01");
      expect(sheetTx).toBeDefined();
      expect(sheetTx!.accountId).toBe(5);
      expect(sheetTx!.transactionType).toBe("DEBIT");
      expect(sheetTx!.amount).toBe(6600);
      expect(sheetTx!.newBalance).toBe(6600);
    });

    it("M4.2: Full cash deposit posts NO debit transaction and leaves salesman balance at 0", async () => {
      const logisticsStore = useLogisticsStore.getState();
      const prod = loadSavedProducts().find((p) => p.id === 1)!;

      const dispatch = await logisticsStore.createDailyDispatch({
        sheetNumber: "LOAD-KHATA-02",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Center",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        salesmanKhataId: 5,
        vehicleNumber: "LES-2489",
        status: "OPEN",
        emptyCratesLoaded: 10,
        emptyCratesReturned: 0,
        items: [
          {
            productId: 1,
            productSku: prod.sku,
            productName: prod.name,
            packName: "Pack",
            unitsPerPack: 4,
            wholesalePackPricePaisa: 108000,
            isGlass: false,
            dispatchedPacks: 10,
            dispatchedLoose: 0,
            totalDispatchedBase: 40,
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
      });

      // Total revenue = 10 * 1,080 = 10,800 PKR (1,080,000 Paisa).
      // Deposit exact cash = 10,800 PKR.
      await logisticsStore.confirmEveningReturn(
        dispatch.id,
        [{ productId: 1, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
        1080000
      );

      const txs = loadSavedKhataTransactions();
      const sheetTx = txs.find((t) => t.referenceNo === "LOAD-KHATA-02");
      expect(sheetTx).toBeUndefined();
    });
  });

  // ==========================================================================
  // SECTION 5: Snapshot Rollback & Re-apply Algorithm (Multi-Edit Persistence)
  // ==========================================================================
  describe("5. Snapshot Rollback & Re-apply Algorithm for Multi-Edit Persistence", () => {
    it("M5.1: Multi-Edit on ISSUED dispatch adjusts warehouse stock by exact net delta", async () => {
      const logisticsStore = useLogisticsStore.getState();
      const prod = loadSavedProducts().find((p) => p.id === 1)!;
      const initialStock = prod.stockPacks;

      // Initial dispatch: 30 packs (120 base units)
      const dispatch = await logisticsStore.createDailyDispatch({
        sheetNumber: "LOAD-MEDIT-01",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Center",
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
            productSku: prod.sku,
            productName: prod.name,
            packName: "Pack",
            unitsPerPack: 4,
            wholesalePackPricePaisa: 108000,
            isGlass: false,
            dispatchedPacks: 30,
            dispatchedLoose: 0,
            totalDispatchedBase: 120,
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
      });

      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 30);

      // Edit: Supervisor increases dispatched packs from 30 to 40 packs (+10 packs)
      const payload: RecalibrateSheetPayload = {
        sheetId: dispatch.id,
        status: "ISSUED",
        items: [
          {
            productId: 1,
            dispatchedPacks: 40,
            dispatchedLoose: 0,
            returnedIntactPacks: 0,
            returnedIntactLoose: 0,
            damagedPacks: 0,
            damagedLoose: 0,
          },
        ],
        cashDepositedPaisa: 0,
      };

      await logisticsStore.recalibrateDispatchSheet(payload);

      // Warehouse stock must now be deducted by 40 packs total from initial
      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 40);

      // Edit 2: Supervisor decreases dispatched packs to 25 packs (-15 packs from 40)
      const payload2: RecalibrateSheetPayload = {
        sheetId: dispatch.id,
        status: "ISSUED",
        items: [
          {
            productId: 1,
            dispatchedPacks: 25,
            dispatchedLoose: 0,
            returnedIntactPacks: 0,
            returnedIntactLoose: 0,
            damagedPacks: 0,
            damagedLoose: 0,
          },
        ],
        cashDepositedPaisa: 0,
      };

      await logisticsStore.recalibrateDispatchSheet(payload2);

      // Warehouse stock must now be deducted by exactly 25 packs total from initial
      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 25);
    });

    it("M5.2: Multi-Edit on SETTLED sheet recalibrates stock, revenue, and salesman khata without drift", async () => {
      const logisticsStore = useLogisticsStore.getState();
      const prod = loadSavedProducts().find((p) => p.id === 1)!;
      const initialStock = prod.stockPacks;

      // Step 1: Dispatch 50 packs (200 base units)
      const dispatch = await logisticsStore.createDailyDispatch({
        sheetNumber: "LOAD-MEDIT-SETTLED",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Center",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        salesmanKhataId: 5,
        vehicleNumber: "LES-2489",
        status: "OPEN",
        emptyCratesLoaded: 50,
        emptyCratesReturned: 0,
        items: [
          {
            productId: 1,
            productSku: prod.sku,
            productName: prod.name,
            packName: "Pack",
            unitsPerPack: 4,
            wholesalePackPricePaisa: 108000,
            isGlass: false,
            dispatchedPacks: 50,
            dispatchedLoose: 0,
            totalDispatchedBase: 200,
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
      });

      // Step 2: Evening return
      // Sold 40 packs, Returned Intact 10 packs
      // Revenue = 40 * 1,080 = 43,200 PKR (4,320,000 Paisa)
      // Cash deposited = 30,000 PKR (3,000,000 Paisa)
      // Unpaid balance = 13,200 PKR (1,320,000 Paisa)
      await logisticsStore.confirmEveningReturn(
        dispatch.id,
        [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
        3000000
      );

      // Verify initial settlement state
      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 40);
      expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(13200);

      // Step 3: Consecutive Edit 1 — Discovered 2 more packs were intact returns (total returned intact = 12 packs)
      // Sold is now 38 packs. Revenue = 38 * 1,080 = 41,040 PKR.
      // Unpaid balance = 41,040 - 30,000 = 11,040 PKR.
      await logisticsStore.recalibrateDispatchSheet({
        sheetId: dispatch.id,
        status: "SETTLED",
        items: [
          {
            productId: 1,
            dispatchedPacks: 50,
            dispatchedLoose: 0,
            returnedIntactPacks: 12,
            returnedIntactLoose: 0,
            damagedPacks: 0,
            damagedLoose: 0,
          },
        ],
        cashDepositedPaisa: 3000000,
      });

      // Net warehouse stock: 50 dispatched - 12 intact = 38 out of warehouse
      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 38);
      // Salesman Khata balance: exactly 11,040 PKR
      expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(11040);

      // Step 4: Consecutive Edit 2 — Customer paid additional 5,000 PKR cash deposited (total deposited = 35,000 PKR)
      // Unpaid balance = 41,040 - 35,000 = 6,040 PKR.
      await logisticsStore.recalibrateDispatchSheet({
        sheetId: dispatch.id,
        status: "SETTLED",
        items: [
          {
            productId: 1,
            dispatchedPacks: 50,
            dispatchedLoose: 0,
            returnedIntactPacks: 12,
            returnedIntactLoose: 0,
            damagedPacks: 0,
            damagedLoose: 0,
          },
        ],
        cashDepositedPaisa: 3500000,
      });

      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 38);
      expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(6040);

      // Step 5: Consecutive Edit 3 — Full payment cleared (cash deposited = 41,040 PKR, 4,104,000 Paisa)
      // Unpaid balance = 0.
      await logisticsStore.recalibrateDispatchSheet({
        sheetId: dispatch.id,
        status: "SETTLED",
        items: [
          {
            productId: 1,
            dispatchedPacks: 50,
            dispatchedLoose: 0,
            returnedIntactPacks: 12,
            returnedIntactLoose: 0,
            damagedPacks: 0,
            damagedLoose: 0,
          },
        ],
        cashDepositedPaisa: 4104000,
      });

      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 38);
      // Salesman Khata balance must be exactly 0
      expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(0);

      // Verify no orphaned transactions remain for this sheet
      const finalTxs = loadSavedKhataTransactions();
      const sheetTxs = finalTxs.filter((t) => t.referenceNo === "LOAD-MEDIT-SETTLED");
      expect(sheetTxs.length).toBe(0);
    });

    it("M5.3: Reverting consecutive edits back to initial state perfectly preserves ground truth", async () => {
      const logisticsStore = useLogisticsStore.getState();
      const prod = loadSavedProducts().find((p) => p.id === 1)!;
      const initialStock = prod.stockPacks;
      const initialKhata = loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance;

      // Dispatch 20 packs in ISSUED state
      const dispatch = await logisticsStore.createDailyDispatch({
        sheetNumber: "LOAD-ROUNDTRIP",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Center",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        salesmanKhataId: 5,
        vehicleNumber: "LES-2489",
        status: "ISSUED",
        emptyCratesLoaded: 20,
        emptyCratesReturned: 0,
        items: [
          {
            productId: 1,
            productSku: prod.sku,
            productName: prod.name,
            packName: "Pack",
            unitsPerPack: 4,
            wholesalePackPricePaisa: 108000,
            isGlass: false,
            dispatchedPacks: 20,
            dispatchedLoose: 0,
            totalDispatchedBase: 80,
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
      });

      // 5 wild consecutive edits:
      // Edit 1: change to 80 packs
      await logisticsStore.recalibrateDispatchSheet({
        sheetId: dispatch.id,
        items: [{ productId: 1, dispatchedPacks: 80, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
        cashDepositedPaisa: 0,
      });
      // Edit 2: change to 5 packs
      await logisticsStore.recalibrateDispatchSheet({
        sheetId: dispatch.id,
        items: [{ productId: 1, dispatchedPacks: 5, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
        cashDepositedPaisa: 0,
      });
      // Edit 3: change to 60 packs + 10 intact return
      await logisticsStore.recalibrateDispatchSheet({
        sheetId: dispatch.id,
        status: "SETTLED",
        items: [{ productId: 1, dispatchedPacks: 60, dispatchedLoose: 0, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
        cashDepositedPaisa: 1000000,
      });
      // Edit 4: change to 35 packs + 5 intact return
      await logisticsStore.recalibrateDispatchSheet({
        sheetId: dispatch.id,
        status: "SETTLED",
        items: [{ productId: 1, dispatchedPacks: 35, dispatchedLoose: 0, returnedIntactPacks: 5, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
        cashDepositedPaisa: 2000000,
      });
      // Edit 5: restore EXACT original state (20 dispatched, 0 returned, ISSUED status)
      await logisticsStore.recalibrateDispatchSheet({
        sheetId: dispatch.id,
        status: "ISSUED",
        items: [{ productId: 1, dispatchedPacks: 20, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
        cashDepositedPaisa: 0,
      });

      // Warehouse stock must match exactly initialStock - 20 (ZERO drift)
      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 20);
      // Salesman Khata balance must match exactly initialKhata (ZERO drift)
      expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(initialKhata);
    });
  });
});
