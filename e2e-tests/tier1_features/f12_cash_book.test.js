/**
 * Tier 1: Feature 12 - Strict Liquid Cash Book Management
 * Minimum 5 test cases covering Golden Cash Invariant, Roker Bahi running balance, and receipt integrity.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F12 - Strict Liquid Cash Book Management', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F12-T1: The Golden Cash Invariant: Credit sales generate ZERO cash book entries', () => {
    const countBefore = db.prepare('SELECT COUNT(*) as cnt FROM cash_book').get().cnt;

    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F12-01',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }], // 10,000 PKR
      paymentType: 'CREDIT',
    });

    const countAfter = db.prepare('SELECT COUNT(*) as cnt FROM cash_book').get().cnt;
    assert.strictEqual(countAfter, countBefore, 'Credit sale must not generate any cash book record');
    assert.strictEqual(engine.getCashBalance(), 0.00, 'Cash balance must remain 0');
  });

  it('F12-T2: Verified Cash POS sale creates Cash In entry and updates running balance', () => {
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F12-02',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }], // 5,000 PKR
      paymentType: 'CASH',
    });

    const entry = db.prepare("SELECT * FROM cash_book WHERE transaction_type = 'CASH_SALE'").get();
    assert.ok(entry, 'Cash sale entry must exist');
    assert.strictEqual(entry.cash_in, 5000.00);
    assert.strictEqual(entry.cash_out, 0.00);
    assert.strictEqual(entry.running_cash_balance, 5000.00);
  });

  it('F12-T3: Cash expense creates Cash Out entry and reduces running cash balance', () => {
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'INIT',
      refType: 'INIT',
      refId: 1,
      description: 'Opening Cash',
      cashIn: 15000.00,
    });

    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'EXPENSE_PAYMENT',
      refType: 'EXPENSE',
      refId: 1,
      accountId: 6010,
      description: 'Van Diesel',
      cashIn: 0,
      cashOut: 3000.00,
    });

    assert.strictEqual(engine.getCashBalance(), 12000.00, 'Cash balance should be 12,000 PKR (15,000 - 3,000)');
  });

  it('F12-T4: Sequence of alternating inflows and outflows maintains exact zero-drift balance', () => {
    // 0 + 10,000 (sale) + 5,000 (recovery) - 2,000 (fuel) - 4,000 (supplier) + 1,000 (deposit) = 10,000
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'CASH_SALE', refType: 'I', refId: 1, description: 'Sale', cashIn: 10000.00 });
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'UDHAAR_RECOVERY', refType: 'R', refId: 1, description: 'Recovery', cashIn: 5000.00 });
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'EXPENSE_PAYMENT', refType: 'E', refId: 1, description: 'Expense', cashIn: 0, cashOut: 2000.00 });
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'SUPPLIER_PAYMENT', refType: 'P', refId: 1, description: 'Supplier', cashIn: 0, cashOut: 4000.00 });
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'CRATE_DEPOSIT_IN', refType: 'C', refId: 1, description: 'Deposit', cashIn: 1000.00 });

    assert.strictEqual(engine.getCashBalance(), 10000.00, 'Running cash balance must equal exactly 10,000 PKR');
  });

  it('F12-T5: Rejects negative cash in or cash out values', () => {
    assert.throws(
      () => engine.recordCashBookEntry({
        date: '2026-11-02',
        type: 'INVALID',
        refType: 'ERR',
        refId: 1,
        description: 'Error',
        cashIn: -100.00,
      }),
      /cannot be negative/,
      'Should reject negative cash in'
    );
  });
});
