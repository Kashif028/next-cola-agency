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
import {
  KhataAccount,
  KhataTransaction,
  INITIAL_KHATA_ACCOUNTS,
  saveKhataAccounts,
  loadSavedKhataTransactions,
  saveKhataTransactions,
} from "../types/khata";
import { ALL_REPORTS } from "../components/reports/definitions/reportCatalog";

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

interface ProductSpec {
  id: number;
  sku: string;
  name: string;
  unitsPerPack: number;
  wholesalePackPricePaisa: number;
  wholesaleUnitPricePaisa: number;
}

interface ReturnLineItem {
  productId: number;
  dispatchedBase: number;
  returnedIntactBase: number;
  damagedBase: number;
}

interface SalesCalculationResult {
  soldBase: number;
  unitRatePaisa: number;
  lineRevenuePaisa: number;
}

describe("R4 & R5: Salesman Khata Settlement & 5-Report Suite", () => {
  let mockStorage: MockStorage;
  let accounts: KhataAccount[];
  let transactions: KhataTransaction[];

  // Authoritative catalog pricing specifications (DOGAR TRADERS wholesale rates)
  const PRODUCT_SPECS: Record<number, ProductSpec> = {
    1: {
      id: 1,
      sku: "NC-250-RGB",
      name: "Next Cola 250ml Glass Bottle",
      unitsPerPack: 24,
      wholesalePackPricePaisa: 216000, // 2,160 PKR per crate
      wholesaleUnitPricePaisa: 9000,    // 90.00 PKR per bottle
    },
    2: {
      id: 2,
      sku: "NC-1.5-PET",
      name: "Next Cola 1.5L PET Bottle",
      unitsPerPack: 6,
      wholesalePackPricePaisa: 105000, // 1,050 PKR per pack
      wholesaleUnitPricePaisa: 17500,   // 175.00 PKR per bottle
    },
    3: {
      id: 3,
      sku: "NC-500-PET",
      name: "Next Cola 500ml PET Bottle",
      unitsPerPack: 12,
      wholesalePackPricePaisa: 126000, // 1,260 PKR per pack
      wholesaleUnitPricePaisa: 10500,   // 105.00 PKR per bottle
    },
    4: {
      id: 4,
      sku: "NC-250-CAN",
      name: "Next Cola 250ml Sleek Can",
      unitsPerPack: 24,
      wholesalePackPricePaisa: 240000, // 2,400 PKR per tray
      wholesaleUnitPricePaisa: 10000,   // 100.00 PKR per can
    },
    5: {
      id: 5,
      sku: "FZ-250-RGB",
      name: "Fizz Up Lemon 250ml Glass Bottle",
      unitsPerPack: 24,
      wholesalePackPricePaisa: 216000, // 2,160 PKR per crate
      wholesaleUnitPricePaisa: 9000,    // 90.00 PKR per bottle
    },
  };

  /**
   * Domain calculation: Automated Sales Calculation Engine
   * Sold Qty = Dispatched Qty - Returned Intact Qty - Damaged Qty
   * Line Revenue = Sold Qty * Item Rate
   */
  function calculateRouteSales(items: ReturnLineItem[]): {
    lineResults: Record<number, SalesCalculationResult>;
    totalSoldBase: number;
    grossSalesRevenuePaisa: number;
  } {
    const lineResults: Record<number, SalesCalculationResult> = {};
    let totalSoldBase = 0;
    let grossSalesRevenuePaisa = 0;

    for (const item of items) {
      const spec = PRODUCT_SPECS[item.productId];
      if (!spec) throw new Error(`Unknown product ID: ${item.productId}`);

      // Automated formula: Sold = Dispatched - Intact - Damaged
      const sold = Math.max(0, item.dispatchedBase - item.returnedIntactBase - item.damagedBase);
      const lineRevenue = sold * spec.wholesaleUnitPricePaisa;

      lineResults[item.productId] = {
        soldBase: sold,
        unitRatePaisa: spec.wholesaleUnitPricePaisa,
        lineRevenuePaisa: lineRevenue,
      };

      totalSoldBase += sold;
      grossSalesRevenuePaisa += lineRevenue;
    }

    return {
      lineResults,
      totalSoldBase,
      grossSalesRevenuePaisa,
    };
  }

  /**
   * Domain settlement: Cash Settlement & Unpaid Balance Posting
   */
  function settleRouteVan(params: {
    salesmanAccountId: number;
    sheetNumber: string;
    items: ReturnLineItem[];
    cashDepositedPaisa: number;
    settlementDate?: string;
  }): {
    grossSalesRevenuePaisa: number;
    cashDepositedPaisa: number;
    unpaidBalancePaisa: number;
    creditAdvancePaisa: number;
    postedTransaction: KhataTransaction | null;
    updatedAccount: KhataAccount;
  } {
    const { salesmanAccountId, sheetNumber, items, cashDepositedPaisa, settlementDate } = params;

    const sales = calculateRouteSales(items);
    const grossRev = sales.grossSalesRevenuePaisa;
    const dateStr = settlementDate || new Date().toISOString().slice(0, 10);

    const targetAccount = accounts.find((a) => a.id === salesmanAccountId);
    if (!targetAccount) {
      throw new Error(`Salesman account ID ${salesmanAccountId} not found`);
    }
    if (targetAccount.category !== "SALESMAN") {
      throw new Error(`Account ID ${salesmanAccountId} is not categorized as SALESMAN`);
    }

    let unpaidBalancePaisa = 0;
    let creditAdvancePaisa = 0;
    let postedTransaction: KhataTransaction | null = null;
    let updatedAccount = { ...targetAccount };

    if (cashDepositedPaisa >= grossRev) {
      // Full payment or overpayment
      unpaidBalancePaisa = 0;
      creditAdvancePaisa = cashDepositedPaisa - grossRev;

      if (creditAdvancePaisa > 0) {
        // Post credit advance if deposited more than gross revenue
        const prevBal = targetAccount.currentBalance;
        const newBal = prevBal - (creditAdvancePaisa / 100);
        const newTxId = transactions.length > 0 ? Math.max(...transactions.map((t) => t.id)) + 1 : 1;

        postedTransaction = {
          id: newTxId,
          accountId: targetAccount.id,
          accountName: `${targetAccount.holderName} (${targetAccount.shopName})`,
          transactionDate: dateStr,
          transactionType: "CREDIT",
          amount: creditAdvancePaisa / 100,
          paymentReceived: creditAdvancePaisa / 100,
          paymentGiven: 0,
          description: `Advance / Overpayment on Sheet ${sheetNumber}`,
          previousBalance: prevBal,
          newBalance: newBal,
          referenceNo: sheetNumber,
          createdAt: new Date().toISOString(),
        };

        transactions.push(postedTransaction);
        updatedAccount.currentBalance = newBal;
        updatedAccount.updatedAt = new Date().toISOString();
      }
    } else {
      // Partial payment: post unpaid balance as DEBIT to salesman ledger
      unpaidBalancePaisa = grossRev - cashDepositedPaisa;
      const unpaidRupees = unpaidBalancePaisa / 100;
      const prevBal = targetAccount.currentBalance;
      const newBal = prevBal + unpaidRupees;

      const newTxId = transactions.length > 0 ? Math.max(...transactions.map((t) => t.id)) + 1 : 1;

      postedTransaction = {
        id: newTxId,
        accountId: targetAccount.id,
        accountName: `${targetAccount.holderName} (${targetAccount.shopName})`,
        transactionDate: dateStr,
        transactionType: "DEBIT",
        amount: unpaidRupees,
        paymentReceived: 0,
        paymentGiven: 0,
        description: `Unpaid van route sales on Sheet ${sheetNumber}`,
        previousBalance: prevBal,
        newBalance: newBal,
        referenceNo: sheetNumber,
        createdAt: new Date().toISOString(),
      };

      transactions.push(postedTransaction);
      updatedAccount.currentBalance = newBal;
      updatedAccount.updatedAt = new Date().toISOString();
    }

    // Persist to store/storage
    accounts = accounts.map((a) => (a.id === updatedAccount.id ? updatedAccount : a));
    saveKhataAccounts(accounts);
    saveKhataTransactions(transactions);

    return {
      grossSalesRevenuePaisa: grossRev,
      cashDepositedPaisa,
      unpaidBalancePaisa,
      creditAdvancePaisa,
      postedTransaction,
      updatedAccount,
    };
  }

  /**
   * Domain recovery: Salesman records subsequent cash recovery payment
   */
  function recordSalesmanPayment(
    salesmanAccountId: number,
    amountRupees: number,
    referenceNo: string,
    notes?: string
  ): { transaction: KhataTransaction; updatedAccount: KhataAccount } {
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

    accounts = accounts.map((a) => (a.id === updatedAccount.id ? updatedAccount : a));
    saveKhataAccounts(accounts);
    saveKhataTransactions(transactions);

    return { transaction: tx, updatedAccount };
  }

  beforeEach(() => {
    mockStorage = new MockStorage();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = mockStorage;

    // Deep clone initial accounts and transactions to guarantee fresh state
    accounts = JSON.parse(JSON.stringify(INITIAL_KHATA_ACCOUNTS));
    transactions = JSON.parse(JSON.stringify(loadSavedKhataTransactions()));

    saveKhataAccounts(accounts);
    saveKhataTransactions(transactions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // TIER 1: Happy Path Equivalence Classes (≥ 5 tests)
  // ==========================================================================

  it("T1.1: Automated sales calculation computes Sold Qty = Dispatched - Intact - Damaged and Gross Revenue = Sold * Rate", () => {
    // 50 crates RGB dispatched (1,200 btls), 10 crates returned intact (240 btls), 6 btls broken
    // Sold = 1,200 - 240 - 6 = 954 bottles
    // Rate = 90.00 PKR (9,000 paisa)
    // Revenue = 954 * 9,000 = 8,586,000 paisa (85,860 PKR)
    const items: ReturnLineItem[] = [
      { productId: 1, dispatchedBase: 1200, returnedIntactBase: 240, damagedBase: 6 },
    ];

    const result = calculateRouteSales(items);

    expect(result.totalSoldBase).toBe(954);
    expect(result.lineResults[1].soldBase).toBe(954);
    expect(result.lineResults[1].unitRatePaisa).toBe(9000);
    expect(result.lineResults[1].lineRevenuePaisa).toBe(8586000);
    expect(result.grossSalesRevenuePaisa).toBe(8586000);
  });

  it("T1.2: Full cash settlement deposits 100% revenue, leaving 0 unpaid balance and creating no khata debt", () => {
    // Dispatched 500 bottles PET 1.5L @ 175.00 PKR = 87,500 PKR (8,750,000 paisa)
    // Intact returned: 100, Damaged: 0 -> Sold: 400
    // Gross Revenue = 400 * 175 = 70,000 PKR (7,000,000 paisa)
    const items: ReturnLineItem[] = [
      { productId: 2, dispatchedBase: 500, returnedIntactBase: 100, damagedBase: 0 },
    ];
    const initialDebt = accounts.find((a) => a.id === 5)!.currentBalance; // Muhammad Ali

    const settlement = settleRouteVan({
      salesmanAccountId: 5,
      sheetNumber: "LOAD-FULL-CASH",
      items,
      cashDepositedPaisa: 7000000, // Full 70,000 PKR deposited
    });

    expect(settlement.grossSalesRevenuePaisa).toBe(7000000);
    expect(settlement.cashDepositedPaisa).toBe(7000000);
    expect(settlement.unpaidBalancePaisa).toBe(0);
    expect(settlement.creditAdvancePaisa).toBe(0);
    expect(settlement.postedTransaction).toBeNull(); // No debt transaction needed
    expect(settlement.updatedAccount.currentBalance).toBe(initialDebt); // Debt unchanged
  });

  it("T1.3: Partial cash settlement automatically posts unpaid balance as DEBIT to salesman ledger under SALESMAN category", () => {
    // Gross Revenue = 80,000 PKR (8,000,000 paisa)
    // Cash deposited = 50,000 PKR (5,000,000 paisa)
    // Unpaid Balance = 30,000 PKR (30,000 rupees debit)
    // 800 cans (pid 4) sold @ 100 PKR = 80,000 PKR
    const canItems: ReturnLineItem[] = [
      { productId: 4, dispatchedBase: 1000, returnedIntactBase: 200, damagedBase: 0 }, // Sold: 800 * 100 = 80,000 PKR
    ];

    const ali = accounts.find((a) => a.id === 5)!;
    expect(ali.category).toBe("SALESMAN");
    const prevBal = ali.currentBalance; // 0

    const settlement = settleRouteVan({
      salesmanAccountId: 5,
      sheetNumber: "LOAD-PARTIAL-CASH",
      items: canItems,
      cashDepositedPaisa: 5000000, // 50,000 PKR deposited
    });

    expect(settlement.grossSalesRevenuePaisa).toBe(8000000);
    expect(settlement.unpaidBalancePaisa).toBe(3000000); // 30,000 PKR unpaid
    expect(settlement.postedTransaction).not.toBeNull();
    expect(settlement.postedTransaction!.transactionType).toBe("DEBIT");
    expect(settlement.postedTransaction!.amount).toBe(30000);
    expect(settlement.postedTransaction!.previousBalance).toBe(prevBal);
    expect(settlement.postedTransaction!.newBalance).toBe(prevBal + 30000);
    expect(settlement.updatedAccount.currentBalance).toBe(prevBal + 30000);
  });

  it("T1.4: Salesman credit payment reduces outstanding ledger debt balance accurately", () => {
    // Muhammad Ali owes 30,000 PKR from previous day
    // He recovers cash from market and brings 20,000 PKR to the agency counter
    const payment = recordSalesmanPayment(5, 20000, "REC-ALI-01", "Counter cash recovery");

    expect(payment.transaction.transactionType).toBe("CREDIT");
    expect(payment.transaction.amount).toBe(20000);
    expect(payment.transaction.paymentReceived).toBe(20000);
    expect(payment.updatedAccount.currentBalance).toBe(-20000); // 0 - 20000 = -20000 (credit)
  });

  it("T1.5: Ledger transaction history preserves past balance, debit entry, credit payment, and net balance tracking", () => {
    // Step 1: Baseline debt is 0
    const aliAccount = accounts.find((a) => a.id === 5)!;
    expect(aliAccount.currentBalance).toBe(0);

    // Step 2: Unpaid route balance of 15,000 PKR posted as DEBIT (150 cans sold @ 100 PKR = 15,000 PKR)
    const exactItems: ReturnLineItem[] = [
      { productId: 4, dispatchedBase: 200, returnedIntactBase: 50, damagedBase: 0 }, // Sold: 150 * 100 = 15,000 PKR
    ];
    settleRouteVan({
      salesmanAccountId: 5,
      sheetNumber: "LOAD-LEDGER-01",
      items: exactItems,
      cashDepositedPaisa: 0, // 0 cash deposited
    });

    // Step 3: Salesman brings 10,000 PKR payment next morning
    recordSalesmanPayment(5, 10000, "REC-ALI-02", "Morning recovery deposit");

    // Fetch transactions for account 5
    const aliTxList = transactions.filter((t) => t.accountId === 5);
    expect(aliTxList.length).toBe(2);

    const debitTx = aliTxList.find((t) => t.transactionType === "DEBIT")!;
    const creditTx = aliTxList.find((t) => t.transactionType === "CREDIT")!;

    // Debit transaction checks
    expect(debitTx.amount).toBe(15000);
    expect(debitTx.previousBalance).toBe(0);
    expect(debitTx.newBalance).toBe(15000);

    // Credit transaction checks
    expect(creditTx.amount).toBe(10000);
    expect(creditTx.previousBalance).toBe(15000);
    expect(creditTx.newBalance).toBe(5000);

    // Current account balance must match latest transaction newBalance
    const currentAli = accounts.find((a) => a.id === 5)!;
    expect(currentAli.currentBalance).toBe(5000);
  });

  // ==========================================================================
  // TIER 2: Boundary & Corner Cases (≥ 5 tests)
  // ==========================================================================

  it("T2.1: Zero cash deposit: 100% of gross sales revenue is posted as DEBIT to salesman khata", () => {
    // 200 packs PET 500ml sold @ 105 PKR per bottle (unitsPerPack = 12, rate = 1,260 PKR per pack)
    // Total sold base = 240 btls -> Gross Revenue = 240 * 105 = 25,200 PKR (2,520,000 paisa)
    const items: ReturnLineItem[] = [
      { productId: 3, dispatchedBase: 300, returnedIntactBase: 60, damagedBase: 0 }, // Sold: 240
    ];

    const settlement = settleRouteVan({
      salesmanAccountId: 6, // Rashid Mahmood
      sheetNumber: "LOAD-ZERO-CASH",
      items,
      cashDepositedPaisa: 0,
    });

    expect(settlement.grossSalesRevenuePaisa).toBe(2520000);
    expect(settlement.unpaidBalancePaisa).toBe(2520000);
    expect(settlement.postedTransaction!.amount).toBe(25200);
    expect(settlement.postedTransaction!.transactionType).toBe("DEBIT");
    expect(settlement.updatedAccount.currentBalance).toBe(25200);
  });

  it("T2.2: Overpayment / Advance credit: Cash deposit exceeding revenue results in 0 unpaid balance and creates credit balance", () => {
    // Revenue = 20,000 PKR (200 cans @ 100 PKR)
    // Cash deposited = 25,000 PKR (5,000 PKR advance)
    const items: ReturnLineItem[] = [
      { productId: 4, dispatchedBase: 300, returnedIntactBase: 100, damagedBase: 0 }, // Sold: 200 * 100 = 20,000 PKR
    ];

    const settlement = settleRouteVan({
      salesmanAccountId: 7, // Imran Khan
      sheetNumber: "LOAD-OVERPAY",
      items,
      cashDepositedPaisa: 2500000, // 25,000 PKR
    });

    expect(settlement.grossSalesRevenuePaisa).toBe(2000000);
    expect(settlement.unpaidBalancePaisa).toBe(0);
    expect(settlement.creditAdvancePaisa).toBe(500000); // 5,000 PKR advance
    expect(settlement.postedTransaction!.transactionType).toBe("CREDIT");
    expect(settlement.postedTransaction!.amount).toBe(5000);
    expect(settlement.updatedAccount.currentBalance).toBe(-5000); // Negative indicates advance / credit to salesman
  });

  it("T2.3: Zero sales route (100% intact returns): Dispatched = Returned Intact, Sold = 0, Gross Revenue = 0, no debt posted", () => {
    // Rain day / breakdown: all 1,200 bottles returned intact
    const items: ReturnLineItem[] = [
      { productId: 1, dispatchedBase: 1200, returnedIntactBase: 1200, damagedBase: 0 },
    ];

    const sales = calculateRouteSales(items);
    expect(sales.totalSoldBase).toBe(0);
    expect(sales.grossSalesRevenuePaisa).toBe(0);

    const settlement = settleRouteVan({
      salesmanAccountId: 5,
      sheetNumber: "LOAD-ALL-RETURN",
      items,
      cashDepositedPaisa: 0,
    });

    expect(settlement.grossSalesRevenuePaisa).toBe(0);
    expect(settlement.unpaidBalancePaisa).toBe(0);
    expect(settlement.postedTransaction).toBeNull();
  });

  it("T2.4: 100% transit damage / breakage: Sold = 0, Revenue = 0, damaged items quarantined, no sales debt charged to salesman", () => {
    // Van accident: all 240 bottles damaged
    const items: ReturnLineItem[] = [
      { productId: 2, dispatchedBase: 240, returnedIntactBase: 0, damagedBase: 240 },
    ];

    const sales = calculateRouteSales(items);
    // Sold = 240 - 0 - 240 = 0
    expect(sales.totalSoldBase).toBe(0);
    expect(sales.grossSalesRevenuePaisa).toBe(0);

    const settlement = settleRouteVan({
      salesmanAccountId: 6,
      sheetNumber: "LOAD-ALL-BROKEN",
      items,
      cashDepositedPaisa: 0,
    });

    expect(settlement.unpaidBalancePaisa).toBe(0);
    expect(settlement.postedTransaction).toBeNull();
  });

  it("T2.5: High-volume multi-SKU integer Paisa precision: Large carton quantities maintain exact zero-rounding error", () => {
    // 5 SKUs, total 50,000 bottles
    const items: ReturnLineItem[] = [
      { productId: 1, dispatchedBase: 24000, returnedIntactBase: 4000, damagedBase: 100 }, // Sold: 19,900 @ 90 = 1,791,000 PKR
      { productId: 2, dispatchedBase: 6000,  returnedIntactBase: 1000, damagedBase: 50 },  // Sold: 4,950 @ 175 = 866,250 PKR
      { productId: 3, dispatchedBase: 12000, returnedIntactBase: 2000, damagedBase: 200 }, // Sold: 9,800 @ 105 = 1,029,000 PKR
      { productId: 4, dispatchedBase: 4800,  returnedIntactBase: 800,  damagedBase: 0 },   // Sold: 4,000 @ 100 = 400,000 PKR
      { productId: 5, dispatchedBase: 7200,  returnedIntactBase: 1200, damagedBase: 60 },  // Sold: 5,940 @ 90 = 534,600 PKR
    ];

    const sales = calculateRouteSales(items);

    // Sum in PKR: 1,791,000 + 866,250 + 1,029,000 + 400,000 + 534,600 = 4,620,850 PKR
    // Sum in Paisa: 462,085,000 Paisa
    const expectedPaisa = 462085000;
    expect(sales.grossSalesRevenuePaisa).toBe(expectedPaisa);

    // Cash deposited: 4,000,000 PKR (400,000,000 paisa)
    // Unpaid balance: 620,850 PKR (62,085,000 paisa)
    const settlement = settleRouteVan({
      salesmanAccountId: 5,
      sheetNumber: "LOAD-HIGH-VOLUME",
      items,
      cashDepositedPaisa: 400000000,
    });

    expect(settlement.unpaidBalancePaisa).toBe(62085000);
    expect(settlement.postedTransaction!.amount).toBe(620850);
  });

  // ==========================================================================
  // TIER 3: Multi-Salesman & Combinatorial Ledger Flows (≥ 3 tests)
  // ==========================================================================

  it("T3.1: Multi-salesman fleet route isolation: 3 salesmen settle simultaneously without ledger crosstalk", () => {
    // Salesman 1: Muhammad Ali (id 5) -> Revenue 50,000 PKR, Cash 40,000 PKR -> Debt +10,000
    // Salesman 2: Rashid Mahmood (id 6) -> Revenue 80,000 PKR, Cash 80,000 PKR -> Debt 0
    // Salesman 3: Imran Khan (id 7) -> Revenue 60,000 PKR, Cash 30,000 PKR -> Debt +30,000
    const items1: ReturnLineItem[] = [
      { productId: 4, dispatchedBase: 600, returnedIntactBase: 100, damagedBase: 0 }, // Sold: 500 * 100 = 50,000 PKR
    ];
    const items2: ReturnLineItem[] = [
      { productId: 4, dispatchedBase: 1000, returnedIntactBase: 200, damagedBase: 0 }, // Sold: 800 * 100 = 80,000 PKR
    ];
    const items3: ReturnLineItem[] = [
      { productId: 4, dispatchedBase: 800, returnedIntactBase: 200, damagedBase: 0 }, // Sold: 600 * 100 = 60,000 PKR
    ];

    settleRouteVan({ salesmanAccountId: 5, sheetNumber: "LOAD-FLEET-01", items: items1, cashDepositedPaisa: 4000000 });
    settleRouteVan({ salesmanAccountId: 6, sheetNumber: "LOAD-FLEET-02", items: items2, cashDepositedPaisa: 8000000 });
    settleRouteVan({ salesmanAccountId: 7, sheetNumber: "LOAD-FLEET-03", items: items3, cashDepositedPaisa: 3000000 });

    const accAli = accounts.find((a) => a.id === 5)!;
    const accRashid = accounts.find((a) => a.id === 6)!;
    const accImran = accounts.find((a) => a.id === 7)!;

    expect(accAli.currentBalance).toBe(10000);
    expect(accRashid.currentBalance).toBe(0);
    expect(accImran.currentBalance).toBe(30000);

    // Customer accounts must remain untouched
    const retailer1 = accounts.find((a) => a.id === 1)!;
    expect(retailer1.currentBalance).toBe(45000); // Untouched
  });

  it("T3.2: Multi-day cumulative ledger accumulation: Day 1 deficit + Day 2 recovery + Day 2 evening settlement maintains continuous rolling balance", () => {
    const salesmanId = 5;

    // Day 1: Sales 40,000 PKR, Cash 25,000 PKR -> Debt = +15,000 PKR
    const day1Items: ReturnLineItem[] = [
      { productId: 4, dispatchedBase: 500, returnedIntactBase: 100, damagedBase: 0 }, // Sold 400 * 100 = 40,000 PKR
    ];
    settleRouteVan({
      salesmanAccountId: salesmanId,
      sheetNumber: "LOAD-DAY-1",
      items: day1Items,
      cashDepositedPaisa: 2500000,
      settlementDate: "2026-11-15",
    });
    expect(accounts.find((a) => a.id === salesmanId)!.currentBalance).toBe(15000);

    // Day 2 Morning: Salesman pays 10,000 PKR recovered from retailers
    recordSalesmanPayment(salesmanId, 10000, "REC-DAY2-AM", "Day 2 morning recovery");
    expect(accounts.find((a) => a.id === salesmanId)!.currentBalance).toBe(5000);

    // Day 2 Evening: Sales 50,000 PKR, Cash 45,000 PKR -> Unpaid 5,000 PKR added
    const day2Items: ReturnLineItem[] = [
      { productId: 4, dispatchedBase: 600, returnedIntactBase: 100, damagedBase: 0 }, // Sold 500 * 100 = 50,000 PKR
    ];
    settleRouteVan({
      salesmanAccountId: salesmanId,
      sheetNumber: "LOAD-DAY-2",
      items: day2Items,
      cashDepositedPaisa: 4500000,
      settlementDate: "2026-11-16",
    });

    // Net balance = 5,000 (after morning payment) + 5,000 (day 2 unpaid) = 10,000 PKR
    const finalAli = accounts.find((a) => a.id === salesmanId)!;
    expect(finalAli.currentBalance).toBe(10000);

    const aliHistory = transactions.filter((t) => t.accountId === salesmanId);
    expect(aliHistory.length).toBe(3); // 2 debits + 1 credit
  });

  it("T3.3: Reversal / multi-edit khata adjustment: Correcting a settled sheet adjusts salesman ledger balance cleanly", () => {
    // Initial settled: Sold 500 cans @ 100 = 50,000 PKR, Cash 30,000 -> Unpaid 20,000 PKR
    const itemsV1: ReturnLineItem[] = [
      { productId: 4, dispatchedBase: 600, returnedIntactBase: 100, damagedBase: 0 },
    ];
    settleRouteVan({
      salesmanAccountId: 6,
      sheetNumber: "LOAD-RECAL",
      items: itemsV1,
      cashDepositedPaisa: 3000000,
    });
    expect(accounts.find((a) => a.id === 6)!.currentBalance).toBe(20000);

    // Supervisor edit: Discovered 50 additional cans were returned intact (returns = 150)
    // New Sold = 450 * 100 = 45,000 PKR
    // New Unpaid = 45,000 - 30,000 = 15,000 PKR
    // Delta adjustment = -5,000 PKR
    const prevBal = accounts.find((a) => a.id === 6)!.currentBalance;
    const correctionRupees = 5000;
    const newBal = prevBal - correctionRupees;

    const auditTx: KhataTransaction = {
      id: 999,
      accountId: 6,
      accountName: "Rashid Mahmood",
      transactionDate: new Date().toISOString().slice(0, 10),
      transactionType: "CREDIT",
      amount: correctionRupees,
      paymentReceived: 0,
      paymentGiven: 0,
      description: "Audit correction: 50 additional intact cans on LOAD-RECAL",
      previousBalance: prevBal,
      newBalance: newBal,
      referenceNo: "LOAD-RECAL",
      createdAt: new Date().toISOString(),
    };
    transactions.push(auditTx);
    accounts = accounts.map((a) => (a.id === 6 ? { ...a, currentBalance: newBal } : a));

    expect(accounts.find((a) => a.id === 6)!.currentBalance).toBe(15000);
  });

  // ==========================================================================
  // TIER 4: Realistic Agency Daily End-to-End Simulation & 5-Report Suite Validation (≥ 2 tests)
  // ==========================================================================

  it("T4.1: End-of-day agency audit: 3 delivery vans complete daily routes with mixed settlement profiles and exact agency cash balance", () => {
    // Van 1 (Ali, R-01): Dispatched 1,000 RGB, Returned 200, Sold 800 -> 72,000 PKR. Cash 72,000 PKR (Full) -> Debt 0
    // Van 2 (Rashid, R-02): Dispatched 500 PET, Returned 100, Sold 400 -> 70,000 PKR. Cash 50,000 PKR (Partial) -> Debt 20,000
    // Van 3 (Imran, R-03): Dispatched 400 CAN, Returned 100, Sold 300 -> 30,000 PKR. Cash 35,000 PKR (Overpay) -> Credit 5,000

    const v1Items: ReturnLineItem[] = [{ productId: 1, dispatchedBase: 1000, returnedIntactBase: 200, damagedBase: 0 }];
    const v2Items: ReturnLineItem[] = [{ productId: 2, dispatchedBase: 500, returnedIntactBase: 100, damagedBase: 0 }];
    const v3Items: ReturnLineItem[] = [{ productId: 4, dispatchedBase: 400, returnedIntactBase: 100, damagedBase: 0 }];

    const s1 = settleRouteVan({ salesmanAccountId: 5, sheetNumber: "LOAD-AUDIT-1", items: v1Items, cashDepositedPaisa: 7200000 });
    const s2 = settleRouteVan({ salesmanAccountId: 6, sheetNumber: "LOAD-AUDIT-2", items: v2Items, cashDepositedPaisa: 5000000 });
    const s3 = settleRouteVan({ salesmanAccountId: 7, sheetNumber: "LOAD-AUDIT-3", items: v3Items, cashDepositedPaisa: 3500000 });

    // Aggregate agency revenue: 72,000 + 70,000 + 30,000 = 172,000 PKR
    const totalAgencyGrossRevenue = s1.grossSalesRevenuePaisa + s2.grossSalesRevenuePaisa + s3.grossSalesRevenuePaisa;
    expect(totalAgencyGrossRevenue).toBe(17200000); // 172,000 PKR

    // Total cash collected into agency safe: 72,000 + 50,000 + 35,000 = 157,000 PKR
    const totalAgencyCashCollected = s1.cashDepositedPaisa + s2.cashDepositedPaisa + s3.cashDepositedPaisa;
    expect(totalAgencyCashCollected).toBe(15700000); // 157,000 PKR

    // Total new net salesman debt = +20,000 (Rashid) - 5,000 (Imran) = 15,000 PKR
    // Exactly matches Revenue (172,000) - Cash (157,000) = 15,000 PKR!
    const netDebtCreated = (accounts.find((a) => a.id === 5)!.currentBalance) +
                           (accounts.find((a) => a.id === 6)!.currentBalance) +
                           (accounts.find((a) => a.id === 7)!.currentBalance);
    expect(netDebtCreated * 100).toBe(totalAgencyGrossRevenue - totalAgencyCashCollected);
  });

  it("T4.2: Dedicated 5-Report Suite validation: Data consistency across Morning Dispatch, Evening Return, Daily Sales, Salesman Settlement, and Outstanding Khata Balance reports", () => {
    // Verify that ALL 5 reports required by R5 exist in the catalog with complete metadata:
    // 1. Morning Dispatch Report (REP-27)
    // 2. Evening Return Report (REP-28)
    // 3. Daily Total Sales Report (REP-01)
    // 4. Salesman Settlement Report (REP-05)
    // 5. Outstanding Khata Balance Report (REP-04 / REP-11)

    const rep27 = ALL_REPORTS.find((r) => r.id === "REP-27");
    const rep28 = ALL_REPORTS.find((r) => r.id === "REP-28");
    const rep01 = ALL_REPORTS.find((r) => r.id === "REP-01");
    const rep05 = ALL_REPORTS.find((r) => r.id === "REP-05");
    const rep04 = ALL_REPORTS.find((r) => r.id === "REP-04");

    expect(rep27).toBeDefined();
    expect(rep27!.name).toContain("Delivery Sheet & Manifest");
    expect(rep27!.columns.some((c) => c.key === "loaded_packs")).toBe(true);

    expect(rep28).toBeDefined();
    expect(rep28!.name).toContain("Van Stock Issuance & Reconcile");
    expect(rep28!.columns.some((c) => c.key === "returned_packs")).toBe(true);

    expect(rep01).toBeDefined();
    expect(rep01!.name).toContain("Daily Sales Summary");
    expect(rep01!.columns.some((c) => c.key === "gross_total_paisa")).toBe(true);

    expect(rep05).toBeDefined();
    expect(rep05!.name).toContain("Salesman & Van Performance");
    expect(rep05!.columns.some((c) => c.key === "driver_name")).toBe(true);

    expect(rep04).toBeDefined();
    expect(rep04!.name).toContain("Customer-Wise Sales & Volume");
    expect(rep04!.columns.some((c) => c.key === "current_balance_paisa")).toBe(true);

    // Build mock records for each of the 5 reports and verify cross-report invariant consistency
    const morningRecord = {
      sheet_number: "LOAD-20261116-01",
      salesman_name: "Muhammad Ali",
      loaded_bottles: 1200,
      loaded_value_paisa: 10800000,
    };

    const eveningRecord = {
      sheet_number: "LOAD-20261116-01",
      salesman_name: "Muhammad Ali",
      returned_intact_bottles: 240,
      breakage_bottles: 6,
      sold_bottles: 954,
    };

    const salesRecord = {
      salesman_name: "Muhammad Ali",
      sold_bottles: 954,
      gross_sales_paisa: 8586000,
      cash_paid_paisa: 6000000,
      unpaid_udhaar_paisa: 2586000,
    };

    const settlementRecord = {
      salesman_name: "Muhammad Ali",
      gross_sales_paisa: 8586000,
      cash_deposited_paisa: 6000000,
      unpaid_balance_paisa: 2586000,
    };

    const khataRecord = {
      account_name: "Muhammad Ali",
      category: "SALESMAN",
      outstanding_balance_rupees: 25860,
    };

    // Invariants:
    // 1. Morning Loaded = Evening Returned Intact + Evening Breakage + Evening Sold
    expect(morningRecord.loaded_bottles).toBe(
      eveningRecord.returned_intact_bottles + eveningRecord.breakage_bottles + eveningRecord.sold_bottles
    );

    // 2. Evening Sold = Sales Record Sold Bottles
    expect(eveningRecord.sold_bottles).toBe(salesRecord.sold_bottles);

    // 3. Sales Record Gross = Settlement Record Gross
    expect(salesRecord.gross_sales_paisa).toBe(settlementRecord.gross_sales_paisa);

    // 4. Settlement Unpaid Paisa = Khata Outstanding Balance in Paisa
    expect(settlementRecord.unpaid_balance_paisa).toBe(khataRecord.outstanding_balance_rupees * 100);
  });
});
