/**
 * Tier 2: F11 - Flexible Recovery Allocation (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F11 - Recovery Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F11-B1: Fractional paisa recovery (100.50 PKR) updates running balance with exact precision', () => {
    db.prepare('UPDATE customers SET current_balance = 1000.00 WHERE id = 1').run();

    const res = engine.recordRecovery({
      customerId: 1,
      amount: 100.50,
      paymentMode: 'CASH',
    });

    assert.strictEqual(res.newCustomerBalance, 899.50);
  });

  it('F11-B2: Exact debt clearance recovers remaining balance down to exactly 0.00', () => {
    db.prepare('UPDATE customers SET current_balance = 4500.00 WHERE id = 1').run();

    const res = engine.recordRecovery({
      customerId: 1,
      amount: 4500.00,
      paymentMode: 'CASH',
    });

    assert.strictEqual(res.newCustomerBalance, 0.00);
  });

  it('F11-B3: Overpayment recovery creates negative balance (customer credit advance)', () => {
    db.prepare('UPDATE customers SET current_balance = 2000.00 WHERE id = 1').run();

    const res = engine.recordRecovery({
      customerId: 1,
      amount: 3000.00,
      paymentMode: 'CASH',
    });

    assert.strictEqual(res.newCustomerBalance, -1000.00);
  });

  it('F11-B4: Multi-invoice FIFO knockoff clears two full bills and leaves third partial', () => {
    const inv1 = engine.createInvoice({ customerId: 1, invoiceNumber: 'INV-F11-B4A', invoiceDate: '2026-11-01', items: [{ productId: 2, packQty: 1, unitPrice: 1000.00 }], paymentType: 'CREDIT' });
    const inv2 = engine.createInvoice({ customerId: 1, invoiceNumber: 'INV-F11-B4B', invoiceDate: '2026-11-02', items: [{ productId: 2, packQty: 2, unitPrice: 1000.00 }], paymentType: 'CREDIT' });
    const inv3 = engine.createInvoice({ customerId: 1, invoiceNumber: 'INV-F11-B4C', invoiceDate: '2026-11-03', items: [{ productId: 2, packQty: 3, unitPrice: 1000.00 }], paymentType: 'CREDIT' });
    // Total: 1000 + 2000 + 3000 = 6,000 PKR

    // Pay 4,500 PKR
    engine.recordRecovery({ customerId: 1, amount: 4500.00, allocationMode: 'FIFO' });

    assert.strictEqual(db.prepare('SELECT status FROM sales_invoices WHERE id = ?').get(inv1.invoiceId).status, 'PAID');
    assert.strictEqual(db.prepare('SELECT status FROM sales_invoices WHERE id = ?').get(inv2.invoiceId).status, 'PAID');
    const r3 = db.prepare('SELECT status, paid_amount, due_amount FROM sales_invoices WHERE id = ?').get(inv3.invoiceId);
    assert.strictEqual(r3.status, 'PARTIAL');
    assert.strictEqual(r3.paid_amount, 1500.00);
    assert.strictEqual(r3.due_amount, 1500.00);
  });

  it('F11-B5: Rejects recovery with zero PKR amount', () => {
    assert.throws(
      () => engine.recordRecovery({
        customerId: 1,
        amount: 0.00,
        paymentMode: 'CASH',
      }),
      /must be positive/
    );
  });
});
