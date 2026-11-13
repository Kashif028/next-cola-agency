/**
 * Tier 1: Feature 23 - E2E Acceptance Verification & Hardening
 * Minimum 5 test cases synthesizing acceptance criteria flows and invariant checks.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F23 - E2E Acceptance Verification & Hardening', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F23-T1: Synthesized Flow: 50,000 PKR credit sale followed by 20,000 PKR partial recovery leaves exactly 30,000 PKR balance', () => {
    // Step 1: Credit sale
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F23-1',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 50, unitPrice: 1000.00 }], // 50,000 PKR
      paymentType: 'CREDIT',
    });

    // Step 2: Partial recovery
    const rec = engine.recordRecovery({
      customerId: 1,
      amount: 20000.00,
      paymentMode: 'CASH',
    });

    assert.strictEqual(rec.newCustomerBalance, 30000.00);
    assert.strictEqual(engine.getCashBalance(), 20000.00);
  });

  it('F23-T2: Synthesized Flow: Purchase -> Cash Sale -> Expense verifies accurate Net Profit and Cash Book', () => {
    // 1. Purchase 50 cartons @ 1,000 PKR cash
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', refType: 'I', refId: 1, description: 'Init', cashIn: 100000.00 });
    engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-F23-1',
      purchaseDate: '2026-11-02',
      items: [{ productId: 3, packQty: 50, unitCost: 1000.00 }],
      paymentStatus: 'PAID',
      paidAmount: 50000.00,
    });

    // 2. Sell 20 cartons @ 1,200 PKR cash (Revenue = 24,000, COGS = 20,000, GP = 4,000)
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F23-2',
      invoiceDate: '2026-11-02',
      items: [{ productId: 3, packQty: 20, unitPrice: 1200.00 }],
      paymentType: 'CASH',
    });

    // 3. Record 1,000 PKR expense
    db.prepare("INSERT INTO operating_expenses (expense_date, account_id, amount, payment_mode, description) VALUES ('2026-11-02', 6010, 1000.00, 'CASH', 'Fuel')").run();
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'EXPENSE_PAYMENT', refType: 'E', refId: 1, description: 'Fuel', cashIn: 0, cashOut: 1000.00 });

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.netSalesRevenue, 24000.00);
    assert.strictEqual(pnl.totalCogs, 20000.00);
    assert.strictEqual(pnl.grossProfit, 4000.00);
    assert.strictEqual(pnl.netOperatingProfit, 3000.00);

    // Cash Book: 100,000 - 50,000 + 24,000 - 1,000 = 73,000 PKR
    assert.strictEqual(engine.getCashBalance(), 73000.00);
  });

  it('F23-T3: Multi-Customer Udhaar Isolation: Invoicing customer A does not affect customer B', () => {
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F23-A',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    const c1 = db.prepare('SELECT current_balance FROM customers WHERE id = 1').get().current_balance;
    const c2 = db.prepare('SELECT current_balance FROM customers WHERE id = 2').get().current_balance;

    assert.strictEqual(c1, 10000.00);
    assert.strictEqual(c2, 0.00, 'Customer 2 balance must remain zero');
  });

  it('F23-T4: Crate Deposit Invariant: 100 crates security deposit increases cash and deposit balance without altering P&L', () => {
    engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 100,
      depositPaid: 25000.00,
    });

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.grossSalesRevenue, 0.00);
    assert.strictEqual(pnl.depositLiability, 25000.00);
    assert.strictEqual(engine.getCashBalance(), 25000.00);
  });

  it('F23-T5: Daily closing reconciliation cleanly reports balanced day with multi-category transactions', () => {
    const today = '2026-11-02';
    // Cash sale 30k
    engine.recordCashBookEntry({ date: today, type: 'CASH_SALE', refType: 'I', refId: 1, cashIn: 30000.00 });
    // Recovery 10k
    engine.recordCashBookEntry({ date: today, type: 'UDHAAR_RECOVERY', refType: 'R', refId: 1, cashIn: 10000.00 });
    // Supplier pay 15k
    engine.recordCashBookEntry({ date: today, type: 'SUPPLIER_PAYMENT', refType: 'P', refId: 1, cashIn: 0, cashOut: 15000.00 });
    // Expense 5k
    engine.recordCashBookEntry({ date: today, type: 'EXPENSE_PAYMENT', refType: 'E', refId: 1, cashIn: 0, cashOut: 5000.00 });

    // Expected = 0 + 30k + 10k - 15k - 5k = 20,000 PKR
    const closing = engine.executeDailyClosing({
      closingDate: today,
      openingCash: 0,
      physicalCash: 20000.00,
      denominations: { 5000: 4 },
      closedBy: 1,
    });

    assert.strictEqual(closing.expectedClosingCash, 20000.00);
    assert.strictEqual(closing.cashVariance, 0.00);
    assert.strictEqual(closing.status, 'BALANCED');
  });
});
