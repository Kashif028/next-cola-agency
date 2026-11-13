/**
 * Acceptance Criteria Verification Suite (1-to-1 Mapping to ORIGINAL_REQUEST.md)
 *
 * 1. Credit Sale Test: Selling 50,000 PKR worth of stock with 0 cash received increases
 *    customer outstanding balance by 50,000 PKR, decreases stock by the exact sold units,
 *    and leaves the cash book balance completely unchanged.
 * 2. Partial Recovery Test: Receiving a 20,000 PKR payment against an outstanding 50,000 PKR
 *    customer balance updates the remaining balance to 30,000 PKR and records a 20,000 PKR entry in Cash In.
 * 3. Expense Test: Recording a 2,000 PKR fuel expense reduces current cash by 2,000 PKR and
 *    posts immediately to operating expenses and the Profit & Loss statement.
 * 4. Purchase Test: Recording a 100,000 PKR purchase from a supplier immediately increments
 *    warehouse stock and updates supplier payable by 100,000 PKR when unpaid.
 * 5. Crate Return Test: Receiving 10 empty crates from a customer adjusts customer crate balance
 *    and warehouse crate inventory without altering liquid drink stock or sales revenue.
 * 6. Daily Closing Test: Reconciles opening cash, cash sales, recoveries, supplier payments,
 *    and expenses to produce expected closing cash, cleanly highlighting any variance against physical cash count.
 * 7. COGS Profit Integrity: Demonstrates that gross profit is calculated via revenue minus
 *    Cost of Goods Sold, and refundable crate deposits are held as liabilities rather than booked as sales income.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Acceptance Criteria Verification (ORIGINAL_REQUEST.md AC 1-7)', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  // AC 1: Credit Sale Test
  it('AC1: Credit Sale Test - 50,000 PKR credit sale increases customer balance by 50,000, decrements exact stock, leaves cash book unchanged', () => {
    // Initial State: Customer 1 balance = 0, Product 2 (Next Cola 1.5L PET) stock = 600 base units (100 cartons)
    // Starting cash book balance = 10,000 PKR
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'CAPITAL',
      refType: 'INIT',
      refId: 1,
      description: 'Opening Cash Balance',
      cashIn: 10000.00,
      cashOut: 0,
    });

    const initialCash = engine.getCashBalance();
    assert.strictEqual(initialCash, 10000.00, 'Initial cash should be 10,000 PKR');

    const customerBefore = db.prepare('SELECT current_balance FROM customers WHERE id = 1').get();
    assert.strictEqual(customerBefore.current_balance, 0.00, 'Customer initial balance should be 0');

    const prodBefore = engine.getProduct(2);
    // Product 2: 1 Carton = 6 bottles. Price per carton = 1,000 PKR.
    // 50 Cartons = 50,000 PKR = 300 bottles.
    const initialStock = prodBefore.stock_base_units;

    // Execution: Sell 50 cartons of Product 2 on 100% Credit with 0 cash received
    const result = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-AC-001',
      invoiceDate: '2026-11-02',
      items: [
        { productId: 2, packQty: 50, looseQty: 0, unitPrice: 1000.00 }
      ],
      paymentType: 'CREDIT',
      paidAmount: 0,
    });

    // Verification 1: Net total amount is 50,000 PKR
    assert.strictEqual(result.netTotalAmount, 50000.00, 'Invoice net total must be 50,000 PKR');

    // Verification 2: Customer outstanding balance increased by exactly 50,000 PKR
    const customerAfter = db.prepare('SELECT current_balance FROM customers WHERE id = 1').get();
    assert.strictEqual(customerAfter.current_balance, 50000.00, 'Customer balance must be 50,000 PKR');

    // Verification 3: Warehouse stock decremented by exact sold units (50 cartons * 6 = 300 bottles)
    const prodAfter = engine.getProduct(2);
    assert.strictEqual(prodAfter.stock_base_units, initialStock - 300, 'Stock must decrease by exactly 300 base units (50 cartons)');

    // Verification 4: Cash book balance completely unchanged (10,000 PKR, exactly 0 cash in recorded)
    const finalCash = engine.getCashBalance();
    assert.strictEqual(finalCash, 10000.00, 'Cash book balance must remain completely unchanged');

    const lastCashTx = db.prepare("SELECT * FROM cash_book WHERE ref_voucher_type = 'INVOICE' AND ref_voucher_id = ?").get(result.invoiceId);
    assert.strictEqual(lastCashTx, undefined, 'No cash book entry should exist for 100% credit sale');
  });

  // AC 2: Partial Recovery Test
  it('AC2: Partial Recovery Test - 20,000 PKR recovery against 50,000 PKR updates balance to 30,000 and records 20,000 Cash In', () => {
    // Setup: Customer 1 owes 50,000 PKR; Cash book = 10,000 PKR
    db.prepare('UPDATE customers SET current_balance = 50000.00 WHERE id = 1').run();
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'INIT',
      refType: 'INIT',
      refId: 1,
      description: 'Opening Cash Balance',
      cashIn: 10000.00,
      cashOut: 0,
    });

    // Execution: Record 20,000 PKR cash recovery
    const recoveryResult = engine.recordRecovery({
      customerId: 1,
      amount: 20000.00,
      paymentMode: 'CASH',
      allocationMode: 'ON_ACCOUNT',
    });

    // Verification 1: Customer remaining balance is 30,000 PKR
    assert.strictEqual(recoveryResult.newCustomerBalance, 30000.00, 'Customer balance must be 30,000 PKR');
    const cust = db.prepare('SELECT current_balance FROM customers WHERE id = 1').get();
    assert.strictEqual(cust.current_balance, 30000.00, 'Customer current_balance in DB must be 30,000 PKR');

    // Verification 2: Cash In entry recorded for 20,000 PKR
    const cashEntry = db.prepare("SELECT * FROM cash_book WHERE transaction_type = 'UDHAAR_RECOVERY' ORDER BY id DESC LIMIT 1").get();
    assert.ok(cashEntry, 'Cash book recovery entry must exist');
    assert.strictEqual(cashEntry.cash_in, 20000.00, 'Cash In must be 20,000 PKR');
    assert.strictEqual(cashEntry.cash_out, 0.00, 'Cash Out must be 0 PKR');

    // Verification 3: Running cash balance is now 30,000 PKR (10,000 + 20,000)
    assert.strictEqual(engine.getCashBalance(), 30000.00, 'Running cash balance must be 30,000 PKR');
  });

  // AC 3: Expense Test
  it('AC3: Expense Test - 2,000 PKR fuel expense reduces cash by 2,000 and posts immediately to P&L operating expenses', () => {
    // Setup: Starting cash = 30,000 PKR
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'INIT',
      refType: 'INIT',
      refId: 1,
      description: 'Starting Cash',
      cashIn: 30000.00,
      cashOut: 0,
    });

    // Execution: Record 2,000 PKR vehicle fuel expense
    db.prepare(`
      INSERT INTO operating_expenses (
        expense_date, account_id, amount, payment_mode, recipient_name, description
      ) VALUES ('2026-11-02', 6010, 2000.00, 'CASH', 'PSO Fuel Station', 'Toyota Hilux Van Diesel')
    `).run();

    const expenseId = db.prepare('SELECT last_insert_rowid() as id').get().id;

    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'EXPENSE_PAYMENT',
      refType: 'EXPENSE',
      refId: expenseId,
      accountId: 6010,
      description: 'Vehicle Diesel Fuel Expense',
      cashIn: 0,
      cashOut: 2000.00,
    });

    // Verification 1: Current cash reduced by 2,000 PKR (30,000 - 2,000 = 28,000)
    assert.strictEqual(engine.getCashBalance(), 28000.00, 'Cash balance must be 28,000 PKR');

    // Verification 2: Posts immediately to Profit & Loss operating expenses
    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.totalOperatingExpenses, 2000.00, 'Total operating expenses must reflect 2,000 PKR');
    assert.strictEqual(pnl.netOperatingProfit, -2000.00, 'Net operating profit must be -2,000 PKR with 0 revenue');
  });

  // AC 4: Purchase Test
  it('AC4: Purchase Test - 100,000 PKR purchase immediately increments stock and updates supplier payable by 100,000 when unpaid', () => {
    // Setup: Supplier 1 (Next Beverages Ltd) initial payable = 0
    // Product 3 (Fizz Lemon 250ml Can): 1 Carton = 24 cans. Cost = 1,000 PKR / carton.
    // Stock initial = 480 base units (20 cartons)
    const prodBefore = engine.getProduct(3);
    const initialStock = prodBefore.stock_base_units;
    const suppBefore = db.prepare('SELECT current_payable FROM suppliers WHERE id = 1').get();
    assert.strictEqual(suppBefore.current_payable, 0.00, 'Supplier initial payable must be 0');

    // Execution: Record 100,000 PKR purchase (100 cartons of Product 3 @ 1,000 PKR) unpaid
    const purchaseResult = engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-AC-001',
      purchaseDate: '2026-11-02',
      items: [
        { productId: 3, packQty: 100, looseQty: 0, unitCost: 1000.00 }
      ],
      freight: 0,
      unloadingLabor: 0,
      transitTax: 0,
      paymentStatus: 'UNPAID',
      paidAmount: 0,
    });

    // Verification 1: Base invoice cost and landed cost = 100,000 PKR
    assert.strictEqual(purchaseResult.baseInvoiceCost, 100000.00, 'Base invoice cost must be 100,000 PKR');
    assert.strictEqual(purchaseResult.totalLandedCost, 100000.00, 'Total landed cost must be 100,000 PKR');

    // Verification 2: Warehouse stock immediately incremented by 100 cartons (2,400 cans)
    const prodAfter = engine.getProduct(3);
    assert.strictEqual(prodAfter.stock_base_units, initialStock + 2400, 'Stock must increment by exactly 2,400 cans (100 cartons)');

    // Verification 3: Supplier payable updated to 100,000 PKR
    const suppAfter = db.prepare('SELECT current_payable FROM suppliers WHERE id = 1').get();
    assert.strictEqual(suppAfter.current_payable, 100000.00, 'Supplier payable must be 100,000 PKR');
  });

  // AC 5: Crate Return Test
  it('AC5: Crate Return Test - Receiving 10 empty crates adjusts crate balance and warehouse crate inventory without altering liquid stock or revenue', () => {
    // Setup: Customer 1 owes 25 crates and 30,000 PKR financial debt
    db.prepare('UPDATE customers SET current_crate_balance = 25, current_balance = 30000.00 WHERE id = 1').run();

    // Product 1 (Next Cola 250ml Glass): Liquid stock = 2400 bottles, empty crates in yard = 100
    const prod1Before = engine.getProduct(1);
    const initialLiquidStock = prod1Before.stock_base_units;
    const initialEmptyCratesStock = prod1Before.empty_crates_stock;

    // Record an initial invoice to have day sales revenue
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-AC-DAYREV',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 50, looseQty: 0, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
      adminOverridePin: '1122',
    });
    const revBefore = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30').netSalesRevenue;
    assert.strictEqual(revBefore, 50000.00, 'Day sales revenue must be 50,000 PKR');

    // Execution: Customer returns 10 empty crates against borrowed crate balance (0 deposit refund)
    const crateResult = engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 0,
      cratesIn: 10,
      voucherRef: 'CRT-REC-0001',
      depositPaid: 0,
      depositRefunded: 0,
    });

    // Verification 1: Customer crate balance reduced from 25 to 15
    assert.strictEqual(crateResult.newCustomerCrateBalance, 15, 'Customer crate balance must be 15 (25 - 10)');
    const cust = db.prepare('SELECT current_crate_balance, current_balance FROM customers WHERE id = 1').get();
    assert.strictEqual(cust.current_crate_balance, 15, 'Customer current_crate_balance in DB must be 15');

    // Verification 2: Warehouse empty crate inventory increased by 10 (100 -> 110)
    const prod1After = engine.getProduct(1);
    assert.strictEqual(prod1After.empty_crates_stock, initialEmptyCratesStock + 10, 'Warehouse empty crates must increase by 10');

    // Verification 3: Liquid drink stock is completely unaltered (delta = 0)
    assert.strictEqual(prod1After.stock_base_units, initialLiquidStock, 'Liquid drink stock must remain identical');

    // Verification 4: Day sales revenue is completely unaltered (delta = 0)
    const revAfter = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30').netSalesRevenue;
    assert.strictEqual(revAfter, revBefore, 'Sales revenue must remain completely unaltered');
  });

  // AC 6: Daily Closing Test
  it('AC6: Daily Closing Test - Reconciles opening cash, cash sales, recoveries, supplier payments, expenses to produce expected cash and variance', () => {
    // Formula: Expected = Opening + POS Cash + Recoveries - Supplier Payments - Expenses - Bank Deposits
    // Opening Cash: 15,000 PKR
    // POS Cash Sales: 45,000 PKR
    // Customer Recoveries: 20,000 PKR
    // Supplier Cash Payments: 25,000 PKR
    // Operating Cash Expenses: 5,000 PKR
    // Bank Cash Deposits: 0 PKR
    // Expected Cash = 15,000 + 45,000 + 20,000 - 25,000 - 5,000 - 0 = 50,000 PKR

    const closingDate = '2026-11-02';

    // 1. Inflows
    engine.recordCashBookEntry({
      date: closingDate,
      type: 'CASH_SALE',
      refType: 'INVOICE',
      refId: 101,
      description: 'POS Cash Sales',
      cashIn: 45000.00,
      cashOut: 0,
    });

    engine.recordCashBookEntry({
      date: closingDate,
      type: 'UDHAAR_RECOVERY',
      refType: 'RECOVERY',
      refId: 201,
      description: 'Customer Udhaar Recoveries',
      cashIn: 20000.00,
      cashOut: 0,
    });

    // 2. Outflows
    engine.recordCashBookEntry({
      date: closingDate,
      type: 'SUPPLIER_PAYMENT',
      refType: 'PURCHASE',
      refId: 301,
      description: 'Supplier Cash Payment',
      cashIn: 0,
      cashOut: 25000.00,
    });

    engine.recordCashBookEntry({
      date: closingDate,
      type: 'EXPENSE_PAYMENT',
      refType: 'EXPENSE',
      refId: 401,
      description: 'Operational Cash Expenses',
      cashIn: 0,
      cashOut: 5000.00,
    });

    // Case A: Balanced closing with physical count = 50,000 PKR
    const closingA = engine.executeDailyClosing({
      closingDate,
      openingCash: 15000.00,
      physicalCash: 50000.00,
      denominations: { 5000: 10 }, // 10 x 5000 = 50,000
      closedBy: 1,
      notes: 'Balanced day closing',
    });

    assert.strictEqual(closingA.expectedClosingCash, 50000.00, 'Expected closing cash must be 50,000 PKR');
    assert.strictEqual(closingA.physicalCash, 50000.00, 'Physical cash is 50,000 PKR');
    assert.strictEqual(closingA.cashVariance, 0.00, 'Variance must be 0 for balanced closing');
    assert.strictEqual(closingA.status, 'BALANCED', 'Status must be BALANCED');

    // Case B: Cash Shortage with physical count = 48,500 PKR
    const shortageDate = '2026-11-03';
    // Replay transactions for day 2
    engine.recordCashBookEntry({
      date: shortageDate,
      type: 'CASH_SALE',
      refType: 'INVOICE',
      refId: 102,
      description: 'POS Cash Sales Day 2',
      cashIn: 45000.00,
      cashOut: 0,
    });
    engine.recordCashBookEntry({
      date: shortageDate,
      type: 'UDHAAR_RECOVERY',
      refType: 'RECOVERY',
      refId: 202,
      description: 'Recoveries Day 2',
      cashIn: 20000.00,
      cashOut: 0,
    });
    engine.recordCashBookEntry({
      date: shortageDate,
      type: 'SUPPLIER_PAYMENT',
      refType: 'PURCHASE',
      refId: 302,
      description: 'Supplier Payment Day 2',
      cashIn: 0,
      cashOut: 25000.00,
    });
    engine.recordCashBookEntry({
      date: shortageDate,
      type: 'EXPENSE_PAYMENT',
      refType: 'EXPENSE',
      refId: 402,
      description: 'Expenses Day 2',
      cashIn: 0,
      cashOut: 5000.00,
    });

    const closingB = engine.executeDailyClosing({
      closingDate: shortageDate,
      openingCash: 15000.00,
      physicalCash: 48500.00,
      denominations: { 5000: 9, 1000: 3, 500: 1 }, // 45000 + 3000 + 500 = 48500
      closedBy: 1,
      notes: 'Cash Shortage Detected',
    });

    assert.strictEqual(closingB.expectedClosingCash, 50000.00, 'Expected closing cash must be 50,000 PKR');
    assert.strictEqual(closingB.cashVariance, -1500.00, 'Variance must cleanly highlight -1,500 PKR shortage');
    assert.strictEqual(closingB.status, 'SHORTAGE', 'Status must be SHORTAGE');
  });

  // AC 7: COGS Profit Integrity
  it('AC7: COGS Profit Integrity - Gross profit is revenue minus COGS, crate deposits are liabilities rather than booked as sales income', () => {
    // Transaction 1: Sale of 100 cartons of SKU-2 (Next Cola 1.5L PET)
    // Selling price: 1,200.00 PKR / carton. Net revenue = 120,000 PKR.
    // Purchase cost: 950.00 PKR / carton. COGS = 95,000 PKR.
    // Gross Profit = 120,000 - 95,000 = 25,000 PKR.
    engine.createInvoice({
      customerId: 3,
      invoiceNumber: 'INV-AC7-SALE',
      invoiceDate: '2026-11-02',
      items: [
        { productId: 2, packQty: 100, looseQty: 0, unitPrice: 1200.00 }
      ],
      paymentType: 'CASH',
      paidAmount: 120000.00,
    });

    // Transaction 2: Operating expenses incurred = 8,000 PKR (Vehicle Fuel 5000 + Labor 3000)
    db.prepare(`
      INSERT INTO operating_expenses (expense_date, account_id, amount, payment_mode, recipient_name, description)
      VALUES ('2026-11-02', 6010, 5000.00, 'CASH', 'Fuel Station', 'Diesel')
    `).run();
    db.prepare(`
      INSERT INTO operating_expenses (expense_date, account_id, amount, payment_mode, recipient_name, description)
      VALUES ('2026-11-02', 6030, 3000.00, 'CASH', 'Labor Crew', 'Unloading wages')
    `).run();

    // Transaction 3: 50 empty crates issued on refundable security deposit @ 200 PKR = 10,000 PKR cash
    engine.recordCrateTransaction({
      customerId: 3,
      date: '2026-11-02',
      cratesOut: 50,
      cratesIn: 0,
      voucherRef: 'CRT-DEP-001',
      depositPaid: 10000.00,
      depositRefunded: 0,
    });

    // Calculate P&L
    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');

    // Verification 1: Net Sales Revenue is strictly 120,000 PKR (NOT 130,000 PKR)
    assert.strictEqual(pnl.netSalesRevenue, 120000.00, 'Net Sales Revenue must be strictly 120,000 PKR');

    // Verification 2: Cost of Goods Sold is 95,000 PKR (100 cartons * 950 PKR)
    assert.strictEqual(pnl.totalCogs, 95000.00, 'COGS must be 95,000 PKR');

    // Verification 3: Gross Profit = 120,000 - 95,000 = 25,000 PKR (NOT 35,000 PKR)
    assert.strictEqual(pnl.grossProfit, 25000.00, 'Gross Profit must be exactly 25,000 PKR');

    // Verification 4: Operating Expenses = 8,000 PKR
    assert.strictEqual(pnl.totalOperatingExpenses, 8000.00, 'Operating expenses must be 8,000 PKR');

    // Verification 5: Net Operating Profit = 25,000 - 8,000 = 17,000 PKR (NOT 27,000 PKR)
    assert.strictEqual(pnl.netOperatingProfit, 17000.00, 'Net Operating Profit must be exactly 17,000 PKR');

    // Verification 6: Crate Security Deposit is held strictly as a Balance Sheet Liability (10,000 PKR)
    assert.strictEqual(pnl.depositLiability, 10000.00, 'Deposit liability must be exactly 10,000 PKR held under Current Liabilities');
  });
});
