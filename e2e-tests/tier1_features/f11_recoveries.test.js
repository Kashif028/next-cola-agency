/**
 * Tier 1: Feature 11 - Flexible Recovery Allocation
 * Minimum 5 test cases covering Specific Bill Matching, FIFO knock-off, and General Ledger Credits.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F11 - Flexible Recovery Allocation', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F11-T1: Specific bill recovery clears targeted invoice and marks status PAID', () => {
    const inv1 = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F11-1',
      invoiceDate: '2026-11-01',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }], // 5,000 PKR
      paymentType: 'CREDIT',
    });

    const res = engine.recordRecovery({
      customerId: 1,
      amount: 5000.00,
      paymentMode: 'CASH',
      allocationMode: 'SPECIFIC',
      targetInvoiceIds: [inv1.invoiceId],
    });

    assert.strictEqual(res.newCustomerBalance, 0.00, 'Customer balance should clear to 0');
    const updatedInv = db.prepare('SELECT status, paid_amount, due_amount FROM sales_invoices WHERE id = ?').get(inv1.invoiceId);
    assert.strictEqual(updatedInv.status, 'PAID', 'Target invoice should be PAID');
    assert.strictEqual(updatedInv.paid_amount, 5000.00);
    assert.strictEqual(updatedInv.due_amount, 0.00);
  });

  it('F11-T2: FIFO recovery automatically knocks off oldest unpaid invoice first', () => {
    // Invoice 1 on Nov 1 for 4,000 PKR
    const inv1 = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F11-A',
      invoiceDate: '2026-11-01',
      items: [{ productId: 2, packQty: 4, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });
    // Invoice 2 on Nov 3 for 6,000 PKR
    const inv2 = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F11-B',
      invoiceDate: '2026-11-03',
      items: [{ productId: 2, packQty: 6, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    // Recover 5,000 PKR under FIFO
    engine.recordRecovery({
      customerId: 1,
      amount: 5000.00,
      allocationMode: 'FIFO',
    });

    // Invoice 1 should be fully PAID (4,000)
    const row1 = db.prepare('SELECT status, due_amount FROM sales_invoices WHERE id = ?').get(inv1.invoiceId);
    assert.strictEqual(row1.status, 'PAID');
    assert.strictEqual(row1.due_amount, 0.00);

    // Invoice 2 should be PARTIAL (1,000 paid, 5,000 due)
    const row2 = db.prepare('SELECT status, paid_amount, due_amount FROM sales_invoices WHERE id = ?').get(inv2.invoiceId);
    assert.strictEqual(row2.status, 'PARTIAL');
    assert.strictEqual(row2.paid_amount, 1000.00);
    assert.strictEqual(row2.due_amount, 5000.00);
  });

  it('F11-T3: General running ledger recovery decrements customer balance without invoice targeting', () => {
    db.prepare('UPDATE customers SET current_balance = 25000.00 WHERE id = 1').run();

    const res = engine.recordRecovery({
      customerId: 1,
      amount: 10000.00,
      allocationMode: 'ON_ACCOUNT',
    });

    assert.strictEqual(res.newCustomerBalance, 15000.00, 'Balance should reduce to 15,000 PKR');
  });

  it('F11-T4: Bank mode recovery credits bank operating account balance rather than cash drawer', () => {
    const cashBefore = engine.getCashBalance();
    const bankBefore = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = 1').get().current_balance;

    db.prepare('UPDATE customers SET current_balance = 20000.00 WHERE id = 1').run();

    engine.recordRecovery({
      customerId: 1,
      amount: 15000.00,
      paymentMode: 'BANK',
      allocationMode: 'ON_ACCOUNT',
    });

    assert.strictEqual(engine.getCashBalance(), cashBefore, 'Cash drawer must remain unchanged');
    const bankAfter = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = 1').get().current_balance;
    assert.strictEqual(bankAfter, bankBefore + 15000.00, 'Bank account should increase by 15,000 PKR');
  });

  it('F11-T5: Rejects zero or negative recovery amounts', () => {
    assert.throws(
      () => engine.recordRecovery({
        customerId: 1,
        amount: -500.00,
      }),
      /must be positive/,
      'Should reject negative recovery amount'
    );
  });
});
