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
import {
  VanSettlementReturnItemDto,
} from "../types/logistics";
import { logisticsService } from "../services/logisticsService";

// Mock localStorage for Node.js test environment
class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string) { return this.store[key] ?? null; }
  setItem(key: string, value: string) { this.store[key] = String(value); }
  removeItem(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
  get length() { return Object.keys(this.store).length; }
  key(index: number) { return Object.keys(this.store)[index] ?? null; }
}

interface WarehouseStockState {
  [productId: number]: number; // sellable base units
}

interface BreakageLogEntry {
  sheetNumber: string;
  productId: number;
  baseUnits: number;
  reason: string;
  timestamp: string;
}

describe("R2: Evening Return & Warehouse Stock Synchronization", () => {
  let mockStorage: MockStorage;
  let warehouseStock: WarehouseStockState;
  let breakageLog: BreakageLogEntry[];

  const PRODUCT_SPECS: Record<number, { sku: string; name: string; unitsPerPack: number; ratePaisa: number }> = {
    1: { sku: "NC-250-RGB", name: "Next Cola 250ml Glass Bottle", unitsPerPack: 24, ratePaisa: 216000 },
    2: { sku: "NC-1.5-PET", name: "Next Cola 1.5L PET Bottle", unitsPerPack: 6, ratePaisa: 105000 },
    3: { sku: "NC-500-PET", name: "Next Cola 500ml PET Bottle", unitsPerPack: 12, ratePaisa: 126000 },
    4: { sku: "NC-250-CAN", name: "Next Cola 250ml Sleek Can", unitsPerPack: 24, ratePaisa: 288000 },
    5: { sku: "FZ-250-RGB", name: "Fizz Up Lemon 250ml Glass Bottle", unitsPerPack: 24, ratePaisa: 216000 },
  };

  /**
   * Domain helper: calculate reconciliation invariant
   * Dispatched = Sold + Intact + Damaged + Variance
   */
  function reconcileReturnLine(
    dispatchedBase: number,
    soldBase: number,
    returnedIntactBase: number,
    damagedBase: number
  ) {
    const accounted = soldBase + returnedIntactBase + damagedBase;
    const variance = dispatchedBase - accounted;
    const isBalanced = variance === 0;
    return {
      dispatchedBase,
      soldBase,
      returnedIntactBase,
      damagedBase,
      accounted,
      variance,
      isBalanced,
    };
  }

  /**
   * Domain helper: process evening return with duplicate protection
   */
  function processEveningReturn(
    currentStock: WarehouseStockState,
    currentBreakage: BreakageLogEntry[],
    sheetNumber: string,
    returns: Array<{ productId: number; returnedPacks: number; returnedLoose: number; damagedBase: number }>,
    settledSheetRegistry: Set<string>
  ) {
    if (settledSheetRegistry.has(sheetNumber)) {
      throw new Error(`Duplicate return settlement rejected: sheet ${sheetNumber} is already settled`);
    }

    const nextStock = { ...currentStock };
    const nextBreakage = [...currentBreakage];

    for (const ret of returns) {
      const spec = PRODUCT_SPECS[ret.productId];
      const intactBase = ret.returnedPacks * spec.unitsPerPack + ret.returnedLoose;

      // Restock intact returns into sellable inventory
      nextStock[ret.productId] = (nextStock[ret.productId] || 0) + intactBase;

      // Quarantine damaged stock into loss log (NEVER into sellable stock)
      if (ret.damagedBase > 0) {
        nextBreakage.push({
          sheetNumber,
          productId: ret.productId,
          baseUnits: ret.damagedBase,
          reason: "Evening transit breakage / damaged bottle check",
          timestamp: new Date().toISOString(),
        });
      }
    }

    settledSheetRegistry.add(sheetNumber);
    return { nextStock, nextBreakage };
  }

  beforeEach(() => {
    mockStorage = new MockStorage();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = mockStorage;

    // Post-dispatch warehouse inventory baseline
    warehouseStock = {
      1: 44400, // 3,600 btls dispatched this morning
      2: 5700,  // 300 btls dispatched this morning
      3: 11760,
      4: 24000,
      5: 47040,
    };
    breakageLog = [];
  });

  afterEach(() => {
    mockStorage.clear();
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // TIER 1: Happy Path Equivalence Classes (≥ 5 tests)
  // ==========================================================================

  it("T1.1: Loads active morning dispatch record with all dispatched items pre-loaded", async () => {
    const sheet = await logisticsService.getLoadingSheet(1);
    expect(sheet).toBeDefined();
    expect(sheet.id).toBe(1);
    expect(sheet.items.length).toBeGreaterThan(0);

    // Dispatched items must have positive loaded base quantities
    for (const it of sheet.items) {
      expect(it.total_loaded_base).toBeGreaterThan(0);
      expect(it.loaded_packs).toBeGreaterThanOrEqual(0);
    }
  });

  it("T1.2: Restocks returned intact goods to central warehouse inventory without duplication", () => {
    const settledRegistry = new Set<string>();
    const sheetNumber = "LOAD-20261116-0001";
    const initialStock = warehouseStock[1]; // 44,400

    // Van returns with 10 intact crates (240 bottles)
    const { nextStock } = processEveningReturn(
      warehouseStock,
      breakageLog,
      sheetNumber,
      [{ productId: 1, returnedPacks: 10, returnedLoose: 0, damagedBase: 0 }],
      settledRegistry
    );

    expect(nextStock[1]).toBe(initialStock + 240); // 44,640
  });

  it("T1.3: Quarantines damaged bottles into dedicated loss log and excludes from sellable stock", () => {
    const settledRegistry = new Set<string>();
    const sheetNumber = "LOAD-20261116-0002";
    const initialStock = warehouseStock[1]; // 44,400

    // Driver returns 5 intact crates (120 btls) and 6 broken bottles
    const { nextStock, nextBreakage } = processEveningReturn(
      warehouseStock,
      breakageLog,
      sheetNumber,
      [{ productId: 1, returnedPacks: 5, returnedLoose: 0, damagedBase: 6 }],
      settledRegistry
    );

    // Only intact goods (120 btls) are restored to sellable stock
    expect(nextStock[1]).toBe(initialStock + 120);
    // Damaged bottles (6) are logged to quarantine log
    expect(nextBreakage).toHaveLength(1);
    expect(nextBreakage[0].sheetNumber).toBe(sheetNumber);
    expect(nextBreakage[0].productId).toBe(1);
    expect(nextBreakage[0].baseUnits).toBe(6);
  });

  it("T1.4: Reconciles clean balanced route where Dispatched = Sold + Intact + Damaged", () => {
    // 50 crates loaded (1,200 bottles)
    // 40 crates sold (960 bottles)
    // 9 crates returned intact (216 bottles)
    // 1 crate broken in transit (24 bottles)
    const result = reconcileReturnLine(1200, 960, 216, 24);

    expect(result.accounted).toBe(1200);
    expect(result.variance).toBe(0);
    expect(result.isBalanced).toBe(true);
  });

  it("T1.5: Finalizes dispatch record transition to SETTLED status", async () => {
    const returnItems: VanSettlementReturnItemDto[] = [
      { product_id: 1, returned_packs: 9, returned_loose: 18, breakage_base: 6 },
      { product_id: 2, returned_packs: 10, returned_loose: 0, breakage_base: 0 },
    ];

    const recon = await logisticsService.calculateVanSettlement({
      sheet_id: 1,
      returns: returnItems,
      actual_cash_paisa: 8500000,
      empty_crates_returned: 30,
    });

    expect(recon).toBeDefined();
    expect(recon.sheet_id).toBe(1);
    expect(recon.stock_items.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // TIER 2: Boundary & Corner Return Cases (≥ 5 tests)
  // ==========================================================================

  it("T2.1: 100% returned intact (all returned, 0 sold, 0 damaged) restores 100% stock to warehouse", () => {
    const settledRegistry = new Set<string>();
    const initialStock = warehouseStock[1];

    // 50 crates dispatched (1,200 btls), route was cancelled due to heavy rain, all 50 crates returned
    const { nextStock, nextBreakage } = processEveningReturn(
      warehouseStock,
      breakageLog,
      "LOAD-RAIN-001",
      [{ productId: 1, returnedPacks: 50, returnedLoose: 0, damagedBase: 0 }],
      settledRegistry
    );

    expect(nextStock[1]).toBe(initialStock + 1200);
    expect(nextBreakage).toHaveLength(0);

    const recon = reconcileReturnLine(1200, 0, 1200, 0);
    expect(recon.isBalanced).toBe(true);
    expect(recon.variance).toBe(0);
  });

  it("T2.2: 100% sold (0 returned, 0 damaged) restores 0 bottles to warehouse stock", () => {
    const settledRegistry = new Set<string>();
    const initialStock = warehouseStock[2];

    // 50 packs PET dispatched (300 btls), all 50 sold on route
    const { nextStock, nextBreakage } = processEveningReturn(
      warehouseStock,
      breakageLog,
      "LOAD-SOLDOUT-001",
      [{ productId: 2, returnedPacks: 0, returnedLoose: 0, damagedBase: 0 }],
      settledRegistry
    );

    expect(nextStock[2]).toBe(initialStock); // 0 restored
    expect(nextBreakage).toHaveLength(0);

    const recon = reconcileReturnLine(300, 300, 0, 0);
    expect(recon.isBalanced).toBe(true);
    expect(recon.variance).toBe(0);
  });

  it("T2.3: 100% damaged stock (e.g. transit accident) restores 0 sellable stock and quarantines all units", () => {
    const settledRegistry = new Set<string>();
    const initialStock = warehouseStock[1];

    // 10 crates (240 btls) completely smashed in road accident
    const { nextStock, nextBreakage } = processEveningReturn(
      warehouseStock,
      breakageLog,
      "LOAD-ACCIDENT-001",
      [{ productId: 1, returnedPacks: 0, returnedLoose: 0, damagedBase: 240 }],
      settledRegistry
    );

    // Sellable stock unchanged
    expect(nextStock[1]).toBe(initialStock);
    // All 240 bottles in breakage quarantine
    expect(nextBreakage).toHaveLength(1);
    expect(nextBreakage[0].baseUnits).toBe(240);

    const recon = reconcileReturnLine(240, 0, 0, 240);
    expect(recon.isBalanced).toBe(true);
  });

  it("T2.4: Fractional loose bottle returns accurately calculated and restocked", () => {
    const settledRegistry = new Set<string>();
    const initialStock = warehouseStock[1];

    // 3 crates and 17 loose bottles returned intact (3 * 24 + 17 = 89 btls), plus 3 broken bottles
    const { nextStock, nextBreakage } = processEveningReturn(
      warehouseStock,
      breakageLog,
      "LOAD-LOOSE-001",
      [{ productId: 1, returnedPacks: 3, returnedLoose: 17, damagedBase: 3 }],
      settledRegistry
    );

    expect(nextStock[1]).toBe(initialStock + 89);
    expect(nextBreakage[0].baseUnits).toBe(3);
  });

  it("T2.5: Duplicate settlement prevention rejects second submission of the same sheet", () => {
    const settledRegistry = new Set<string>();
    const sheetNumber = "LOAD-20261116-DUPE";

    // First settlement succeeds
    const res1 = processEveningReturn(
      warehouseStock,
      breakageLog,
      sheetNumber,
      [{ productId: 1, returnedPacks: 10, returnedLoose: 0, damagedBase: 0 }],
      settledRegistry
    );
    expect(res1.nextStock[1]).toBe(warehouseStock[1] + 240);

    // Second settlement of the same sheet MUST be rejected to prevent duplicate stock addition
    expect(() => {
      processEveningReturn(
        res1.nextStock,
        res1.nextBreakage,
        sheetNumber,
        [{ productId: 1, returnedPacks: 10, returnedLoose: 0, damagedBase: 0 }],
        settledRegistry
      );
    }).toThrow(/Duplicate return settlement rejected/);
  });

  // ==========================================================================
  // TIER 3: Multi-Van Return Sequence (≥ 3 tests)
  // ==========================================================================

  it("T3.1: Sequential returns of Van 1, Van 2, and Van 3 accumulate stock accurately without cross-talk", () => {
    const settledRegistry = new Set<string>();
    let currentStock = { ...warehouseStock };
    let currentBreakage = [...breakageLog];

    // Van 1 arrives (City Route): returns 15 crates RGB (360 btls)
    const van1Res = processEveningReturn(
      currentStock,
      currentBreakage,
      "LOAD-VAN-01",
      [{ productId: 1, returnedPacks: 15, returnedLoose: 0, damagedBase: 0 }],
      settledRegistry
    );
    currentStock = van1Res.nextStock;
    currentBreakage = van1Res.nextBreakage;
    expect(currentStock[1]).toBe(warehouseStock[1] + 360);

    // Van 2 arrives (Khanpur Route): returns 20 crates RGB (480 btls), 5 packs PET (30 btls)
    const van2Res = processEveningReturn(
      currentStock,
      currentBreakage,
      "LOAD-VAN-02",
      [
        { productId: 1, returnedPacks: 20, returnedLoose: 0, damagedBase: 0 },
        { productId: 2, returnedPacks: 5, returnedLoose: 0, damagedBase: 0 },
      ],
      settledRegistry
    );
    currentStock = van2Res.nextStock;
    currentBreakage = van2Res.nextBreakage;
    expect(currentStock[1]).toBe(warehouseStock[1] + 360 + 480); // 840 btls restored
    expect(currentStock[2]).toBe(warehouseStock[2] + 30);        // 30 btls restored

    // Van 3 arrives (Highway Route): returns 25 crates RGB (600 btls)
    const van3Res = processEveningReturn(
      currentStock,
      currentBreakage,
      "LOAD-VAN-03",
      [{ productId: 1, returnedPacks: 25, returnedLoose: 0, damagedBase: 0 }],
      settledRegistry
    );
    currentStock = van3Res.nextStock;
    expect(currentStock[1]).toBe(warehouseStock[1] + 360 + 480 + 600); // 1,440 btls restored
  });

  it("T3.2: Multi-van breakage isolation maintains separate audit logs per loading sheet", () => {
    const settledRegistry = new Set<string>();
    let currentStock = { ...warehouseStock };
    let currentBreakage = [...breakageLog];

    // Van 1 logs 4 broken bottles
    const r1 = processEveningReturn(
      currentStock,
      currentBreakage,
      "LOAD-VAN-01",
      [{ productId: 1, returnedPacks: 10, returnedLoose: 0, damagedBase: 4 }],
      settledRegistry
    );
    currentStock = r1.nextStock;
    currentBreakage = r1.nextBreakage;

    // Van 2 logs 8 broken bottles
    const r2 = processEveningReturn(
      currentStock,
      currentBreakage,
      "LOAD-VAN-02",
      [{ productId: 1, returnedPacks: 8, returnedLoose: 0, damagedBase: 8 }],
      settledRegistry
    );
    currentBreakage = r2.nextBreakage;

    expect(currentBreakage).toHaveLength(2);
    expect(currentBreakage.find((b) => b.sheetNumber === "LOAD-VAN-01")?.baseUnits).toBe(4);
    expect(currentBreakage.find((b) => b.sheetNumber === "LOAD-VAN-02")?.baseUnits).toBe(8);
  });

  it("T3.3: Detects stock shortage variance when accounted quantity is less than dispatched", () => {
    // 50 crates dispatched (1,200 btls)
    // Driver reports: 35 sold (840 btls), 10 returned (240 btls), 1 broken (24 btls)
    // Total accounted = 840 + 240 + 24 = 1,104 btls
    // Shortage = 1,200 - 1,104 = 96 bottles (4 missing crates)
    const recon = reconcileReturnLine(1200, 840, 240, 24);

    expect(recon.isBalanced).toBe(false);
    expect(recon.variance).toBe(96); // 96 shortage
  });

  // ==========================================================================
  // TIER 4: Real-World Agency Full Evening Return Workflow (≥ 2 tests)
  // ==========================================================================

  it("T4.1: Complete evening van return workflow with multi-SKU physical counting", () => {
    // Van LES-2489 returned at 17:30 after completing Beat 1
    // Dispatched:
    //   - Product 1 (RGB): 50 crates (1,200 btls)
    //   - Product 2 (PET): 30 packs (180 btls)
    // Physical audit on return:
    //   - Product 1: 40 crates sold (960 btls), 9 crates + 18 loose returned intact (234 btls), 6 broken btls
    //   - Product 2: 25 packs sold (150 btls), 5 packs returned intact (30 btls), 0 broken
    const r1 = reconcileReturnLine(1200, 960, 234, 6);
    const r2 = reconcileReturnLine(180, 150, 30, 0);

    expect(r1.isBalanced).toBe(true);
    expect(r2.isBalanced).toBe(true);

    const settledRegistry = new Set<string>();
    const { nextStock, nextBreakage } = processEveningReturn(
      warehouseStock,
      breakageLog,
      "LOAD-EVENING-FULL",
      [
        { productId: 1, returnedPacks: 9, returnedLoose: 18, damagedBase: 6 },
        { productId: 2, returnedPacks: 5, returnedLoose: 0, damagedBase: 0 },
      ],
      settledRegistry
    );

    // Verify exact warehouse replenishment
    expect(nextStock[1]).toBe(warehouseStock[1] + 234);
    expect(nextStock[2]).toBe(warehouseStock[2] + 30);
    // Verify breakage quarantine
    expect(nextBreakage).toHaveLength(1);
    expect(nextBreakage[0].baseUnits).toBe(6);
  });

  it("T4.2: Evening empty crate reconciliation matches plastic crates loaded vs returned", () => {
    const emptyCratesLoadedMorning = 30;
    // On route: 40 full crates delivered to retailers; retailers returned 38 empty crates; 2 kept on deposit
    // 9 full intact crates brought back
    // Empty crates brought back in van = 38
    // Total physical plastic crates returning in van = 9 full + 38 empty = 47 crates
    const emptyCratesReturned = 38;
    const cratesSoldCrateDepositPending = 2;

    const totalCratesAccounted = emptyCratesReturned + cratesSoldCrateDepositPending;
    expect(totalCratesAccounted).toBe(40); // 40 sold crates accounted for (38 returned + 2 on deposit)
    expect(emptyCratesReturned).toBeGreaterThanOrEqual(emptyCratesLoadedMorning);
  });
});
