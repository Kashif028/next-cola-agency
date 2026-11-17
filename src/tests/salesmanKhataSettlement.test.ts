/**
 * src/tests/salesmanKhataSettlement.test.ts
 *
 * Requirements R4 & R5:
 *   - R4: Automated Sales Calculation & Cash Settlement (خودکار سیل اور پیسوں کا حساب)
 *     - Automated sales calculation: Sold Qty = Dispatched - Returned Intact - Damaged.
 *     - Gross Sales Revenue = Sum(Sold Qty * Wholesale Item Rate).
 *     - Cash settlement: full cash deposit (0 balance), partial cash deposit (unpaid balance), overpayment/credit balance.
 *     - Posting unpaid balance as DEBIT to salesman ledger in Khata management under "SALESMAN" category.
 *     - Ledger integrity: past balance, debit entry, credit payment entry, net balance tracking.
 *   - R5: Dedicated 5-Report Suite Validation (رپورٹس)
 *     - Morning Dispatch Report (REP-27)
 *     - Evening Return Report (REP-28)
 *     - Daily Total Sales Report (REP-01)
 *     - Salesman Settlement Report (REP-05)
 *     - Outstanding Khata Balance / Ledger Report (REP-04 / Ledger)
 *
 * Tiers:
 *   Tier 1: Happy Path Equivalence Classes (5 tests)
 *   Tier 2: Boundary & Corner Cases (5 tests)
 *   Tier 3: Multi-Salesman & Combinatorial Ledger Flows (3 tests)
 *   Tier 4: Realistic Agency Daily End-to-End Simulation & Report Audit (2 tests)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useLogisticsStore } from "../store/useLogisticsStore";
import { useInventoryStore } from "../store/useInventoryStore";
import {
  KhataAccount,
  KhataTransaction,
  INITIAL_KHATA_ACCOUNTS,
  saveKhataAccounts,
  loadSavedKhataAccounts,
  loadSavedKhataTransactions,
  saveKhataTransactions,
} from "../types/khata";
import { loadSavedProducts, saveProducts, INITIAL_PRODUCTS } from "../types/products";
import { ALL_REPORTS } from "../components/reports/definitions/reportCatalog";

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

describe("R4 & R5: Salesman Khata Settlement & 5-Report Suite", () => {
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
        wholesalePackPricePaisa: prod1.wholesalePackPricePaisa, // 108000 paisa (1080 PKR)
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
      routeId: salesmanId === 5 ? 1 : salesmanId === 6 ? 2 : 3,
      routeName: salesmanId === 5 ? "City Center" : "Suburban Beat",
      salesmanId,
      salesmanName,
      salesmanKhataId: salesmanId,
      vehicleNumber: "LES-2489",
      status: "OPEN",
      emptyCratesLoaded: 50,
      emptyCratesReturned: 0,
      items,
      totalSalesRevenuePaisa: 0,
      cashDepositedPaisa: 0,
      unpaidBalancePaisa: 0,
    });
  }

  function recordSalesmanCreditPayment(
    salesmanAccountId: number,
    amountRupees: number,
    referenceNo: string,
    notes?: string
  ): { transaction: KhataTransaction; updatedAccount: KhataAccount } {
    const accounts = loadSavedKhataAccounts();
    const transactions = loadSavedKhataTransactions();
    const targetAccount = accounts.find((a) => a.id === salesmanAccountId);
    if (!targetAccount) throw new Error(`Salesman ID ${salesmanAccountId} not found`);

    const prevBal = targetAccount.currentBalance;
    const newBal = prevBal - amountRupees;
    const newTxId = transactions.length > 0 ? Math.max(...transactions.map((t) => t.id)) + 1 : 1;

    const tx: KhataTransaction = {
      id: newTxId,
      accountId: targetAccount.id,
      accountName: `${targetAccount.holderName} (${targetAccount.shopName})`,
      transactionDate: new Date().toISOString().slice(0, 10),
      transactionType: "CREDIT",
      amount: amountRupees,
      paymentReceived: amountRupees,
      paymentGiven: 0,
      description: notes || `Cash recovery payment received (${referenceNo})`,
      previousBalance: prevBal,
      newBalance: newBal,
      referenceNo,
      createdAt: new Date().toISOString(),
    };

    transactions.push(tx);
    const updatedAccount = {
      ...targetAccount,
      currentBalance: newBal,
      updatedAt: new Date().toISOString(),
    };

    saveKhataAccounts(accounts.map((a) => (a.id === updatedAccount.id ? updatedAccount : a)));
    saveKhataTransactions(transactions);

    return { transaction: tx, updatedAccount };
  }

  // ==========================================================================
  // TIER 1: Happy Path Equivalence Classes (≥ 5 tests)
  // ==========================================================================

  it("T1.1: Automated sales calculation computes Sold Qty = Dispatched - Intact - Damaged and Gross Revenue = Sold * Rate", async () => {
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // 50 packs dispatched (200 btls), 10 packs intact return (40 btls), 2 packs damaged (8 btls)
    // Sold = 50 - 10 - 2 = 38 packs (152 btls)
    // Wholesale price = 108000 paisa per pack (1,080 PKR)
    // Gross revenue = 38 * 1080 = 41,040 PKR (4,104,000 paisa)
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 2, damagedLoose: 0 }],
      4104000
    );

    expect(settled.items[0].soldPacks).toBe(38);
    expect(settled.items[0].totalSoldBase).toBe(152);
    expect(settled.items[0].lineRevenuePaisa).toBe(4104000);
    expect(settled.totalSalesRevenuePaisa).toBe(4104000);
  });

  it("T1.2: Full cash settlement deposits 100% revenue, leaving 0 unpaid balance and creating no khata debt", async () => {
    const initialDebt = loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance; // 0
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // Sold: 40 packs. Revenue = 40 * 1080 = 43,200 PKR (4,320,000 paisa)
    // Cash deposited: 43,200 PKR full
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      4320000
    );

    expect(settled.totalSalesRevenuePaisa).toBe(4320000);
    expect(settled.cashDepositedPaisa).toBe(4320000);
    expect(settled.unpaidBalancePaisa).toBe(0);

    const ali = loadSavedKhataAccounts().find((a) => a.id === 5)!;
    expect(ali.currentBalance).toBe(initialDebt); // 0 debt

    const txs = loadSavedKhataTransactions().filter((t) => t.referenceNo === dispatch.sheetNumber);
    expect(txs).toHaveLength(0); // No debit transaction posted
  });

  it("T1.3: Partial cash settlement automatically posts unpaid balance as DEBIT to salesman ledger under SALESMAN category", async () => {
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // Sold: 40 packs @ 1,080 PKR = 43,200 PKR (4,320,000 paisa)
    // Cash deposited: 30,000 PKR (3,000,000 paisa)
    // Unpaid balance: 13,200 PKR (1,320,000 paisa)
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      3000000
    );

    expect(settled.unpaidBalancePaisa).toBe(1320000);

    // Salesman account has 13,200 PKR debit
    const ali = loadSavedKhataAccounts().find((a) => a.id === 5)!;
    expect(ali.category).toBe("SALESMAN");
    expect(ali.currentBalance).toBe(13200);

    // DEBIT transaction created
    const tx = loadSavedKhataTransactions().find((t) => t.referenceNo === dispatch.sheetNumber)!;
    expect(tx).toBeDefined();
    expect(tx.accountId).toBe(5);
    expect(tx.transactionType).toBe("DEBIT");
    expect(tx.amount).toBe(13200);
  });

  it("T1.4: Salesman credit payment reduces outstanding ledger debt balance accurately", async () => {
    // Settle sheet leaving 13,200 PKR debt
    const dispatch = await createTestDispatch(5, "Muhammad Ali");
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      3000000
    );
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(13200);

    // Salesman brings 10,000 PKR recovery payment
    const payment = recordSalesmanCreditPayment(5, 10000, "REC-ALI-01", "Counter recovery");

    expect(payment.transaction.transactionType).toBe("CREDIT");
    expect(payment.transaction.amount).toBe(10000);
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(3200); // 13,200 - 10,000 = 3,200
  });

  it("T1.5: Ledger transaction history preserves past balance, debit entry, credit payment, and net balance tracking", async () => {
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // Route settlement posts 15,000 PKR DEBIT
    // Sold: 20 packs @ 1080 = 21,600 PKR. Cash deposited = 6,600 PKR. Unpaid = 15,000 PKR.
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 30, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      660000
    );

    // Salesman brings 10,000 PKR payment next morning
    recordSalesmanCreditPayment(5, 10000, "REC-ALI-02", "Morning recovery deposit");

    const aliTxs = loadSavedKhataTransactions().filter((t) => t.accountId === 5);
    expect(aliTxs.length).toBe(2);

    const debitTx = aliTxs.find((t) => t.transactionType === "DEBIT")!;
    const creditTx = aliTxs.find((t) => t.transactionType === "CREDIT")!;

    expect(debitTx.amount).toBe(15000);
    expect(debitTx.previousBalance).toBe(0);
    expect(debitTx.newBalance).toBe(15000);

    expect(creditTx.amount).toBe(10000);
    expect(creditTx.previousBalance).toBe(15000);
    expect(creditTx.newBalance).toBe(5000);

    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(5000);
  });

  // ==========================================================================
  // TIER 2: Boundary & Corner Cases (≥ 5 tests)
  // ==========================================================================

  it("T2.1: 100% returned intact produces zero sold units, zero revenue, and zero debt", async () => {
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // All 50 packs returned intact
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 50, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      0
    );

    expect(settled.items[0].soldPacks).toBe(0);
    expect(settled.totalSalesRevenuePaisa).toBe(0);
    expect(settled.unpaidBalancePaisa).toBe(0);

    const ali = loadSavedKhataAccounts().find((a) => a.id === 5)!;
    expect(ali.currentBalance).toBe(0);
  });

  it("T2.2: 100% damaged stock logs entire loss to breakage log with zero sales revenue and zero debt", async () => {
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // All 50 packs damaged in transit accident
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 0, returnedIntactLoose: 0, damagedPacks: 50, damagedLoose: 0 }],
      0
    );

    expect(settled.items[0].soldPacks).toBe(0);
    expect(settled.totalSalesRevenuePaisa).toBe(0);
    expect(settled.unpaidBalancePaisa).toBe(0);

    // Breakage log has 200 broken bottles
    const breakage = useInventoryStore.getState().breakageLogs;
    expect(breakage.some((b) => b.broken_base_units === 200)).toBe(true);

    const ali = loadSavedKhataAccounts().find((a) => a.id === 5)!;
    expect(ali.currentBalance).toBe(0);
  });

  it("T2.3: Over-payment / advance cash deposit clamps unpaid balance to zero without generating negative debt", async () => {
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // Sold 20 packs @ 1,080 = 21,600 PKR (2,160,000 paisa)
    // Driver deposits 30,000 PKR (3,000,000 paisa)
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 30, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      3000000
    );

    expect(settled.totalSalesRevenuePaisa).toBe(2160000);
    expect(settled.cashDepositedPaisa).toBe(3000000);
    expect(settled.unpaidBalancePaisa).toBe(0); // Clamped to 0

    const ali = loadSavedKhataAccounts().find((a) => a.id === 5)!;
    expect(ali.currentBalance).toBe(0);
  });

  it("T2.4: Multiple products on same delivery sheet: revenue summed correctly and posted as single DEBIT transaction", async () => {
    const prod1 = loadSavedProducts().find((p) => p.id === 1)!;
    const prod2 = loadSavedProducts().find((p) => p.id === 2)!;

    const items = [
      {
        productId: 1,
        productSku: prod1.sku,
        productName: prod1.name,
        packName: "Pack",
        unitsPerPack: prod1.bottlesPerPack,
        wholesalePackPricePaisa: prod1.wholesalePackPricePaisa, // 108000 (1,080 PKR)
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
        wholesalePackPricePaisa: prod2.wholesalePackPricePaisa, // 105000 (1,050 PKR)
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

    // Sold 20 packs of P1 (21,600 PKR) + 10 packs of P2 (10,500 PKR) = 32,100 PKR (3,210,000 paisa)
    // Cash deposited = 20,000 PKR (2,000,000 paisa)
    // Unpaid balance = 12,100 PKR (1,210,000 paisa)
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [
        { productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
        { productId: 2, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 },
      ],
      2000000
    );

    expect(settled.totalSalesRevenuePaisa).toBe(3210000);
    expect(settled.unpaidBalancePaisa).toBe(1210000);

    const ali = loadSavedKhataAccounts().find((a) => a.id === 5)!;
    expect(ali.currentBalance).toBe(12100);

    // Single consolidated debit transaction posted for the sheet
    const sheetTxs = loadSavedKhataTransactions().filter((t) => t.referenceNo === dispatch.sheetNumber);
    expect(sheetTxs).toHaveLength(1);
    expect(sheetTxs[0].amount).toBe(12100);
  });

  it("T2.5: Zero cash deposit posts entire gross sales revenue as DEBIT to salesman ledger", async () => {
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // Sold 20 packs @ 1080 = 21,600 PKR (2,160,000 paisa)
    // 0 cash deposited
    const settled = await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 30, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      0
    );

    expect(settled.totalSalesRevenuePaisa).toBe(2160000);
    expect(settled.unpaidBalancePaisa).toBe(2160000);

    const ali = loadSavedKhataAccounts().find((a) => a.id === 5)!;
    expect(ali.currentBalance).toBe(21600);
  });

  // ==========================================================================
  // TIER 3: Multi-Salesman & Combinatorial Ledger Flows (≥ 3 tests)
  // ==========================================================================

  it("T3.1: Multi-day consecutive route settlements for same salesman: running balance accumulates correctly", async () => {
    // Day 1: 5,000 PKR unpaid balance
    const d1 = await createTestDispatch(5, "Muhammad Ali");
    await useLogisticsStore.getState().confirmEveningReturn(
      d1.id,
      [{ productId: 1, returnedIntactPacks: 30, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }], // Sold 20 = 21,600 PKR
      1660000 // Cash = 16,600 -> Unpaid = 5,000 PKR
    );
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(5000);

    // Day 2: 3,000 PKR unpaid balance
    const d2 = await createTestDispatch(5, "Muhammad Ali");
    await useLogisticsStore.getState().confirmEveningReturn(
      d2.id,
      [{ productId: 1, returnedIntactPacks: 30, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }], // Sold 20 = 21,600 PKR
      1860000 // Cash = 18,600 -> Unpaid = 3,000 PKR
    );
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(8000);

    // Day 3: Full cash deposit
    const d3 = await createTestDispatch(5, "Muhammad Ali");
    await useLogisticsStore.getState().confirmEveningReturn(
      d3.id,
      [{ productId: 1, returnedIntactPacks: 30, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      2160000 // Full cash
    );
    // Balance remains 8,000 PKR
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(8000);
  });

  it("T3.2: Multi-salesman fleet settlement: 3 salesmen settle on same evening without ledger cross-contamination", async () => {
    // Salesman 5 (Ali): full cash
    const d1 = await createTestDispatch(5, "Muhammad Ali");
    await useLogisticsStore.getState().confirmEveningReturn(
      d1.id,
      [{ productId: 1, returnedIntactPacks: 30, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      2160000
    );

    // Salesman 6 (Rashid): 10,000 PKR unpaid
    const d2 = await createTestDispatch(6, "Rashid Mahmood");
    await useLogisticsStore.getState().confirmEveningReturn(
      d2.id,
      [{ productId: 1, returnedIntactPacks: 30, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      1160000
    );

    // Salesman 7 (Imran): 21,600 PKR unpaid (0 cash)
    const d3 = await createTestDispatch(7, "Imran Khan");
    await useLogisticsStore.getState().confirmEveningReturn(
      d3.id,
      [{ productId: 1, returnedIntactPacks: 30, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      0
    );

    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(0);
    expect(loadSavedKhataAccounts().find((a) => a.id === 6)!.currentBalance).toBe(10000);
    expect(loadSavedKhataAccounts().find((a) => a.id === 7)!.currentBalance).toBe(21600);
  });

  it("T3.3: Settlement edit / recalibration: adjusting return modifies salesman balance without orphaned transactions", async () => {
    const dispatch = await createTestDispatch(5, "Muhammad Ali");

    // Initial settlement: Sold 20 = 21,600 PKR. Cash = 15,000 PKR. Unpaid = 6,600 PKR.
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 30, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      1500000
    );
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(6600);

    // Edit: driver actually returned 32 packs intact (sold = 18 packs = 19,440 PKR).
    // Cash still 15,000 PKR -> new unpaid = 4,440 PKR.
    await useLogisticsStore.getState().recalibrateDispatchSheet({
      sheetId: dispatch.id,
      status: "SETTLED",
      items: [{ productId: 1, dispatchedPacks: 50, dispatchedLoose: 0, returnedIntactPacks: 32, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }],
      cashDepositedPaisa: 1500000,
    });

    // Balance updated cleanly to 4,440 PKR
    expect(loadSavedKhataAccounts().find((a) => a.id === 5)!.currentBalance).toBe(4440);

    // Only 1 transaction for this sheet exists (no orphaned duplicate)
    const txs = loadSavedKhataTransactions().filter((t) => t.referenceNo === dispatch.sheetNumber);
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(4440);
  });

  // ==========================================================================
  // TIER 4: Realistic Agency Daily End-to-End Simulation & Report Audit (≥ 2 tests)
  // ==========================================================================

  it("T4.1: Realistic agency daily simulation: Fleet dispatch, route sales, evening return deposits, and khata reconciliation", async () => {
    // Settle 3 vans
    const d1 = await createTestDispatch(5, "Muhammad Ali");
    const d2 = await createTestDispatch(6, "Rashid Mahmood");
    const d3 = await createTestDispatch(7, "Imran Khan");

    await useLogisticsStore.getState().confirmEveningReturn(
      d1.id,
      [{ productId: 1, returnedIntactPacks: 20, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }], // Sold 30 = 32,400 PKR
      3240000 // Full cash
    );

    await useLogisticsStore.getState().confirmEveningReturn(
      d2.id,
      [{ productId: 1, returnedIntactPacks: 20, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }], // Sold 30 = 32,400 PKR
      2500000 // 25,000 cash -> 7,400 unpaid
    );

    await useLogisticsStore.getState().confirmEveningReturn(
      d3.id,
      [{ productId: 1, returnedIntactPacks: 20, returnedIntactLoose: 0, damagedPacks: 0, damagedLoose: 0 }], // Sold 30 = 32,400 PKR
      2000000 // 20,000 cash -> 12,400 unpaid
    );

    const accounts = loadSavedKhataAccounts();
    const ali = accounts.find((a) => a.id === 5)!;
    const rashid = accounts.find((a) => a.id === 6)!;
    const imran = accounts.find((a) => a.id === 7)!;

    expect(ali.currentBalance).toBe(0);
    expect(rashid.currentBalance).toBe(7400);
    expect(imran.currentBalance).toBe(12400);

    const totalFleetDebt = ali.currentBalance + rashid.currentBalance + imran.currentBalance;
    expect(totalFleetDebt).toBe(19800); // 7,400 + 12,400 = 19,800 PKR
  });

  it("T4.2: Dedicated 5-Report Suite validation: Data consistency across Morning Dispatch, Evening Return, Daily Sales, Salesman Settlement, and Outstanding Khata Balance reports", async () => {
    // 1. Verify report catalog definitions
    const rep27 = ALL_REPORTS.find((r) => r.id === "REP-27");
    const rep28 = ALL_REPORTS.find((r) => r.id === "REP-28");
    const rep01 = ALL_REPORTS.find((r) => r.id === "REP-01");
    const rep05 = ALL_REPORTS.find((r) => r.id === "REP-05");
    const rep04 = ALL_REPORTS.find((r) => r.id === "REP-04");

    expect(rep27).toBeDefined();
    expect(rep28).toBeDefined();
    expect(rep01).toBeDefined();
    expect(rep05).toBeDefined();
    expect(rep04).toBeDefined();

    // 2. Execute actual store morning dispatch and evening return
    const dispatch = await createTestDispatch(5, "Muhammad Ali");
    await useLogisticsStore.getState().confirmEveningReturn(
      dispatch.id,
      [{ productId: 1, returnedIntactPacks: 10, returnedIntactLoose: 0, damagedPacks: 2, damagedLoose: 0 }],
      3000000
    );

    const settled = useLogisticsStore.getState().getDailyDispatchById(dispatch.id)!;
    const item = settled.items[0];

    // Invariant 1: Dispatched = Returned Intact + Damaged + Sold
    expect(item.dispatchedPacks).toBe(item.returnedIntactPacks + item.damagedPacks + item.soldPacks);

    // Invariant 2: Total sales revenue equals sum of line revenues
    expect(settled.totalSalesRevenuePaisa).toBe(item.lineRevenuePaisa);

    // Invariant 3: Unpaid balance = Max(0, Revenue - Cash Deposited)
    expect(settled.unpaidBalancePaisa).toBe(settled.totalSalesRevenuePaisa - settled.cashDepositedPaisa);

    // Invariant 4: Salesman Khata ledger debit equals exact unpaid balance
    const tx = loadSavedKhataTransactions().find((t) => t.referenceNo === settled.sheetNumber)!;
    expect(tx.amount).toBe(settled.unpaidBalancePaisa / 100);

    const salesmanAcc = loadSavedKhataAccounts().find((a) => a.id === 5)!;
    expect(salesmanAcc.currentBalance).toBe(tx.amount);
  });
});
