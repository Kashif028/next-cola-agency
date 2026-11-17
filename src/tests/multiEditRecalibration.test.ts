/**
 * src/tests/multiEditRecalibration.test.ts
 *
 * Requirement R3: Persistent Multi-Edit Capabilities Across Records (ملٹی ایڈٹ اور مستقل تصحیح)
 * Acceptance Criteria:
 *   - Persistent editability: edit options accessible across all statuses, not disappearing after first edit.
 *   - Multi-pass consecutive edits on the same record (e.g. edit 1 -> save -> edit 2 -> save -> edit 3).
 *   - Snapshot rollback & re-apply mechanics: net stock and khata adjustments calculated accurately without orphaned records or double counting.
 *   - Interlocking edit and return net calculations: editing dispatch quantities when returns are already entered.
 *
 * Mathematical Invariants:
 *   Net Stock Adjustment = (New Dispatched - New Intact Return) - (Old Dispatched - Old Intact Return)
 *   Warehouse Stock(new) = Warehouse Stock(old) - Net Stock Adjustment
 *   Net Khata Adjustment = New Unpaid Balance - Old Unpaid Balance
 *   Salesman Balance(new) = Salesman Balance(old) + Net Khata Adjustment
 *
 * Tiers:
 *   Tier 1: Single Edit & Persistent Availability (5 tests)
 *   Tier 2: Boundary Edits, Zeroing, and Idempotency (5 tests)
 *   Tier 3: Interlocking Dispatch & Return Consecutive Edits (3 tests)
 *   Tier 4: Stress Multi-Pass Recalibration Scenarios (2 tests)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useLogisticsStore } from "../store/useLogisticsStore";
import { useInventoryStore } from "../store/useInventoryStore";
import {
  loadSavedKhataAccounts,
  saveKhataAccounts,
  saveKhataTransactions,
  INITIAL_KHATA_ACCOUNTS,
} from "../types/khata";
import { loadSavedProducts, saveProducts, INITIAL_PRODUCTS } from "../types/products";
import type { DailyDispatchRecord, RecalibrateSheetPayload } from "../types/logistics";

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

describe("R3: Persistent Multi-Edit & Snapshot Recalibration", () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = mockStorage;

    saveProducts([...INITIAL_PRODUCTS.map((p) => ({ ...p }))]);
    saveKhataAccounts([...INITIAL_KHATA_ACCOUNTS.map((a) => ({ ...a }))]);
    saveKhataTransactions([]);
    mockStorage.setItem("dogar_breakage_logs_v1", JSON.stringify([]));
    mockStorage.setItem("dogar_daily_dispatches_v1", JSON.stringify([]));

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

  async function createTestDispatch(overrides?: Partial<DailyDispatchRecord>): Promise<DailyDispatchRecord> {
    const store = useLogisticsStore.getState();
    const prod1 = loadSavedProducts().find((p) => p.id === 1)!;
    return store.createDailyDispatch({
      sheetNumber: overrides?.sheetNumber || `LOAD-EDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: overrides?.date || "2026-11-16",
      routeId: overrides?.routeId || 1,
      routeName: overrides?.routeName || "City Center",
      salesmanId: overrides?.salesmanId || 5,
      salesmanName: overrides?.salesmanName || "Muhammad Ali",
      salesmanKhataId: overrides?.salesmanKhataId || 5,
      vehicleNumber: overrides?.vehicleNumber || "LES-2489",
      status: overrides?.status || "ISSUED",
      emptyCratesLoaded: overrides?.emptyCratesLoaded ?? 30,
      emptyCratesReturned: overrides?.emptyCratesReturned ?? 0,
      items: overrides?.items || [
        {
          productId: 1,
          productSku: prod1.sku,
          productName: prod1.name,
          packName: prod1.requiresCrate ? "Crate" : "Pack",
          unitsPerPack: prod1.bottlesPerPack,
          wholesalePackPricePaisa: prod1.wholesalePackPricePaisa,
          isGlass: prod1.requiresCrate || false,
          dispatchedPacks: 30,
          dispatchedLoose: 0,
          totalDispatchedBase: 30 * prod1.bottlesPerPack,
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
      totalSalesRevenuePaisa: overrides?.totalSalesRevenuePaisa ?? 0,
      cashDepositedPaisa: overrides?.cashDepositedPaisa ?? 0,
      unpaidBalancePaisa: overrides?.unpaidBalancePaisa ?? 0,
    });
  }

  // ==========================================================================
  // TIER 1: Single Edit & Persistent Availability (≥ 5 tests)
  // ==========================================================================

  it("T1.1: Single edit on morning dispatch modifies warehouse stock by exact delta", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const dispatch = await createTestDispatch({ status: "ISSUED" });

    // Initial deduction of 30 packs
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 30);

    // Supervisor edits dispatch before van departs: increased from 30 to 40 packs (+10 packs)
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

    await useLogisticsStore.getState().recalibrateDispatchSheet(payload);

    // Warehouse stock reduced by additional 10 packs
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 40);

    const updated = useLogisticsStore.getState().getDailyDispatchById(dispatch.id);
    expect(updated).toBeDefined();
    expect(updated!.items[0].dispatchedPacks).toBe(40);
  });

  it("T1.2: Persistent edit option remains accessible across all statuses (OPEN, ISSUED, SETTLED, FINALIZED)", async () => {
    const statuses: Array<"OPEN" | "ISSUED" | "SETTLED" | "FINALIZED"> = [
      "OPEN",
      "ISSUED",
      "SETTLED",
      "FINALIZED",
    ];

    for (const st of statuses) {
      const dispatch = await createTestDispatch({
        sheetNumber: `LOAD-STATUS-${st}`,
        status: st,
      });

      // Recalibrate sheet with status = st
      const payload: RecalibrateSheetPayload = {
        sheetId: dispatch.id,
        status: st,
        items: [
          {
            productId: 1,
            dispatchedPacks: 35,
            dispatchedLoose: 0,
            returnedIntactPacks: 5,
            returnedIntactLoose: 0,
            damagedPacks: 0,
            damagedLoose: 0,
          },
        ],
        cashDepositedPaisa: 1000000,
      };

      const recalibrated = await useLogisticsStore.getState().recalibrateDispatchSheet(payload);
      expect(recalibrated).toBeDefined();
      expect(recalibrated.status).toBe(st);
      expect(recalibrated.items[0].dispatchedPacks).toBe(35);
    }
  });

  it("T1.3: Editing metadata (driver, vehicle, notes) does NOT alter stock or financial balances", async () => {
    const dispatch = await createTestDispatch({ status: "ISSUED" });
    const stockBefore = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const khataBefore = loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance;

    const payload: RecalibrateSheetPayload = {
      sheetId: dispatch.id,
      status: "ISSUED",
      notes: "Updated supervisor delivery route note",
      items: [
        {
          productId: 1,
          dispatchedPacks: 30,
          dispatchedLoose: 0,
          returnedIntactPacks: 0,
          returnedIntactLoose: 0,
          damagedPacks: 0,
          damagedLoose: 0,
        },
      ],
      cashDepositedPaisa: 0,
    };

    await useLogisticsStore.getState().recalibrateDispatchSheet(payload);

    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(stockBefore);
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(khataBefore);
    const updated = useLogisticsStore.getState().getDailyDispatchById(dispatch.id);
    expect(updated!.notes).toBe("Updated supervisor delivery route note");
  });

  it("T1.4: Single edit on settled sheet updates sold volume and khata debt accurately", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const dispatch = await createTestDispatch({ status: "OPEN" });

    // Evening return: Dispatched 30 packs, Returned intact 6 packs, Sold 24 packs.
    // Wholesale price = 108000 paisa (1,080 PKR) per pack.
    // Revenue = 24 * 1080 = 25,920 PKR (2,592,000 paisa).
    // Cash deposited = 20,000 PKR (2,000,000 paisa).
    // Unpaid balance = 5,920 PKR (592,000 paisa).
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 6, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      2000000
    );

    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 24);
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(5920);

    // Edit: driver actually returned 8 packs intact (2 more packs unsold).
    // New Sold = 30 - 8 = 22 packs.
    // New Revenue = 22 * 1080 = 23,760 PKR.
    // New Unpaid balance = 23,760 - 20,000 = 3,760 PKR.
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "SETTLED",
      items: [
        {
          productId: 1,
          dispatchedPacks: 30,
          dispatchedLoose: 0,
          returnedIntactPacks: 8,
          returnedIntactLoose: 0,
          damagedPacks: 0,
          damagedLoose: 0,
        },
      ],
      cashDepositedPaisa: 2000000,
    });

    // 2 more packs returned to warehouse
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 22);
    // Salesman debt reduced to 3,760 PKR
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(3760);
  });

  it("T1.5: Persistent editability: record can be edited a second and third time without losing editability", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const dispatch = await createTestDispatch({ status: "ISSUED" });

    // Edit 1: change to 25 packs
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "ISSUED",
      items: [{ productId: 1, dispatchedPacks: 25, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 0,
    });
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 25);

    // Edit 2: change to 35 packs
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "ISSUED",
      items: [{ productId: 1, dispatchedPacks: 35, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 0,
    });
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 35);

    // Edit 3: change to 30 packs and settle
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "SETTLED",
      items: [{ productId: 1, dispatchedPacks: 30, dispatchedLoose: 0, returnedIntactPacks: 5, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 1500000,
    });
    // Net out = 30 - 5 = 25 packs
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 25);
    const finalSheet = useLogisticsStore.getState().getDailyDispatchById(dispatch.id)!;
    expect(finalSheet.status).toBe("SETTLED");
    expect(finalSheet.items[0].dispatchedPacks).toBe(30);
    expect(finalSheet.items[0].returnedIntactPacks).toBe(5);
  });

  // ==========================================================================
  // TIER 2: Boundary Edits, Zeroing, and Idempotency (≥ 5 tests)
  // ==========================================================================

  it("T2.1: Removing an item completely restores its entire dispatched stock to warehouse", async () => {
    const prod1 = loadSavedProducts().find((p) => p.id === 1)!;
    const prod2 = loadSavedProducts().find((p) => p.id === 2)!;
    const initialStock1 = prod1.stockPacks;
    const initialStock2 = prod2.stockPacks;

    const dispatch = await createTestDispatch({
      status: "ISSUED",
      items: [
        {
          productId: 1,
          productSku: prod1.sku,
          productName: prod1.name,
          packName: "Pack",
          unitsPerPack: prod1.bottlesPerPack,
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
        {
          productId: 2,
          productSku: prod2.sku,
          productName: prod2.name,
          packName: "Pack",
          unitsPerPack: prod2.bottlesPerPack,
          wholesalePackPricePaisa: prod2.wholesalePackPricePaisa,
          isGlass: false,
          dispatchedPacks: 15,
          dispatchedLoose: 0,
          totalDispatchedBase: 90,
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
    });

    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock1 - 20);
    expect(loadSavedProducts().find((p) => p.id === 2)!.stockPacks).toBe(initialStock2 - 15);

    // Edit: Remove Product 2 (keep only Product 1 with dispatchedPacks = 20, Product 2 dispatchedPacks = 0)
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "ISSUED",
      items: [
        {
          productId: 1,
          dispatchedPacks: 20,
          dispatchedLoose: 0,
          returnedIntactPacks: 0,
          returnedIntactLoose: 0,
          damagedPacks: 0,
          damagedLoose: 0,
        },
        {
          productId: 2,
          dispatchedPacks: 0,
          dispatchedLoose: 0,
          returnedIntactPacks: 0,
          returnedIntactLoose: 0,
          damagedPacks: 0,
          damagedLoose: 0,
        },
      ],
      cashDepositedPaisa: 0,
    });

    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock1 - 20);
    expect(loadSavedProducts().find((p) => p.id === 2)!.stockPacks).toBe(initialStock2); // Restored
  });

  it("T2.2: Reducing dispatched quantity to 0 restores all allocated stock to warehouse", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const dispatch = await createTestDispatch({ status: "ISSUED" });

    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 30);

    // User sets dispatched quantity to 0
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "ISSUED",
      items: [
        {
          productId: 1,
          dispatchedPacks: 0,
          dispatchedLoose: 0,
          returnedIntactPacks: 0,
          returnedIntactLoose: 0,
          damagedPacks: 0,
          damagedLoose: 0,
        },
      ],
      cashDepositedPaisa: 0,
    });

    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock);
  });

  it("T2.3: Idempotent re-save: saving identical values produces zero delta and no numerical drift", async () => {
    const dispatch = await createTestDispatch({ status: "OPEN" });
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      1500000
    );

    const stockBefore = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const khataBefore = loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance;

    // Save exact same values 3 times
    for (let i = 0; i < 3; i++) {
      await useLogisticsStore.getState().recalibrateDispatchSheet({
        sheetId: dispatch.id,
        status: "SETTLED",
        items: [
          {
            productId: 1,
            dispatchedPacks: 30,
            dispatchedLoose: 0,
            returnedIntactPacks: 10,
            returnedIntactLoose: 0,
            damagedPacks: 0,
            damagedLoose: 0,
          },
        ],
        cashDepositedPaisa: 1500000,
      });

      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(stockBefore);
      expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(khataBefore);
    }
  });

  it("T2.4: Editing cash deposit on settled sheet updates salesman khata balance without affecting stock", async () => {
    const dispatch = await createTestDispatch({ status: "OPEN" });
    // Dispatched 30, Intact returned 10 -> Sold 20 packs @ 1,080 PKR = 21,600 PKR.
    // Initial cash deposited: 15,000 PKR (1,500,000 paisa).
    // Initial unpaid balance = 6,600 PKR.
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      1500000
    );

    const stockBefore = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(6600);

    // Salesman deposits additional 5,000 PKR later (total deposited = 20,000 PKR = 2,000,000 paisa)
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "SETTLED",
      items: [
        {
          productId: 1,
          dispatchedPacks: 30,
          dispatchedLoose: 0,
          returnedIntactPacks: 10,
          returnedIntactLoose: 0,
          damagedPacks: 0,
          damagedLoose: 0,
        },
      ],
      cashDepositedPaisa: 2000000,
    });

    // Stock unchanged
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(stockBefore);
    // Unpaid balance drops from 6,600 to 1,600 PKR
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(1600);
  });

  it("T2.5: Adding a new product SKU during edit deducts only the new SKU's stock", async () => {
    const prod1 = loadSavedProducts().find((p) => p.id === 1)!;
    const prod2 = loadSavedProducts().find((p) => p.id === 2)!;
    const initialStock1 = prod1.stockPacks;
    const initialStock2 = prod2.stockPacks;

    const dispatch = await createTestDispatch({ status: "ISSUED" });
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock1 - 30);
    expect(loadSavedProducts().find((p) => p.id === 2)!.stockPacks).toBe(initialStock2);

    // Edit: add Product 2 with 10 packs
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "ISSUED",
      items: [
        {
          productId: 1,
          dispatchedPacks: 30,
          dispatchedLoose: 0,
          returnedIntactPacks: 0,
          returnedIntactLoose: 0,
          damagedPacks: 0,
          damagedLoose: 0,
        },
        {
          productId: 2,
          dispatchedPacks: 10,
          dispatchedLoose: 0,
          returnedIntactPacks: 0,
          returnedIntactLoose: 0,
          damagedPacks: 0,
          damagedLoose: 0,
        },
      ],
      cashDepositedPaisa: 0,
    });

    // Product 1 stock untouched
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock1 - 30);
    // Product 2 stock deducted by 10 packs
    expect(loadSavedProducts().find((p) => p.id === 2)!.stockPacks).toBe(initialStock2 - 10);
  });

  // ==========================================================================
  // TIER 3: Interlocking Dispatch & Return Consecutive Edits (≥ 3 tests)
  // ==========================================================================

  it("T3.1: 3-Pass consecutive edit chain on single record maintains exact stock and khata integrity", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;

    // Pass 0: Baseline dispatch (30 packs)
    const dispatch = await createTestDispatch({ status: "ISSUED" });
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 30);

    // Pass 1: Morning correction (+10 packs = 40 packs total)
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "ISSUED",
      items: [{ productId: 1, dispatchedPacks: 40, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 0,
    });
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 40);

    // Pass 2: Evening return entered (10 packs returned intact, 20,000 PKR cash deposited)
    // Sold = 40 - 10 = 30 packs @ 1080 PKR = 32,400 PKR.
    // Unpaid = 32,400 - 20,000 = 12,400 PKR.
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "SETTLED",
      items: [{ productId: 1, dispatchedPacks: 40, dispatchedLoose: 0, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 2000000,
    });
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 30);
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(12400);

    // Pass 3: Supervisor audit corrects return: intact was 15 packs (not 10), damaged was 1 pack
    // Sold = 40 - 15 - 1 = 24 packs @ 1080 PKR = 25,920 PKR.
    // Unpaid = 25,920 - 20,000 = 5,920 PKR.
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "SETTLED",
      items: [{ productId: 1, dispatchedPacks: 40, dispatchedLoose: 0, returnedIntactPacks: 15, returnedIntactLoose: 0, damagedPacks: 1, damagedLoose: 0 }],
      cashDepositedPaisa: 2000000,
    });
    // Net out = 40 - 15 = 25 packs deducted from warehouse
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 25);
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(5920);
  });

  it("T3.2: Interlocking: editing dispatch quantity when returns are already recorded recalibrates sold qty and revenue", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const dispatch = await createTestDispatch({ status: "OPEN" });

    // Settled: Dispatched 30, Returned 10 -> Sold 20 packs @ 1,080 PKR = 21,600 PKR.
    // Cash deposited: 15,000 PKR -> Unpaid: 6,600 PKR.
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      1500000
    );

    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 20);
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(6600);

    // Supervisor discovers morning loading sheet forgot 5 packs: Dispatched was actually 35 packs
    // Returns stay at 10 -> Sold becomes 35 - 10 = 25 packs (+5 sold packs @ 1,080 PKR = +5,400 PKR)
    // New Revenue = 25 * 1080 = 27,000 PKR
    // New Unpaid = 27,000 - 15,000 = 12,000 PKR (+5,400 PKR debt)
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "SETTLED",
      items: [{ productId: 1, dispatchedPacks: 35, dispatchedLoose: 0, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 1500000,
    });

    // Warehouse stock reduced by additional 5 packs (net out = 25)
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 25);
    // Salesman debt increased to 12,000 PKR
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(12000);
  });

  it("T3.3: Reversal edit: reverting an edited sheet back to original values returns warehouse and khata to exact baseline", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const initialKhata = loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance;

    const dispatch = await createTestDispatch({ status: "ISSUED" });
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 30);

    // Step 1: Mistakenly edited to 50 packs
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "ISSUED",
      items: [{ productId: 1, dispatchedPacks: 50, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 0,
    });
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 50);

    // Step 2: Supervisor realizes mistake and reverts back to original 30 packs
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "ISSUED",
      items: [{ productId: 1, dispatchedPacks: 30, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 0,
    });

    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 30);
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(initialKhata);
  });

  // ==========================================================================
  // TIER 4: Stress Multi-Pass Recalibration Scenarios (≥ 2 tests)
  // ==========================================================================

  it("T4.1: Agency supervisor stress test: 5 consecutive edits on multi-SKU sheet match single-step ground truth", async () => {
    const prod1 = loadSavedProducts().find((p) => p.id === 1)!;
    const prod2 = loadSavedProducts().find((p) => p.id === 2)!;
    const initialStock1 = prod1.stockPacks;
    const initialStock2 = prod2.stockPacks;

    const dispatch = await createTestDispatch({
      status: "ISSUED",
      items: [
        {
          productId: 1,
          productSku: prod1.sku,
          productName: prod1.name,
          packName: "Pack",
          unitsPerPack: prod1.bottlesPerPack,
          wholesalePackPricePaisa: prod1.wholesalePackPricePaisa,
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
        {
          productId: 2,
          productSku: prod2.sku,
          productName: prod2.name,
          packName: "Pack",
          unitsPerPack: prod2.bottlesPerPack,
          wholesalePackPricePaisa: prod2.wholesalePackPricePaisa,
          isGlass: false,
          dispatchedPacks: 20,
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
    });

    // 5 consecutive edits:
    // Edit 1: Dispatch adjustment (P1: 40, P2: 25)
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "ISSUED",
      items: [
        { productId: 1, dispatchedPacks: 40, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
        { productId: 2, dispatchedPacks: 25, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
      ],
      cashDepositedPaisa: 0,
    });

    // Edit 2: Midday top-up (P1: 45, P2: 25)
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "ISSUED",
      items: [
        { productId: 1, dispatchedPacks: 45, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
        { productId: 2, dispatchedPacks: 25, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
      ],
      cashDepositedPaisa: 0,
    });

    // Edit 3: Initial evening return (P1: intact 10; P2: intact 5; Cash 50,000 PKR = 5,000,000 paisa)
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "SETTLED",
      items: [
        { productId: 1, dispatchedPacks: 45, dispatchedLoose: 0, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
        { productId: 2, dispatchedPacks: 25, dispatchedLoose: 0, returnedIntactPacks: 5, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
      ],
      cashDepositedPaisa: 5000000,
    });

    // Edit 4: Second count audit (P1 intact corrected to 12, P2 intact to 7)
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "SETTLED",
      items: [
        { productId: 1, dispatchedPacks: 45, dispatchedLoose: 0, returnedIntactPacks: 12, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
        { productId: 2, dispatchedPacks: 25, dispatchedLoose: 0, returnedIntactPacks: 7, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
      ],
      cashDepositedPaisa: 5000000,
    });

    // Edit 5: Additional cash deposit (+10,000 PKR = 6,000,000 paisa total)
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "SETTLED",
      items: [
        { productId: 1, dispatchedPacks: 45, dispatchedLoose: 0, returnedIntactPacks: 12, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
        { productId: 2, dispatchedPacks: 25, dispatchedLoose: 0, returnedIntactPacks: 7, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
      ],
      cashDepositedPaisa: 6000000,
    });

    // Ground truth verification:
    // P1 net out: 45 dispatched - 12 intact = 33 packs
    // P2 net out: 25 dispatched - 7 intact = 18 packs
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock1 - 33);
    expect(loadSavedProducts().find((p) => p.id === 2)!.stockPacks).toBe(initialStock2 - 18);

    // Financials ground truth:
    // P1 sold: 33 packs * 1,080 = 35,640 PKR
    // P2 sold: 18 packs * 1,050 = 18,900 PKR
    // Total revenue = 54,540 PKR
    // Cash deposited = 60,000 PKR (> revenue) -> Unpaid balance = 0
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(0);
  });

  it("T4.2: Zero-drift invariant: multi-pass edits across multi-van fleet preserve global stock conservation", async () => {
    const prod1 = loadSavedProducts().find((p) => p.id === 1)!;
    const initialGlobalP1 = prod1.stockPacks;

    // Van A (Muhammad Ali, id 5) loads 40 packs
    const dispatchA = await createTestDispatch({
      sheetNumber: "LOAD-VAN-A",
      salesmanId: 5,
      salesmanKhataId: 5,
      items: [
        {
          productId: 1,
          productSku: prod1.sku,
          productName: prod1.name,
          packName: "Pack",
          unitsPerPack: prod1.bottlesPerPack,
          wholesalePackPricePaisa: prod1.wholesalePackPricePaisa,
          isGlass: false,
          dispatchedPacks: 40,
          dispatchedLoose: 0,
          totalDispatchedBase: 40 * prod1.bottlesPerPack,
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
    });

    // Van B (Rashid Mahmood, id 6) loads 50 packs
    const dispatchB = await createTestDispatch({
      sheetNumber: "LOAD-VAN-B",
      salesmanId: 6,
      salesmanKhataId: 6,
      items: [
        {
          productId: 1,
          productSku: prod1.sku,
          productName: prod1.name,
          packName: "Pack",
          unitsPerPack: prod1.bottlesPerPack,
          wholesalePackPricePaisa: prod1.wholesalePackPricePaisa,
          isGlass: false,
          dispatchedPacks: 50,
          dispatchedLoose: 0,
          totalDispatchedBase: 50 * prod1.bottlesPerPack,
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
    });

    // Multi-pass edits on Van A:
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatchA.id,
      status: "SETTLED",
      items: [{ productId: 1, dispatchedPacks: 45, dispatchedLoose: 0, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 3000000,
    });

    // Multi-pass edits on Van B:
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatchB.id,
      status: "SETTLED",
      items: [{ productId: 1, dispatchedPacks: 55, dispatchedLoose: 0, returnedIntactPacks: 15, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 4000000,
    });

    // Van A net out = 45 - 10 = 35 packs
    // Van B net out = 55 - 15 = 40 packs
    // Total net out = 75 packs
    const currentWarehouseStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    expect(currentWarehouseStock).toBe(initialGlobalP1 - 75);

    // Global conservation invariant:
    const sheetA = useLogisticsStore.getState().getDailyDispatchById(dispatchA.id)!;
    const sheetB = useLogisticsStore.getState().getDailyDispatchById(dispatchB.id)!;
    const netOutA = sheetA.items[0].dispatchedPacks - sheetA.items[0].returnedIntactPacks;
    const netOutB = sheetB.items[0].dispatchedPacks - sheetB.items[0].returnedIntactPacks;

    expect(currentWarehouseStock + netOutA + netOutB).toBe(initialGlobalP1);
  });
});
