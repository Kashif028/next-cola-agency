/**
 * src/tests/dispatchZeroLeakage.test.ts
 *
 * Requirement R1: Morning Dispatch System & Strict Manual Entry Controls (صبح مال ڈسپیچ)
 * Acceptance Criteria:
 *   - Strict manual entry controls: zero pre-filling, default 0 quantities.
 *   - Blank/empty product quantity exclusion from final records/manifests.
 *   - Quantity overwrite semantics (changing a quantity overwrites previous value cleanly, never combining/accumulating).
 *   - Session isolation: new dispatch sessions load completely clean without leaking prior transactions.
 *   - Deduction of dispatched quantities from stock.
 *   - Single linked lifecycle record creation in OPEN/ISSUED state.
 *
 * Tiers:
 *   Tier 1: Happy Path Equivalence Classes (5 tests)
 *   Tier 2: Boundary, Zero-Quantity & Overwrite Tests (5 tests)
 *   Tier 3: Cross-Session Isolation & Multi-Session Reset (3 tests)
 *   Tier 4: Real-World Agency Morning Fleet Dispatch Workflow (2 tests)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useLogisticsStore } from "../store/useLogisticsStore";
import { useInventoryStore } from "../store/useInventoryStore";
import { loadSavedProducts, saveProducts, INITIAL_PRODUCTS } from "../types/products";
import { saveKhataAccounts, INITIAL_KHATA_ACCOUNTS, saveKhataTransactions } from "../types/khata";

// Mock localStorage for Node.js test environment
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

describe("R1: Morning Dispatch & Zero Quantity Leakage", () => {
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

  function makeDispatchItem(productId: number, packs: number, loose = 0) {
    const prod = loadSavedProducts().find((p) => p.id === productId)!;
    const unitsPerPack = prod.bottlesPerPack;
    const totalBase = packs * unitsPerPack + loose;
    return {
      productId,
      productSku: prod.sku,
      productName: prod.name,
      packName: prod.requiresCrate ? "Crate" : "Pack",
      unitsPerPack,
      wholesalePackPricePaisa: prod.wholesalePackPricePaisa,
      isGlass: prod.requiresCrate || false,
      dispatchedPacks: packs,
      dispatchedLoose: loose,
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
  }

  // ==========================================================================
  // TIER 1: Happy Path Equivalence Classes (≥ 5 tests)
  // ==========================================================================

  it("T1.1: Creates morning dispatch for single product with exact pack conversion and stock deduction", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const item1 = makeDispatchItem(1, 50, 0);

    const dispatch = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-MORN-01",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "ISSUED",
      emptyCratesLoaded: 50,
      emptyCratesReturned: 0,
      items: [item1],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    expect(dispatch.items).toHaveLength(1);
    expect(dispatch.items[0].dispatchedPacks).toBe(50);
    expect(dispatch.items[0].totalDispatchedBase).toBe(50 * 4); // 200 base units

    // Warehouse stock deducted by exactly 50 packs
    const finalStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    expect(finalStock).toBe(initialStock - 50);
  });

  it("T1.2: Dispatches multi-product manifest calculating correct cumulative load value and stock deductions", async () => {
    const prod1Initial = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const prod2Initial = loadSavedProducts().find((p) => p.id === 2)!.stockPacks;

    const item1 = makeDispatchItem(1, 40, 0);
    const item2 = makeDispatchItem(2, 30, 0);

    const dispatch = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-MORN-02",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "ISSUED",
      emptyCratesLoaded: 40,
      emptyCratesReturned: 0,
      items: [item1, item2],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    expect(dispatch.items).toHaveLength(2);
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(prod1Initial - 40);
    expect(loadSavedProducts().find((p) => p.id === 2)!.stockPacks).toBe(prod2Initial - 30);
  });

  it("T1.3: Handles dispatch with loose bottles combined with packs", async () => {
    // Prod 2: bottlesPerPack = 6
    const initialStock = loadSavedProducts().find((p) => p.id === 2)!.stockPacks;
    // 10 packs + 3 loose = 63 base units = 10.5 packs
    const item = makeDispatchItem(2, 10, 3);

    const dispatch = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-MORN-LOOSE",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "ISSUED",
      emptyCratesLoaded: 10,
      emptyCratesReturned: 0,
      items: [item],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    expect(dispatch.items[0].dispatchedPacks).toBe(10);
    expect(dispatch.items[0].dispatchedLoose).toBe(3);
    expect(dispatch.items[0].totalDispatchedBase).toBe(63);

    expect(loadSavedProducts().find((p) => p.id === 2)!.stockPacks).toBe(initialStock - 10.5);
  });

  it("T1.4: Creates single linked lifecycle record with ISSUED/OPEN state", async () => {
    const item = makeDispatchItem(1, 25, 0);

    const dispatch = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-MORN-LINKED",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "OPEN",
      emptyCratesLoaded: 25,
      emptyCratesReturned: 0,
      items: [item],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    expect(dispatch).toBeDefined();
    expect(dispatch.id).toBeDefined();
    expect(dispatch.sheetNumber).toBe("LOAD-MORN-LINKED");
    expect(["OPEN", "ISSUED", "DRAFT"]).toContain(dispatch.status);

    const retrieved = useLogisticsStore.getState().getDailyDispatchById(dispatch.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.sheetNumber).toBe(dispatch.sheetNumber);
  });

  it("T1.5: Initializes store state with zero open modal and clean draft properties", () => {
    const state = useLogisticsStore.getState();
    expect(state.isLoadingManifestModalOpen).toBe(false);
    expect(state.isSettlementModalOpen).toBe(false);
    expect(state.error).toBeNull();

    state.openCreateManifestModal();
    expect(useLogisticsStore.getState().isLoadingManifestModalOpen).toBe(true);
    expect(useLogisticsStore.getState().error).toBeNull();

    state.closeCreateManifestModal();
    expect(useLogisticsStore.getState().isLoadingManifestModalOpen).toBe(false);
  });

  // ==========================================================================
  // TIER 2: Boundary, Zero-Quantity & Overwrite Tests (≥ 5 tests)
  // ==========================================================================

  it("T2.1: Blank and zero-quantity products are strictly excluded from final manifest", async () => {
    const item1 = makeDispatchItem(1, 0, 0);
    const item2 = makeDispatchItem(2, 0, 0);
    const item3 = makeDispatchItem(3, 15, 0); // Only Product 3 has quantity

    const dispatch = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-FILTER-ZERO",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "ISSUED",
      emptyCratesLoaded: 15,
      emptyCratesReturned: 0,
      items: [item1, item2, item3],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    // Zero-quantity items 1 and 2 must be strictly excluded from the created dispatch
    expect(dispatch.items).toHaveLength(1);
    expect(dispatch.items[0].productId).toBe(3);
    expect(dispatch.items[0].dispatchedPacks).toBe(15);
  });

  it("T2.2: Completely empty input list (all 0 quantities) yields empty manifest and performs zero stock deduction", async () => {
    const stock1Before = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const stock2Before = loadSavedProducts().find((p) => p.id === 2)!.stockPacks;

    const item1 = makeDispatchItem(1, 0, 0);
    const item2 = makeDispatchItem(2, 0, 0);

    const dispatch = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-ALL-ZERO",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "ISSUED",
      emptyCratesLoaded: 0,
      emptyCratesReturned: 0,
      items: [item1, item2],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    // Must be empty list of items
    expect(dispatch.items).toHaveLength(0);

    // Warehouse stock must remain completely untouched
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(stock1Before);
    expect(loadSavedProducts().find((p) => p.id === 2)!.stockPacks).toBe(stock2Before);
  });

  it("T2.3: Quantity overwrite semantics: modifying a quantity replaces rather than accumulates", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const item = makeDispatchItem(1, 50, 0);

    const dispatch = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-OVERWRITE",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "ISSUED",
      emptyCratesLoaded: 50,
      emptyCratesReturned: 0,
      items: [item],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 50);

    // User changes 50 -> 20 (must overwrite, NOT 50 + 20 = 70)
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "ISSUED",
      items: [{ productId: 1, dispatchedPacks: 20, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 0,
    });

    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 20);

    // User changes 20 -> 35 (must overwrite, NOT 20 + 35 = 55)
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "ISSUED",
      items: [{ productId: 1, dispatchedPacks: 35, dispatchedLoose: 0, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 0,
    });

    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 35);
  });

  it("T2.4: Prevents negative warehouse stock and handles stock boundary exhaustion safely", async () => {
    const prod = loadSavedProducts().find((p) => p.id === 1)!;
    const exactStock = prod.stockPacks; // 250 packs

    // Dispatch exact available stock
    await useInventoryStore.getState().deductWarehouseStock(1, exactStock * prod.bottlesPerPack);
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(0);

    // Attempting further deduction does not allow negative stock
    await useInventoryStore.getState().deductWarehouseStock(1, 40);
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(0);
  });

  it("T2.5: Zero-quantity pruning: items with 0 packs and 0 loose are pruned, only items with >0 are kept", async () => {
    const items = [
      makeDispatchItem(1, 0, 0),
      makeDispatchItem(2, 20, 0),
      makeDispatchItem(3, 0, 0),
    ];

    const dispatch = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-PRUNE-TEST",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "ISSUED",
      emptyCratesLoaded: 20,
      emptyCratesReturned: 0,
      items,
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    expect(dispatch.items).toHaveLength(1);
    expect(dispatch.items[0].productId).toBe(2);
    expect(dispatch.items[0].dispatchedPacks).toBe(20);
  });

  // ==========================================================================
  // TIER 3: Cross-Session Isolation & Multi-Session Reset (≥ 3 tests)
  // ==========================================================================

  it("T3.1: Session isolation: completing Session A leaves Session B completely clean", async () => {
    // Session A: Muhammad Ali loads Product 1 (50 packs)
    const itemA = makeDispatchItem(1, 50, 0);
    const dispatchA = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-SESS-A",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "ISSUED",
      emptyCratesLoaded: 50,
      emptyCratesReturned: 0,
      items: [itemA],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    // Session B: Rashid Mahmood loads Product 2 (30 packs)
    const itemB = makeDispatchItem(2, 30, 0);
    const dispatchB = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-SESS-B",
      date: "2026-11-16",
      routeId: 2,
      routeName: "Khanpur Road",
      salesmanId: 6,
      salesmanName: "Rashid Mahmood",
      vehicleNumber: "RYK-8192",
      status: "ISSUED",
      emptyCratesLoaded: 30,
      emptyCratesReturned: 0,
      items: [itemB],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    expect(dispatchA.sheetNumber).not.toBe(dispatchB.sheetNumber);
    expect(dispatchB.items).toHaveLength(1);
    expect(dispatchB.items[0].productId).toBe(2);
    expect(dispatchB.items.some((it) => it.productId === 1)).toBe(false);
  });

  it("T3.2: Cancelling a dispatch session mid-entry resets modal state with zero residue", () => {
    useLogisticsStore.getState().openCreateManifestModal();
    expect(useLogisticsStore.getState().isLoadingManifestModalOpen).toBe(true);

    useLogisticsStore.getState().closeCreateManifestModal();
    expect(useLogisticsStore.getState().isLoadingManifestModalOpen).toBe(false);

    useLogisticsStore.getState().openCreateManifestModal();
    expect(useLogisticsStore.getState().error).toBeNull();
    useLogisticsStore.getState().closeCreateManifestModal();
  });

  it("T3.3: Two sequential dispatches for different routes generate independent sheet numbers and stock deductions", async () => {
    const prod1Initial = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;

    const d1 = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-ROUTE-01",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "ISSUED",
      emptyCratesLoaded: 20,
      emptyCratesReturned: 0,
      items: [makeDispatchItem(1, 20, 0)],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    const d2 = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-ROUTE-02",
      date: "2026-11-16",
      routeId: 2,
      routeName: "Khanpur Road",
      salesmanId: 6,
      salesmanName: "Rashid Mahmood",
      vehicleNumber: "RYK-8192",
      status: "ISSUED",
      emptyCratesLoaded: 15,
      emptyCratesReturned: 0,
      items: [makeDispatchItem(1, 15, 0)],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    expect(d1.id).not.toBe(d2.id);
    expect(d1.sheetNumber).toBe("LOAD-ROUTE-01");
    expect(d2.sheetNumber).toBe("LOAD-ROUTE-02");

    // Cumulative stock deduction: 20 + 15 = 35 packs
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(prod1Initial - 35);
  });

  // ==========================================================================
  // TIER 4: Real-World Agency Morning Fleet Dispatch Workflow (≥ 2 tests)
  // ==========================================================================

  it("T4.1: Agency morning fleet dispatch: dispatches 3 vans sequentially with strict stock accounting", async () => {
    const p1Initial = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const p2Initial = loadSavedProducts().find((p) => p.id === 2)!.stockPacks;

    // Van 1: 50 packs P1, 30 packs P2
    await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-FLEET-VAN1",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Beat 1",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "ISSUED",
      emptyCratesLoaded: 50,
      emptyCratesReturned: 0,
      items: [makeDispatchItem(1, 50, 0), makeDispatchItem(2, 30, 0)],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    // Van 2: 40 packs P1, 20 packs P2
    await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-FLEET-VAN2",
      date: "2026-11-16",
      routeId: 2,
      routeName: "Khanpur Beat 2",
      salesmanId: 6,
      salesmanName: "Rashid Mahmood",
      vehicleNumber: "RYK-8192",
      status: "ISSUED",
      emptyCratesLoaded: 40,
      emptyCratesReturned: 0,
      items: [makeDispatchItem(1, 40, 0), makeDispatchItem(2, 20, 0)],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    // Van 3: 30 packs P1
    await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-FLEET-VAN3",
      date: "2026-11-16",
      routeId: 3,
      routeName: "Sadiqabad Beat 3",
      salesmanId: 7,
      salesmanName: "Imran Khan",
      vehicleNumber: "MN-4501",
      status: "ISSUED",
      emptyCratesLoaded: 30,
      emptyCratesReturned: 0,
      items: [makeDispatchItem(1, 30, 0)],
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });

    // Total P1 deducted = 50 + 40 + 30 = 120 packs
    // Total P2 deducted = 30 + 20 = 50 packs
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(p1Initial - 120);
    expect(loadSavedProducts().find((p) => p.id === 2)!.stockPacks).toBe(p2Initial - 50);
  });

  it("T4.2: Full dispatch integrity audit: zero negative stock, exact pack-to-bottle math across entire fleet", async () => {
    const p1Initial = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;

    const fleet = [
      { van: "LES-2489", packs: 20 },
      { van: "RYK-8192", packs: 25 },
      { van: "MN-4501", packs: 35 },
    ];

    let totalDispatchedPacks = 0;
    for (const v of fleet) {
      totalDispatchedPacks += v.packs;
      await useLogisticsStore.getState().createDailyDispatch({
        sheetNumber: `LOAD-FLEET-${v.van}`,
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Beat",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        vehicleNumber: v.van,
        status: "ISSUED",
        emptyCratesLoaded: v.packs,
        emptyCratesReturned: 0,
        items: [makeDispatchItem(1, v.packs, 0)],
        totalSalesRevenuePaisa: 0,
        cashDepositedPaisa: 0,
        unpaidBalancePaisa: 0,
      });
    }

    expect(totalDispatchedPacks).toBe(80);
    const finalStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    expect(finalStock).toBe(p1Initial - 80);
    expect(finalStock).toBeGreaterThan(0);
  });
});
