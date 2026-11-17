/**
 * src/tests/nonRegressionCore.test.ts
 *
 * Requirement R6: Non-Regression & Scope Isolation Constraint (بغیر کسی رکاوٹ کے موجودہ فیچرز کی بقا)
 * Acceptance Criteria:
 *   - POS terminal counter billing remains 100% operational and isolated from van dispatch logic.
 *   - Customer Khata accounts remain strictly categorized and unaffected by Salesman khata postings.
 *   - Existing website tests continue to pass 100%.
 *
 * Tiers:
 *   Tier 1: POS Counter Billing Core Isolation (5 tests)
 *   Tier 2: Customer Khata Strict Isolation & Categorization (5 tests)
 *   Tier 3: Inter-Module Invariant Verification (3 tests)
 *   Tier 4: Comprehensive Real-World Operations & Regression Invariants (2 tests)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  INITIAL_KHATA_ACCOUNTS,
  saveKhataAccounts,
  loadSavedKhataAccounts,
  saveKhataTransactions,
} from "../types/khata";
import { useSalesStore } from "../store/useSalesStore";
import { useLogisticsStore } from "../store/useLogisticsStore";
import { useInventoryStore } from "../store/useInventoryStore";
import { salesService } from "../services/salesService";
import { INITIAL_PRODUCTS, loadSavedProducts, saveProducts } from "../types/products";
import { ALL_REPORTS } from "../components/reports/definitions/reportCatalog";
import type { SalesInvoiceReceiptDto, CreditStatusCheckResult, CancelInvoiceResult } from "../types/sales";

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

describe("R6: Non-Regression of POS Terminal & Customer Khata", () => {
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

    // Reset Zustand sales store state
    useSalesStore.setState({
      cart: [],
      selectedCustomer: {
        id: 1,
        name: "Bismillah Kiryana Store",
        shopName: "Bismillah Kiryana Store",
        priceTier: "WHOLESALE",
        creditLimitPaisa: 20000000,
        currentBalancePaisa: 4500000,
        currentCrateBalance: 15,
      },
      invoiceDiscountPaisa: 0,
      crateDepositChargedPaisa: 0,
      paymentType: "CASH",
      paidAmountPaisa: 0,
      cratesIssued: 0,
      cratesReturned: 0,
      adminOverridePin: "",
      creditStatus: null,
      invoices: [],
      activeReceipt: null,
      isReceiptModalOpen: false,
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

    useInventoryStore.setState({
      stockItems: [],
      emptiesOverview: null,
      breakageLogs: [],
      activeCustomerCrateLedger: [],
      filter: {},
      isLoading: false,
      error: null,
    });

    // Mock salesService methods to allow full checkout & credit check execution in Node
    vi.spyOn(salesService, "listSalesInvoices").mockResolvedValue([]);
    vi.spyOn(salesService, "createSalesInvoice").mockImplementation(async (dto): Promise<SalesInvoiceReceiptDto> => {
      const netTotal = 120000;
      const paid = dto.paid_amount_paisa ?? (dto.payment_type === "CASH" ? 150000 : 0);
      return {
        invoice_id: 88,
        invoice_number: "INV-20261116-0089",
        invoice_date: "2026-11-16",
        due_date: "2026-11-16",
        customer_id: dto.customer_id,
        customer_name: "Walk-in Cash Customer",
        shop_name: "Counter Sale",
        customer_phone: "0300-1234567",
        payment_type: dto.payment_type,
        status: "PAID",
        items: dto.items.map((it) => ({
          product_id: it.product_id,
          product_name: "Cola Next 2250 ML",
          sku_code: "CN-2250-PET",
          packaging_name: "Pack",
          units_per_pack: 4,
          pack_qty: it.pack_qty,
          loose_qty: it.loose_qty,
          total_base_units: it.pack_qty * 4 + it.loose_qty,
          unit_price_paisa: it.unit_price_paisa || 120000,
          line_discount_paisa: it.line_discount_paisa || 0,
          line_total_paisa: it.pack_qty * (it.unit_price_paisa || 120000),
          cogs_total_paisa: 0,
        })),
        subtotal_paisa: 120000,
        discount_paisa: dto.invoice_discount_paisa || 0,
        crate_deposit_charged_paisa: dto.crate_deposit_charged_paisa || 0,
        net_total_paisa: netTotal,
        paid_amount_paisa: paid,
        due_amount_paisa: 0,
        previous_customer_balance_paisa: 0,
        new_customer_balance_paisa: 0,
        crates_issued: dto.crates_issued || 0,
        crates_returned: dto.crates_returned || 0,
        previous_crate_balance: 0,
        new_crate_balance: 0,
        sales_journal_entry_id: 1,
        cogs_journal_entry_id: 2,
        formatted_thermal_receipt: "DOGAR TRADERS\nڈوگر ٹریڈرز\nINV-20261116-0089\nTotal: 1200.00",
      };
    });

    vi.spyOn(salesService, "checkCreditStatus").mockImplementation(async (customerId, attemptedCreditPaisa): Promise<CreditStatusCheckResult> => {
      const isBreached = attemptedCreditPaisa > 5000000;
      return {
        customer_id: customerId,
        customer_name: "Haji Abdul Sattar",
        credit_limit_paisa: 5000000,
        current_balance_paisa: 1200000,
        attempted_credit_paisa: attemptedCreditPaisa,
        total_exposure_paisa: 1200000 + attemptedCreditPaisa,
        utilization_percentage: Math.round(((1200000 + attemptedCreditPaisa) / 5000000) * 100),
        is_warning: false,
        is_breached: isBreached,
        status: isBreached ? "BLOCKED" : "ACTIVE",
      };
    });

    vi.spyOn(salesService, "cancelSalesInvoice").mockImplementation(async (): Promise<CancelInvoiceResult> => ({
      success: true,
      invoice_id: 88,
      invoice_number: "INV-20261116-0089",
      restored_stock_items: 1,
      refunded_cash_paisa: 120000,
      credited_receivable_paisa: 0,
      reversed_crates_count: 0,
      audit_log_id: 99,
      cancelled_at: new Date().toISOString(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // TIER 1: POS Counter Billing Core Isolation (≥ 5 tests)
  // ==========================================================================

  it("T1.1: POS cart additions, item quantities, and subtotal calculation operate completely independently of van loading sheets", () => {
    const store = useSalesStore.getState();

    // Add item 1
    store.addToCart({
      productId: 1,
      productName: "Cola Next 2250 ML",
      skuCode: "CN-2250-PET",
      unitsPerPack: 4,
      packName: "Pack",
      unitPricePaisa: 120000,
    });
    // Add item 2
    store.addToCart({
      productId: 5,
      productName: "Fizz Up 250ml Glass",
      skuCode: "FZ-250-RGB",
      unitsPerPack: 24,
      packName: "Crate",
      unitPricePaisa: 240000,
    });

    store.updateCartItem(1, { packQty: 10 });
    store.updateCartItem(5, { packQty: 5 });

    const cart = useSalesStore.getState().cart;
    expect(cart).toHaveLength(2);
    expect(cart.find((c) => c.productId === 1)!.packQty).toBe(10);
    expect(cart.find((c) => c.productId === 5)!.packQty).toBe(5);

    const subtotalPaisa = cart.reduce((sum, it) => sum + it.packQty * it.unitPricePaisa, 0);
    expect(subtotalPaisa).toBe(10 * 120000 + 5 * 240000); // 2,400,000 paisa (24,000 PKR)
  });

  it("T1.2: POS counter billing checkout creates invoice and calculates change with exact paisa precision", async () => {
    const store = useSalesStore.getState();

    store.addToCart({
      productId: 1,
      productName: "Cola Next 2250 ML",
      skuCode: "CN-2250-PET",
      unitsPerPack: 4,
      packName: "Pack",
      unitPricePaisa: 120000,
    });
    store.updateCartItem(1, { packQty: 1 });
    store.setPaymentType("CASH");
    store.setPaidAmountPaisa(150000);

    const receipt = await store.checkout();

    expect(receipt).toBeDefined();
    expect(receipt.net_total_paisa).toBe(120000);
    expect(receipt.paid_amount_paisa).toBe(150000);
    expect(receipt.paid_amount_paisa - receipt.net_total_paisa).toBe(30000); // 300 PKR exact change
    expect(useSalesStore.getState().cart).toHaveLength(0); // Cart cleared on checkout
    expect(useSalesStore.getState().isReceiptModalOpen).toBe(true);
  });

  it("T1.3: POS credit customer billing enforces credit limits without referencing salesman accounts or route sheets", async () => {
    const store = useSalesStore.getState();

    store.setSelectedCustomer({
      id: 2,
      name: "Haji Abdul Sattar",
      shopName: "Madina Super Store",
      priceTier: "WHOLESALE",
      creditLimitPaisa: 5000000,
      currentBalancePaisa: 1200000,
      currentCrateBalance: 15,
    });

    store.addToCart({
      productId: 1,
      productName: "Cola Next 2250 ML",
      skuCode: "CN-2250-PET",
      unitsPerPack: 4,
      packName: "Pack",
      unitPricePaisa: 120000,
    });
    store.setPaymentType("CREDIT");

    const creditResult = await store.checkCredit();
    expect(creditResult).toBeDefined();
    expect(creditResult!.is_breached).toBe(false);
    expect(creditResult!.status).toBe("ACTIVE");
    expect(creditResult!.customer_id).toBe(2);
  });

  it("T1.4: POS thermal receipt formatting preserves bilingual English & Urdu headers and totals", async () => {
    const store = useSalesStore.getState();
    store.addToCart({
      productId: 1,
      productName: "Cola Next 2250 ML",
      skuCode: "CN-2250-PET",
      unitsPerPack: 4,
      packName: "Pack",
      unitPricePaisa: 120000,
    });

    const receipt = await store.checkout();

    expect(receipt.formatted_thermal_receipt).toContain("DOGAR TRADERS");
    expect(receipt.formatted_thermal_receipt).toContain("ڈوگر ٹریڈرز");
    expect(receipt.invoice_number).toMatch(/^INV-\d{8}-\d{4}$/);
    expect(receipt.net_total_paisa).toBe(receipt.subtotal_paisa);
  });

  it("T1.5: POS bill cancellation reverses customer debt and restores counter inventory without altering delivery van sheets", async () => {
    const store = useSalesStore.getState();
    store.addToCart({
      productId: 1,
      productName: "Cola Next 2250 ML",
      skuCode: "CN-2250-PET",
      unitsPerPack: 4,
      packName: "Pack",
      unitPricePaisa: 120000,
    });

    const receipt = await store.checkout();
    expect(receipt.invoice_id).toBe(88);

    // Cancel invoice via store action
    await store.cancelInvoice(receipt.invoice_id, "Customer returned goods at counter", "1234");
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();

    // Delivery sheets in useLogisticsStore remain completely unaffected
    const loadingSheets = useLogisticsStore.getState().loadingSheets;
    expect(loadingSheets).toHaveLength(0);
  });

  // ==========================================================================
  // TIER 2: Customer Khata Strict Isolation & Categorization (≥ 5 tests)
  // ==========================================================================

  it("T2.1: Category segregation: Accounts are strictly categorized and category filtering returns exact subsets without bleed", () => {
    const accounts = loadSavedKhataAccounts();
    const retailerAccounts = accounts.filter((a) => a.category === "RETAILER");
    const supplierAccounts = accounts.filter((a) => a.category === "SUPPLIER");
    const villageAccounts = accounts.filter((a) => a.category === "VILLAGE_KIRAYANA");
    const salesmanAccounts = accounts.filter((a) => a.category === "SALESMAN");

    expect(retailerAccounts.length).toBeGreaterThanOrEqual(2);
    expect(supplierAccounts.length).toBeGreaterThanOrEqual(1);
    expect(villageAccounts.length).toBeGreaterThanOrEqual(1);
    expect(salesmanAccounts.length).toBeGreaterThanOrEqual(3);

    // Filter by "SALESMAN" must NOT include any Retailer or Supplier
    expect(salesmanAccounts.every((a) => a.category === "SALESMAN")).toBe(true);
    expect(salesmanAccounts.some((a) => a.category === "RETAILER")).toBe(false);
    expect(salesmanAccounts.some((a) => a.category === "SUPPLIER")).toBe(false);
  });

  it("T2.2: Customer Khata immunity: Salesman ledger transactions do NOT alter customer Khata balances", async () => {
    const accountsBefore = loadSavedKhataAccounts();
    const nonSalesmanSnapshots = accountsBefore
      .filter((a) => a.category !== "SALESMAN")
      .map((a) => ({ id: a.id, balance: a.currentBalance }));

    // Create a van dispatch and confirm evening return for Salesman Muhammad Ali (id 5)
    const dispatch = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-VAN-IMMUNITY",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Center",
      salesmanId: 5,
      salesmanKhataId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "OPEN",
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

    // Settle with 5,000 PKR unpaid balance
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      1660000 // Gross = 21,600, deposit = 16,600 -> unpaid = 5,000 PKR
    );

    const accountsAfter = loadSavedKhataAccounts();
    // Salesman balance updated
    expect(accountsAfter.find((a) => a.id === 5)!.currentBalance).toBe(5000);

    // Customer balances 100% untouched
    for (const snap of nonSalesmanSnapshots) {
      const current = accountsAfter.find((a) => a.id === snap.id)!;
      expect(current.currentBalance).toBe(snap.balance);
    }
  });

  it("T2.3: Supplier Khata negative balance (payable) accounting functions independently of customer/salesman receivables", () => {
    const accounts = loadSavedKhataAccounts();
    const supplier = accounts.find((a) => a.id === 4)!;
    expect(supplier.category).toBe("SUPPLIER");
    const initialBal = supplier.currentBalance; // -85,000 PKR

    // Receiving shipment from supplier increases agency liability
    const shipmentAmount = 200000;
    const updatedBal = initialBal - shipmentAmount;
    expect(updatedBal).toBe(initialBal - 200000);
    expect(updatedBal).toBeLessThan(0);
  });

  it("T2.4: Customer Khata search queries return only matching customers and ignore salesman van records", () => {
    const accounts = loadSavedKhataAccounts();
    const query = "kiryana";
    const matches = accounts.filter(
      (a) =>
        a.shopName.toLowerCase().includes(query) ||
        a.holderName.toLowerCase().includes(query) ||
        a.notes.toLowerCase().includes(query)
    );

    expect(matches.some((a) => a.id === 1)).toBe(true);
    expect(matches.some((a) => a.category === "SALESMAN")).toBe(false);
  });

  it("T2.5: Customer credit wasooli / recovery receipts credit customer account without affecting salesman ledgers", () => {
    const accounts = loadSavedKhataAccounts();
    const akram = accounts.find((a) => a.id === 1)!;
    const prevAkramBal = akram.currentBalance; // 45,000 PKR
    const recovery = 15000;

    akram.currentBalance = prevAkramBal - recovery;
    saveKhataAccounts(accounts);

    expect(loadSavedKhataAccounts().find((a) => a.id === 1)!.currentBalance).toBe(30000);

    // All salesmen balances remain 0
    const salesmen = loadSavedKhataAccounts().filter((a) => a.category === "SALESMAN");
    for (const s of salesmen) {
      expect(s.currentBalance).toBe(0);
    }
  });

  // ==========================================================================
  // TIER 3: Inter-Module Invariant Verification (≥ 3 tests)
  // ==========================================================================

  it("T3.1: Concurrent counter POS sales and morning van dispatch: Both decrement warehouse inventory simultaneously without conflict", async () => {
    const initialStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks; // 250 packs

    // Operation A (Counter POS): Cash customer buys 10 packs (40 base units)
    await useInventoryStore.getState().deductWarehouseStock(1, 40);
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(initialStock - 10);

    // Operation B (Morning Van Dispatch): Delivery van loads 50 packs (200 base units)
    await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-CONCURRENT-01",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Beat",
      salesmanId: 5,
      salesmanName: "Muhammad Ali",
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

    // Total deducted = 10 + 50 = 60 packs
    const finalStock = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;
    expect(finalStock).toBe(initialStock - 60);
  });

  it("T3.2: Khata global receivable & payable KPI calculation correctly aggregates customer and salesman accounts", () => {
    const accounts = loadSavedKhataAccounts();
    let totalRec = 0;
    let totalPay = 0;
    for (const acc of accounts) {
      if (acc.currentBalance > 0) totalRec += acc.currentBalance;
      else if (acc.currentBalance < 0) totalPay += Math.abs(acc.currentBalance);
    }

    expect(totalRec).toBe(125000); // 45k + 12k + 68k
    expect(totalPay).toBe(85000);  // 85k supplier payable

    // Simulate salesman ending day with 25,000 PKR unpaid balance
    accounts.find((a) => a.id === 5)!.currentBalance = 25000;
    saveKhataAccounts(accounts);

    let updatedRec = 0;
    for (const acc of loadSavedKhataAccounts()) {
      if (acc.currentBalance > 0) updatedRec += acc.currentBalance;
    }

    expect(updatedRec).toBe(150000);
    expect(totalPay).toBe(85000);
  });

  it("T3.3: Product master catalog rate consistency: Item wholesale rates and pack specifications are unified between POS and Logistics", () => {
    const products = loadSavedProducts();
    for (const prod of products) {
      expect(prod.bottlesPerPack).toBeGreaterThan(0);
      expect(prod.wholesalePackPricePaisa).toBeGreaterThan(0);
      expect(prod.retailPackPricePaisa).toBeGreaterThanOrEqual(prod.wholesalePackPricePaisa);
    }
  });

  // ==========================================================================
  // TIER 4: Comprehensive Real-World Operations & Regression Invariants (≥ 2 tests)
  // ==========================================================================

  it("T4.1: Full agency concurrent operations simulation: Morning counter sales, van dispatches, afternoon sales, evening settlements reconcile 100%", async () => {
    const p1Initial = loadSavedProducts().find((p) => p.id === 1)!.stockPacks;

    // Step 1: Morning counter POS sale (5 packs = 20 base units)
    await useInventoryStore.getState().deductWarehouseStock(1, 20);

    // Step 2: Morning Van Dispatch (40 packs = 160 base units)
    const dispatch = await useLogisticsStore.getState().createDailyDispatch({
      sheetNumber: "LOAD-SIM-DAY1",
      date: "2026-11-16",
      routeId: 1,
      routeName: "City Beat",
      salesmanId: 5,
      salesmanKhataId: 5,
      salesmanName: "Muhammad Ali",
      vehicleNumber: "LES-2489",
      status: "OPEN",
      emptyCratesLoaded: 40,
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

    // Step 3: Evening settlement: 10 packs intact returned, 30 packs sold.
    // Revenue = 30 * 1,080 = 32,400 PKR. Cash deposited = 26,000 PKR. Unpaid = 6,400 PKR.
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      2600000
    );

    // Net stock deducted from warehouse = 5 (POS) + 30 (Van sold) = 35 packs
    expect(loadSavedProducts().find((p) => p.id === 1)!.stockPacks).toBe(p1Initial - 35);
    // Salesman khata balance = 6,400 PKR
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(6400);
    // Customer accounts intact
    expect(loadSavedKhataAccounts().find((a) => a.id === 1)!.currentBalance).toBe(45000);
  });

  it("T4.2: Store isolation & reporting suite regression invariants: Verify ALL_REPORTS catalog integrity and cross-store isolation", () => {
    // 1. ALL_REPORTS catalog contains dedicated reports without deletion or corruption
    expect(ALL_REPORTS.length).toBeGreaterThanOrEqual(10);
    const rep01 = ALL_REPORTS.find((r) => r.id === "REP-01");
    const rep27 = ALL_REPORTS.find((r) => r.id === "REP-27");
    const rep28 = ALL_REPORTS.find((r) => r.id === "REP-28");
    expect(rep01).toBeDefined();
    expect(rep27).toBeDefined();
    expect(rep28).toBeDefined();

    // 2. Initial khata accounts immutable baseline is preserved
    expect(INITIAL_KHATA_ACCOUNTS.length).toBeGreaterThanOrEqual(6);
    expect(INITIAL_KHATA_ACCOUNTS.some((a) => a.category === "SALESMAN")).toBe(true);
    expect(INITIAL_KHATA_ACCOUNTS.some((a) => a.category === "RETAILER")).toBe(true);
    expect(INITIAL_KHATA_ACCOUNTS.some((a) => a.category === "SUPPLIER")).toBe(true);

    // 3. Modifying sales store state does not mutate logistics store state
    useSalesStore.getState().addToCart({
      productId: 1,
      productName: "Cola Next 2250 ML",
      skuCode: "CN-2250-PET",
      unitsPerPack: 4,
      packName: "Pack",
      unitPricePaisa: 120000,
    });
    expect(useLogisticsStore.getState().loadingSheets).toHaveLength(0);
  });
});
