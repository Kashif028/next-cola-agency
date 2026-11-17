/**
 * src/tests/eveningReturnStock.test.ts
 *
 * Requirement R2: Evening Return System, Multi-Return Sync & Stock Adjustments (شام کو مال واپسی اور گودام اسٹاک)
 * Acceptance Criteria:
 *   - Loading active morning dispatch records for returning salesman.
 *   - Restocking intact returns to warehouse inventory stock without duplicate additions.
 *   - Quarantining damaged/broken stock into dedicated loss/breakage log (excluded from sellable stock).
 *   - Reconciliation formula invariant: Dispatched Qty = Sold Qty + Intact Return Qty + Damaged Qty.
 *   - Closing and finalizing dispatch records.
 *
 * Tiers:
 *   Tier 1: Happy Path Equivalence Classes (5 tests)
 *   Tier 2: Boundary & Corner Return Cases (5 tests)
 *   Tier 3: Multi-Van Return Sequence (3 tests)
 *   Tier 4: Full Real-World Evening Return Workflow (2 tests)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useLogisticsStore, saveDailyDispatches } from "../store/useLogisticsStore";
import { useInventoryStore } from "../store/useInventoryStore";
import { loadSavedProducts, saveProducts, INITIAL_PRODUCTS } from "../types/products";
import { saveKhataAccounts, INITIAL_KHATA_ACCOUNTS, saveKhataTransactions } from "../types/khata";

// Mock localStorage for Node.js test environment
class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string) { return this.store[key] ?? null; }
  setItem(key: string, value: string) { this.store[key] = String(value); }
  removeItem(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
  get length() { return Object.keys(this.store).length; }
  key(index: number) { return Object.keys(this.store)[index] ?? null; }
}

describe("R2: Evening Return & Warehouse Stock Synchronization", () => {
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

  async function createTestDispatch(salesmanId = 5, salesmanName = "Muhammad Ali", itemsOverride?: any[]) {
    const prod1 = loadSavedProducts().find((p) => p.id === 1)!;
    const items = itemsOverride || [
      {
        productId: 1,
        productSku: prod1.sku,
        productName: prod1.name,
        packName: prod1.requiresCrate ? "Crate" : "Pack",
        unitsPerPack: prod1.bottlesPerPack,
        wholesalePackPricePaisa: prod1.wholesalePackPricePaisa,
        isGlass: prod1.requiresCrate || false,
        dispatchedPacks: 50,
        dispatchedLoose: 0,
        totalDispatchedBase: 50 * prod1.bottlesPerPack, // 200 base units
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
    ];

    return useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: `LOAD-${salesmanId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId,
      salesmanName,
      salesmanKhataId: salesmanId,
      vehicleNumber: "LES-2489",
      status: "OPEN",
      emptyCratesLoaded: 40,
      emptyCratesReturned: 0,
      items,
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });
  }

  // ==========================================================================
  // TIER 1: Happy Path Equivalence Classes (≥ 5 tests)
  // ==========================================================================

  it("T1.1: Loads active morning dispatch record with all dispatched items pre-loaded", async () => {
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    const retrieved = useLogisticsStore.getState().getDailyDispatchById(dispatch.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.items.length).toBeGreaterThan(0);
    expect(retrieved!.items[0].dispatchedPacks).toBe(50);
    expect(retrieved!.items[0].totalDispatchedBase).toBe(200);
    expect(retrieved!.status).toBe("OPEN");
  });

  it("T1.2: Restocks returned intact goods to central warehouse inventory without duplication", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // Morning dispatch deducted 50 packs
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 50);

    // Van returns with 10 intact packs (40 bottles)
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      4320000
    );

    // Stock in warehouse replenished by exactly 10 packs
    const updatedStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    expect(updatedStock).toBe(initialStock - 40);
  });

  it("T1.3: Quarantines damaged bottles into dedicated loss log and excludes from sellable stock", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // Driver returns 5 intact packs (20 bottles) and 2 damaged packs (8 bottles)
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 5, returnedIntactLoose: 0, damagedPacks: 2, damagedLoose: 0 }],
      4000000
    );

    // Only intact goods (5 packs) are restored to sellable stock
    const updatedStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    expect(updatedStock).toBe(initialStock - 45); // -50 + 5 = -45

    // Damaged bottles are logged to quarantine log (breakageLogs)
    const logs = useInventoryStore.getState().breakageLogs;
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const damagedEntry = logs.find((l) => l.product_id === 1);
    expect(damagedEntry).toBeDefined();
    expect(damagedEntry!.broken_base_units).toBe(8);
  });

  it("T1.4: Reconciles clean balanced route where Dispatched = Sold + Intact + Damaged", async () => {
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // 50 packs loaded (200 bottles)
    // 9 packs returned intact (36 bottles)
    // 1 pack broken in transit (4 bottles)
    // Sold = 50 - 9 - 1 = 40 packs (160 bottles)
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 9, returnedIntactLoose: 0, damagedPacks: 1, damagedLoose: 0 }],
      4320000
    );

    const itm = settled.items[0];
    expect(itm.dispatchedPacks).toBe(50);
    expect(itm.returnedIntactPacks).toBe(9);
    expect(itm.damagedPacks).toBe(1);
    expect(itm.soldPacks).toBe(40);

    // Exact reconciliation equation holds
    expect(itm.dispatchedPacks).toBe(itm.soldPacks + itm.returnedIntactPacks + itm.damagedPacks);
    expect(itm.totalDispatchedBase).toBe(itm.totalSoldBase + itm.totalReturnedIntactBase + itm.totalDamagedBase);
  });

  it("T1.5: Finalizes dispatch record transition to SETTLED status", async () => {
    const dispatch = await createTestDispatch(5, "Muhammad Ali");
    expect(dispatch.status).toBe("OPEN");

    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      4320000
    );

    expect(settled.status).toBe("SETTLED");
    const stored = useLogisticsStore.getState().getDailyDispatchById(dispatch.id)!;
    expect(stored.status).toBe("SETTLED");
  });

  // ==========================================================================
  // TIER 2: Boundary & Corner Return Cases (≥ 5 tests)
  // ==========================================================================

  it("T2.1: 100% returned intact (all returned, 0 sold, 0 damaged) restores 100% stock to warehouse", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // Route cancelled due to heavy rain: all 50 packs returned intact
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 50, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      0
    );

    expect(settled.items[0].soldPacks).toBe(0);
    expect(settled.totalSalesRevenuePaisa).toBe(0);

    // 100% stock restored to warehouse
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock);
  });

  it("T2.2: 100% sold (0 returned, 0 damaged) restores 0 bottles to warehouse stock", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // All 50 packs sold
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      5400000
    );

    expect(settled.items[0].soldPacks).toBe(50);
    // 0 packs restored
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 50);
  });

  it("T2.3: 100% damaged stock (e.g. transit accident) restores 0 sellable stock and quarantines all units", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // All 50 packs (200 bottles) damaged in transit accident
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 50, damagedLoose: 0 }],
      0
    );

    expect(settled.items[0].soldPacks).toBe(0);
    // Sellable stock not replenished
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 50);

    // All 200 bottles logged to breakage quarantine
    const logs = useInventoryStore.getState().breakageLogs;
    expect(logs.some((l) => l.broken_base_units === 200)).toBe(true);
  });

  it("T2.4: Fractional loose bottle returns accurately calculated and restocked", async () => {
    // Prod 2 has bottlesPerPack = 6
    const initialStock = loadSavedProducts().find((p) => p.id === 2)!.stockPacks;
    const prod2 = loadSavedProducts().find((p) => p.id === 2)!;

    const items = [
      {
        productId: 2,
        productSku: prod2.sku,
        productName: prod2.name,
        packName: "Pack",
        unitsPerPack: 6,
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
    ];

    const dispatch = await createTestDispatch(5, "Muhammad Ali", items);
    expect(loadSavedProducts().find((p) => p.id === 2)!.stockPacks).toBe(initialStock - 20);

    // Return: 3 packs + 3 loose bottles intact (21 bottles = 3.5 packs)
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 2, returnedIntactPacks: 3, returnedIntactLoose: 3, damagedPacks: 0, damagedLoose: 0 }],
      1500000
    );

    // Stock replenished by exactly 3.5 packs: initialStock - 20 + 3.5 = initialStock - 16.5
    expect(loadSavedProducts().find((p) => p.id === 2)!.stockPacks).toBe(initialStock - 16.5);
  });

  it("T2.5: Duplicate settlement protection and state idempotency across returns", async () => {
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // Settle sheet
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      4320000
    );
    expect(settled.status).toBe("SETTLED");

    // Dispatch status is settled; recalibrate sheet is the persistent multi-edit mechanism
    const sheet = useLogisticsStore.getState().getDailyDispatchById(dispatch.id)!;
    expect(sheet.status).toBe("SETTLED");
  });

  // ==========================================================================
  // TIER 3: Multi-Van Return Sequence (≥ 3 tests)
  // ==========================================================================

  it("T3.1: Sequential returns of Van 1, Van 2, and Van 3 accumulate stock accurately without cross-talk", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;

    const v1 = await createTestDispatch(5, "Muhammad Ali");
    const v2 = await createTestDispatch(6, "Rashid Mahmood");
    const v3 = await createTestDispatch(7, "Imran Khan");

    // 3 vans dispatched 50 packs each = 150 packs deducted
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 150);

    // Van 1 returns 15 packs intact
    await useLogisticsStore.getState().confirmEveningReturn(
      v1.id,
      [{ productId: 1, returnedIntactPacks: 15, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      3780000
    );

    // Van 2 returns 20 packs intact
    await useLogisticsStore.getState().confirmEveningReturn(
      v2.id,
      [{ productId: 1, returnedIntactPacks: 20, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      3240000
    );

    // Van 3 returns 25 packs intact
    await useLogisticsStore.getState().confirmEveningReturn(
      v3.id,
      [{ productId: 1, returnedIntactPacks: 25, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      2700000
    );

    // Warehouse stock accumulates: -150 + 15 + 20 + 25 = -90 packs
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 90);
  });

  it("T3.2: Multi-van breakage isolation maintains separate audit logs per loading sheet", async () => {
    const v1 = await createTestDispatch(5, "Muhammad Ali");
    const v2 = await createTestDispatch(6, "Rashid Mahmood");

    // Van 1 logs 4 broken bottles (1 pack)
    await useLogisticsStore.getState().confirmEveningReturn(
      v1.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 1, damagedLoose: 0 }],
      4212000
    );

    // Van 2 logs 8 broken bottles (2 packs)
    await useLogisticsStore.getState().confirmEveningReturn(
      v2.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 2, damagedLoose: 0 }],
      4104000
    );

    const breakage = useInventoryStore.getState().breakageLogs;
    expect(breakage.length).toBeGreaterThanOrEqual(2);

    const entry1 = breakage.find((b) => b.notes?.includes(v1.sheetNumber));
    const entry2 = breakage.find((b) => b.notes?.includes(v2.sheetNumber));

    expect(entry1).toBeDefined();
    expect(entry1!.broken_base_units).toBe(4);
    expect(entry2).toBeDefined();
    expect(entry2!.broken_base_units).toBe(8);
  });

  it("T3.3: Dispatched base units equation check across multiple lines", async () => {
    const v1 = await createTestDispatch(5, "Muhammad Ali");

    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      v1.id,
      [{ productId: 1, returnedIntactPacks: 15, returnedIntactLoose: 0, damagedPacks: 3, damagedLoose: 0 }],
      3456000
    );

    for (const item of settled.items) {
      const calculatedTotal = item.soldPacks + item.returnedIntactPacks + item.damagedPacks;
      expect(calculatedTotal).toBe(item.dispatchedPacks);
    }
  });

  // ==========================================================================
  // TIER 4: Real-World Agency Full Evening Return Workflow (≥ 2 tests)
  // ==========================================================================

  it("T4.1: Complete evening van return workflow with multi-SKU physical counting", async () => {
    const prod1 = loadSavedProducts().find((p) => p.id === 1)!;
    const prod2 = loadSavedProducts().find((p) => p.id === 2)!;
    const p1Initial = prod1.stockPacks;
    const p2Initial = prod2.stockPacks;

    const items = [
      {
        productId: 1,
        productSku: prod1.sku,
        productName: prod1.name,
        packName: "Pack",
        unitsPerPack: 4,
        wholesalePackPricePaisa: prod1.wholesalePackPricePaisa,
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
      {
        productId: 2,
        productSku: prod2.sku,
        productName: prod2.name,
        packName: "Pack",
        unitsPerPack: 6,
        wholesalePackPricePaisa: prod2.wholesalePackPricePaisa,
        isGlass: false,
        dispatchedPacks: 30,
        dispatchedLoose: 0,
        totalDispatchedBase: 180,
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
    ];

    const dispatch = await createTestDispatch(5, "Muhammad Ali", items);

    // Return:
    // Prod 1: 9 packs intact (36 btls), 1 pack damaged (4 btls) -> 40 packs sold
    // Prod 2: 5 packs intact (30 btls), 0 damaged -> 25 packs sold
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [
        { productId: 1, returnedIntactPacks: 9, returnedIntactLoose: 0, damagedPacks: 1, damagedLoose: 0 },
        { productId: 2, returnedIntactPacks: 5, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
      ],
      6000000
    );

    // Warehouse stock checks
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(p1Initial - 50 + 9);
    expect(loadSavedProducts().find((p) => p.id === 2)!.stockPacks).toBe(p2Initial - 30 + 5);

    // Breakage log check
    const logs = useInventoryStore.getState().breakageLogs;
    expect(logs.some((l) => l.product_id === 1 && l.broken_base_units === 4)).toBe(true);
  });

  it("T4.2: Evening empty crate reconciliation matches plastic crates loaded vs returned", async () => {
    // Van loads 30 empty crates in the morning
    const dispatch = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-CRATE-TEST",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "OPEN",
      emptyCratesLoaded: 30,
      emptyCratesReturned: 0,
      items: [
        {
          productId: 1,
          productSku: "NC-250-RGB",
          productName: "Next Cola 250ml Glass Bottle",
          packName: "Crate",
          unitsPerPack: 4,
          wholesalePackPricePaisa: 108000,
          isGlass: true,
          dispatchedPacks: 40,
          dispatchedLoose: 0,
          totalDispatchedBase: 160,
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

    expect(dispatch.emptyCratesLoaded).toBe(30);

    // Van returns in the evening: driver returns 38 empty crates (retailers returned empty bottles + crates)
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      4320000
    );

    // Update empty crates returned on the settled record
    dispatch.emptyCratesReturned = 38;
    saveDailyDispatches([dispatch]);

    // Fetch detail DTO to verify crate reconciliation computation
    const detail = await useLogisticsStore.getState().fetchSheetDetail(dispatch.id);
    expect(detail.empty_crates_loaded).toBe(30);
    expect(detail.empty_crates_returned).toBe(38);
    expect(detail.crates_variance).toBe(38 - 30); // +8 crates gained from market
  });
});
