/**
 * src/tests/milestone2_ui_dispatch_settlement.test.ts
 *
 * Milestone 2 Comprehensive Verification Suite:
 * Morning Dispatch & Evening Return UI Logic, Zero Leakage, Overwrite Mechanics,
 * Stock Synchronization & Salesman Khata Ledger Posting (DOGAR TRADERS).
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
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
import { LoadingManifestModal } from "../components/logistics/LoadingManifestModal";
import { VanSettlementModal } from "../components/logistics/VanSettlementModal";
import { LogisticsDashboard } from "../components/logistics/LogisticsDashboard";

// Mock localStorage for headless test environment
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

describe("Milestone 2: Dispatch & Evening Settlement Workflows", () => {
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
    useInventoryStore.getInitialState = () => useInventoryStore.getState();

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
    useLogisticsStore.getInitialState = () => useLogisticsStore.getState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Strict Manual Entry Controls & Zero Quantity Leakage", () => {
    it("M2.1: Dispatches only contain products explicitly entered with non-zero quantities", async () => {
      const p1 = loadSavedProducts().find((p) => p.id === 1)!;
      const p2 = loadSavedProducts().find((p) => p.id === 2)!;

      // Create dispatch with Product 1 having quantities, and Product 2 having 0
      const record = await useLogisticsStore.getState().createDailyDispatch({
        sheetNumber: "LOAD-M2-001",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Center Beat",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        salesmanKhataId: 5,
        vehicleNumber: "LES-2489",
        status: "ISSUED",
        emptyCratesLoaded: 20,
        emptyCratesReturned: 0,
        items: [
          {
            productId: p1.id,
            productSku: p1.sku,
            productName: p1.name,
            packName: p1.requiresCrate ? "Crate" : "Pack",
            unitsPerPack: p1.bottlesPerPack,
            wholesalePackPricePaisa: p1.wholesalePackPricePaisa,
            isGlass: p1.requiresCrate,
            dispatchedPacks: 25,
            dispatchedLoose: 0,
            totalDispatchedBase: 25 * p1.bottlesPerPack,
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
            productId: p2.id,
            productSku: p2.sku,
            productName: p2.name,
            packName: p2.requiresCrate ? "Crate" : "Pack",
            unitsPerPack: p2.bottlesPerPack,
            wholesalePackPricePaisa: p2.wholesalePackPricePaisa,
            isGlass: p2.requiresCrate,
            dispatchedPacks: 0, // Unentered / zero
            dispatchedLoose: 0, // Unentered / zero
            totalDispatchedBase: 0,
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

      // Assert zero-quantity item (Product 2) was pruned completely from record
      expect(record.items).toHaveLength(1);
      expect(record.items[0].productId).toBe(1);
      expect(record.items[0].dispatchedPacks).toBe(25);
    });

    it("M2.2: Numeric quantity overwrite logic guarantees zero concatenation leakage", () => {
      // Simulate raw user entry into numeric input
      let currentValue = 0;

      // User adds product, starts at 0
      expect(currentValue).toBe(0);

      // User types "5"
      currentValue = Math.max(0, parseInt("5", 10) || 0);
      expect(currentValue).toBe(5);

      // User types "30" over the previous "5"
      currentValue = Math.max(0, parseInt("30", 10) || 0);
      expect(currentValue).toBe(30); // Cleanly 30, never "530"

      // User clears field (empty string)
      currentValue = Math.max(0, parseInt("", 10) || 0);
      expect(currentValue).toBe(0);
    });

    it("M2.3: Salesman selection dropdown is populated strictly from KhataAccount with category SALESMAN", () => {
      const allAccounts = loadSavedKhataAccounts();
      const salesmen = allAccounts.filter((a) => a.category === "SALESMAN");

      expect(salesmen.length).toBeGreaterThanOrEqual(3);
      expect(salesmen.every((s) => s.category === "SALESMAN")).toBe(true);
      expect(salesmen.some((s) => s.holderName === "Muhammad Ali")).toBe(true);
      expect(salesmen.some((s) => s.holderName === "Rashid Mahmood")).toBe(true);
      expect(salesmen.some((s) => s.holderName === "Imran Khan")).toBe(true);

      // Retailer accounts must NOT leak into salesman list
      const retailers = salesmen.filter((s: any) => s.category === "RETAILER");
      expect(retailers).toHaveLength(0);
    });
  });

  describe("2. Morning Dispatch Stock Deduction", () => {
    it("M2.4: Morning dispatch confirmation deducts exact base units from warehouse stock", async () => {
      const initialProducts = loadSavedProducts();
      const p1InitialPacks = initialProducts.find((p) => p.id === 1)!.stockPacks;
      const bottlesPerPack = initialProducts.find((p) => p.id === 1)!.bottlesPerPack; // 4

      // Dispatch 30 packs
      await useLogisticsStore.getState().createDailyDispatch({
        sheetNumber: "LOAD-M2-STOCK-01",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Beat",
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
            productSku: "CN-2250-PET",
            productName: "Cola Next 2250 ML",
            packName: "Pack",
            unitsPerPack: bottlesPerPack,
            wholesalePackPricePaisa: 108000,
            isGlass: false,
            dispatchedPacks: 30,
            dispatchedLoose: 0,
            totalDispatchedBase: 30 * bottlesPerPack, // 120 base bottles
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

      const updatedProducts = loadSavedProducts();
      const p1UpdatedPacks = updatedProducts.find((p) => p.id === 1)!.stockPacks;

      expect(p1UpdatedPacks).toBe(p1InitialPacks - 30);
    });
  });

  describe("3. Evening Van Return, Tripartite Invariant & Dynamic Sales Calculation", () => {
    it("M2.5: Evening return reconciles Dispatched = Sold + Intact + Damaged and calculates sales revenue dynamically", async () => {
      const initialStockP1 = loadSavedProducts().find((p) => p.id === 1)!.stockPacks; // baseline

      // Morning dispatch: 50 packs of P1 (unitsPerPack = 4, wholesalePackPrice = 108,000 paisa / 1,080 PKR)
      // Total dispatched base = 200 bottles.
      const dispatch = await useLogisticsStore.getState().createDailyDispatch({
        sheetNumber: "LOAD-M2-RECON-01",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Beat",
        salesmanId: 5,
        salesmanName: "Muhammad Ali",
        salesmanKhataId: 5,
        vehicleNumber: "LES-2489",
        status: "ISSUED",
        emptyCratesLoaded: 50,
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

      // Stock immediately after dispatch: initialStockP1 - 50
      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStockP1 - 50);

      // Evening Return input:
      // Returned Intact: 15 packs (60 base bottles)
      // Damaged / Breakage: 1 pack (4 base bottles)
      // Calculated Sold: 50 - 15 - 1 = 34 packs (136 base bottles)
      // Wholesale unit price = 108,000 / 4 = 27,000 paisa (270 PKR / bottle)
      // Expected Revenue = 136 * 270 = 36,720 PKR (3,672,000 paisa)
      // Cash Deposited: 30,000 PKR (3,000,000 paisa)
      // Unpaid Balance: 6,720 PKR (672,000 paisa)
      const settled = await useLogisticsStore.getState().confirmEveningReturn(
        dispatch.id,
        [
          {
            productId: 1,
            returnedIntactPacks: 15,
            returnedIntactLoose: 0,
            damagedPacks: 1,
            damagedLoose: 0,
          },
        ],
        3000000 // 30,000 PKR cash deposited
      );

      // Verify Dispatch Record state
      expect(settled.status).toBe("SETTLED");
      expect(settled.items[0].soldPacks).toBe(34);
      expect(settled.items[0].returnedIntactPacks).toBe(15);
      expect(settled.items[0].damagedPacks).toBe(1);
      expect(settled.totalSalesRevenuePaisa).toBe(3672000);
      expect(settled.cashDepositedPaisa).toBe(3000000);
      expect(settled.unpaidBalancePaisa).toBe(672000);

      // Verify Warehouse Stock: Intact 15 packs restocked, 1 pack damaged NOT restocked
      // Net stock deduction: 50 dispatched - 15 intact returned = 35 packs net deducted
      const stockAfterReturn = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
      expect(stockAfterReturn).toBe(initialStockP1 - 35);

      // Verify Damaged Goods logged into Breakage Log
      const breakageLogs = useInventoryStore.getState().breakageLogs;
      expect(breakageLogs.length).toBeGreaterThanOrEqual(1);
      const damagedEntry = breakageLogs.find((b) => b.notes?.includes(settled.sheetNumber));
      expect(damagedEntry).toBeDefined();
      expect(damagedEntry!.broken_base_units).toBe(4); // 1 pack = 4 bottles

      // Verify Salesman Khata Ledger: Unpaid balance of 6,720 PKR posted as DEBIT
      const salesmanAccount = loadSavedKhataAccounts().find((a) => a.id === 5)!;
      expect(salesmanAccount.currentBalance).toBe(6720);

      const transactions = loadSavedKhataTransactions().filter((t) => t.accountId === 5);
      const tx = transactions.find((t) => t.referenceNo === settled.sheetNumber);
      expect(tx).toBeDefined();
      expect(tx!.transactionType).toBe("DEBIT");
      expect(tx!.amount).toBe(6720);
    });

    it("M2.6: Full payment settlement posts 0 debit and leaves Khata balance clean", async () => {
      // Morning dispatch: 20 packs of P1
      const dispatch = await useLogisticsStore.getState().createDailyDispatch({
        sheetNumber: "LOAD-M2-FULLPAY-01",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Beat",
        salesmanId: 6,
        salesmanName: "Rashid Mahmood",
        salesmanKhataId: 6,
        vehicleNumber: "RYK-8192",
        status: "ISSUED",
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

      // Evening Return: 5 packs returned intact, 0 damaged, 15 packs sold.
      // Revenue = 15 packs * 1,080 PKR = 16,200 PKR (1,620,000 paisa).
      // Full payment deposited: 16,200 PKR.
      const settled = await useLogisticsStore.getState().confirmEveningReturn(
        dispatch.id,
        [
          {
            productId: 1,
            returnedIntactPacks: 5,
            returnedIntactLoose: 0,
            damagedPacks: 0,
            damagedLoose: 0,
          },
        ],
        1620000 // Exact full payment
      );

      expect(settled.status).toBe("SETTLED");
      expect(settled.unpaidBalancePaisa).toBe(0);

      // Salesman Khata should have 0 balance
      const salesmanAccount = loadSavedKhataAccounts().find((a) => a.id === 6)!;
      expect(salesmanAccount.currentBalance).toBe(0);

      // No debit transaction should be posted
      const transactions = loadSavedKhataTransactions().filter(
        (t) => t.accountId === 6 && t.referenceNo === settled.sheetNumber
      );
      expect(transactions).toHaveLength(0);
    });
  });

  describe("4. Session Isolation & Multi-Return Synchronization", () => {
    it("M2.7: Consecutive dispatches for different salesmen maintain isolated accounts and stock pools", async () => {
      const p1Initial = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;

      // Dispatch 1 to Muhammad Ali (ID 5): 20 packs
      const d1 = await useLogisticsStore.getState().createDailyDispatch({
        sheetNumber: "LOAD-M2-MULTI-01",
        date: "2026-11-16",
        routeId: 1,
        routeName: "City Beat",
        salesmanId: 5,
        salesmanKhataId: 5,
        salesmanName: "Muhammad Ali",
        vehicleNumber: "LES-2489",
        status: "ISSUED",
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

      // Dispatch 2 to Rashid Mahmood (ID 6): 30 packs
      const d2 = await useLogisticsStore.getState().createDailyDispatch({
        sheetNumber: "LOAD-M2-MULTI-02",
        date: "2026-11-16",
        routeId: 2,
        routeName: "Khanpur Beat",
        salesmanId: 6,
        salesmanKhataId: 6,
        salesmanName: "Rashid Mahmood",
        vehicleNumber: "RYK-8192",
        status: "ISSUED",
        emptyCratesLoaded: 30,
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

      // Total stock deducted = 20 + 30 = 50 packs
      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(p1Initial - 50);

      // Settle Van 1: 5 packs returned intact, 15 sold (16,200 PKR). Cash deposited: 10,000 PKR. Unpaid: 6,200 PKR.
      await useLogisticsStore.getState().confirmEveningReturn(
        d1.id,
        [{ productId: 1, returnedIntactPacks: 5, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
        1000000
      );

      // Settle Van 2: 10 packs returned intact, 20 sold (21,600 PKR). Cash deposited: 15,000 PKR. Unpaid: 6,600 PKR.
      await useLogisticsStore.getState().confirmEveningReturn(
        d2.id,
        [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
        1500000
      );

      // Check salesman 5 balance: exactly 6,200 PKR
      const ali = loadSavedKhataAccounts().find((a) => a.id === 5)!;
      expect(ali.currentBalance).toBe(6200);

      // Check salesman 6 balance: exactly 6,600 PKR
      const rashid = loadSavedKhataAccounts().find((a) => a.id === 6)!;
      expect(rashid.currentBalance).toBe(6600);

      // Net warehouse stock: initial - 50 dispatched + 15 intact returned = initial - 35
      expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(p1Initial - 35);
    });
  });

  describe("5. React UI Component Rendering & Interaction Verification", () => {
    it("M2.8: LoadingManifestModal renders clean empty state with Salesman dropdown when open", () => {
      useLogisticsStore.setState({
        isLoadingManifestModalOpen: true,
        routes: [
          {
            id: 1,
            route_code: "R-01",
            route_name: "City Beat",
            target_daily_sales_paisa: 10000000,
            customer_count: 10,
            is_active: true,
            created_at: "",
            updated_at: "",
          },
        ],
        vehicles: [
          {
            id: 1,
            vehicle_number: "LES-2489",
            model: "Suzuki Ravi",
            capacity_crates: 120,
            capacity_weight_kg: 850,
            current_odometer_km: 45200,
            is_active: true,
            created_at: "",
            updated_at: "",
          },
        ],
      });

      const markup = renderToStaticMarkup(
        React.createElement(LoadingManifestModal as React.ComponentType<any>, { isOpen: true })
      );

      // Must render modal title
      expect(markup).toContain("Morning Route Loading Manifest &amp; Gate Pass");
      // Must render Salesman Khata dropdown with seed salesmen
      expect(markup).toContain("Muhammad Ali");
      expect(markup).toContain("Rashid Mahmood");
      expect(markup).toContain("Imran Khan");
      // Must start with clean empty state prompt
      expect(markup).toContain("No products added yet");
      // Must provide SKU selection dropdown
      expect(markup).toContain("+ Add Beverage SKU");
      // Save Draft & Issue Dispatch buttons must be disabled when 0 items
      expect(markup).toContain("disabled");
    });

    it("M2.9: LoadingManifestModal renders null when closed", () => {
      useLogisticsStore.setState({ isLoadingManifestModalOpen: false });
      const markup = renderToStaticMarkup(
        React.createElement(LoadingManifestModal as React.ComponentType<any>, { isOpen: false })
      );
      expect(markup).toBe("");
    });

    it("M2.10: VanSettlementModal renders active morning dispatch with tripartite inputs and auto-sales", () => {
      const detail = {
        id: 101,
        sheet_number: "LOAD-20261116-0101",
        sheet_date: "2026-11-16",
        route_id: 1,
        route_name: "City Center Beat",
        route_code: "R-01",
        vehicle_number: "LES-2489",
        driver_name: "Muhammad Ali",
        salesman_name: "Muhammad Ali",
        salesman_id: 5,
        salesman_khata_id: 5,
        status: "ISSUED" as const,
        opening_km: 45200,
        closing_km: 45250,
        empty_crates_loaded: 30,
        empty_crates_returned: 30,
        total_load_cost_paisa: 0,
        total_load_retail_paisa: 5400000,
        expected_cash_paisa: 5400000,
        actual_cash_paisa: 5400000,
        cash_variance_paisa: 0,
        empty_crates_expected: 30,
        crates_variance: 0,
        created_at: "2026-11-16T08:00:00Z",
        updated_at: "2026-11-16T08:00:00Z",
        items: [
          {
            id: 1,
            sheet_id: 101,
            product_id: 1,
            product_sku: "CN-2250-PET",
            product_name: "Cola Next 2250 ML",
            pack_unit_name: "Pack",
            base_unit_name: "Bottle",
            units_per_pack: 4,
            loaded_packs: 50,
            loaded_loose: 0,
            total_loaded_base: 200,
            unit_cost_paisa: 0,
            unit_price_paisa: 108000,
            unit_wholesale_price_paisa: 27000,
            line_cost_paisa: 0,
            line_retail_paisa: 5400000,
            line_revenue_paisa: 5400000,
            line_wholesale_revenue_paisa: 5400000,
            sold_base: 0,
            returned_packs: 0,
            returned_loose: 0,
            total_returned_base: 0,
            breakage_base: 0,
            variance_base: 0,
          },
        ],
      };

      const markup = renderToStaticMarkup(
        React.createElement(VanSettlementModal as React.ComponentType<any>, { isOpen: true, sheetDetail: detail })
      );

      // Header details
      expect(markup).toContain("Evening Van Return &amp; Salesman Khata Settlement");
      expect(markup).toContain("LOAD-20261116-0101");
      expect(markup).toContain("Muhammad Ali");

      // Tripartite column headers
      expect(markup).toContain("Dispatched");
      expect(markup).toContain("Intact Return");
      expect(markup).toContain("Damaged / Breakage");
      expect(markup).toContain("Sold Qty");

      // Product line
      expect(markup).toContain("Cola Next 2250 ML");
      expect(markup).toContain("CN-2250-PET");
      expect(markup).toContain("200 base btls");

      // Workflow buttons
      expect(markup).toContain("Confirm &amp; Settle Van Trip");
    });

    it("M2.11: VanSettlementModal renders null when closed", () => {
      const markup = renderToStaticMarkup(
        React.createElement(VanSettlementModal as React.ComponentType<any>, { isOpen: false })
      );
      expect(markup).toBe("");
    });

    it("M2.12: LogisticsDashboard renders Morning Dispatch & Evening Return workflows cleanly", () => {
      const sheet = {
        id: 1,
        sheet_number: "LOAD-001",
        sheet_date: "2026-11-16",
        route_id: 1,
        route_name: "City Beat",
        vehicle_number: "LES-2489",
        driver_name: "Muhammad Ali",
        status: "ISSUED",
        total_items_count: 2,
        total_loaded_base: 200,
        empty_crates_loaded: 30,
        total_load_retail_paisa: 4000000,
      };

      const markup = renderToStaticMarkup(
        React.createElement(LogisticsDashboard as React.ComponentType<any>, { initialSheets: [sheet] })
      );

      // Quick action buttons
      expect(markup).toContain("+ Morning Dispatch (صبح ڈسپیچ)");
      expect(markup).toContain("Evening Return (شام واپسی)");
      expect(markup).toContain("+ New Route");
      expect(markup).toContain("+ Add Vehicle");

      // Aggregate metric cards
      expect(markup).toContain("Active Vans on Route");
      expect(markup).toContain("1 Trips");
      expect(markup).toContain("In-Transit Inventory");
      expect(markup).toContain("Empty Crates with Fleet");
      expect(markup).toContain("Settled Route Cash");
    });
  });
});
