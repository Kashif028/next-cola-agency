/**
 * Tier 2: F23 - Acceptance Criteria Invariant Boundary Tests
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F23 - Acceptance Criteria Boundary Invariants', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F23-B1: Credit Sale Invariant: Selling 50,000 PKR stock with exact 0 cash changes Cash Book by exactly 0.0000', () => {
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', cashIn: 10000.00 });

    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-AC-B1',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 50, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
      paidAmount: 0,
    });

    assert.strictEqual(engine.getCashBalance(), 10000.00);
  });

  it('F23-B2: Partial Recovery Invariant: Paying exactly 50% (25,000 of 50,000) splits balance 1-to-1', () => {
    db.prepare('UPDATE customers SET current_balance = 50000.00 WHERE id = 1').run();

    const rec = engine.recordRecovery({
      customerId: 1,
      amount: 25000.00,
      paymentMode: 'CASH',
    });

    assert.strictEqual(rec.newCustomerBalance, 25000.00);
    assert.strictEqual(engine.getCashBalance(), 25000.00);
  });

  it('F23-B3: Fuel Expense Invariant: 2,000 PKR fuel expense reduces 30,000 PKR to exact 28,000 PKR', () => {
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', cashIn: 30000.00 });
    db.prepare("INSERT INTO operating_expenses (expense_date, account_id, amount, payment_mode, description) VALUES ('2026-11-02', 6010, 2000.00, 'CASH', 'Diesel')").run();
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'EXPENSE_PAYMENT', accountId: 6010, cashIn: 0, cashOut: 2000.00 });

    assert.strictEqual(engine.getCashBalance(), 28000.00);
  });

  it('F23-B4: Purchase Invariant: 100,000 PKR unpaid purchase leaves liquid cash completely untouched', () => {
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', cashIn: 28000.00 });

    engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-AC-B4',
      purchaseDate: '2026-11-02',
      items: [{ productId: 3, packQty: 100, unitCost: 1000.00 }],
      paymentStatus: 'UNPAID',
    });

    assert.strictEqual(engine.getCashBalance(), 28000.00);
  });

  it('F23-B5: Crate Return Invariant: Returning 10 empty crates leaves liquid stock delta at strictly 0', () => {
    const liquidStockBefore = engine.getProduct(1).stock_base_units;

    engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 0,
      cratesIn: 10,
    });

    const liquidStockAfter = engine.getProduct(1).stock_base_units;
    assert.strictEqual(liquidStockAfter, liquidStockBefore);
  });
});
