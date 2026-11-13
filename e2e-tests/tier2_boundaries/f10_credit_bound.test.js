/**
 * Tier 2: F10 - Customer Credit Limits (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F10 - Credit Limits Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F10-B1: Zero credit limit customer is blocked from any credit sale', () => {
    db.prepare('UPDATE customers SET credit_limit_amount = 0.00 WHERE id = 1').run();

    assert.throws(
      () => engine.createInvoice({
        customerId: 1,
        invoiceNumber: 'INV-B10-1',
        invoiceDate: '2026-11-02',
        items: [{ productId: 2, packQty: 1, unitPrice: 1000.00 }],
        paymentType: 'CREDIT',
      }),
      /Credit limit breached/,
      'Zero limit customer must be blocked from credit sales'
    );
  });

  it('F10-B2: Sale reaching exactly 100.00% of credit limit proceeds without error', () => {
    // Customer 2 limit = 50,000 PKR. Current = 0. Sale = 50,000 PKR.
    const res = engine.createInvoice({
      customerId: 2,
      invoiceNumber: 'INV-B10-2',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 50, unitPrice: 1000.00 }], // 50,000 PKR
      paymentType: 'CREDIT',
    });

    assert.strictEqual(res.newCustomerBalance, 50000.00);
    const status = engine.checkCreditStatus(2, 0);
    assert.strictEqual(status.utilizationPct, 100);
    assert.strictEqual(status.isBreached, false);
  });

  it('F10-B3: Sale exceeding limit by exactly 1 PKR is blocked without PIN', () => {
    // Customer 2 balance = 50,000 PKR (limit is 50,000)
    db.prepare('UPDATE customers SET current_balance = 50000.00 WHERE id = 2').run();

    const status = engine.checkCreditStatus(2, 1.00);
    assert.strictEqual(status.isBreached, true);
    assert.strictEqual(status.breachAmount, 1.00);

    assert.throws(
      () => engine.createInvoice({
        customerId: 2,
        invoiceNumber: 'INV-B10-3',
        invoiceDate: '2026-11-02',
        items: [{ productId: 1, packQty: 0, looseQty: 1, unitPrice: 60.00 }],
        paymentType: 'CREDIT',
      }),
      /Credit limit breached/
    );
  });

  it('F10-B4: Exact 80.00% utilization triggers WARNING threshold edge', () => {
    // Customer 1 limit = 100,000 PKR. Balance = 80,000 PKR
    db.prepare('UPDATE customers SET current_balance = 80000.00 WHERE id = 1').run();

    const status = engine.checkCreditStatus(1, 0);
    assert.strictEqual(status.utilizationPct, 80);
    assert.strictEqual(status.isWarning, true);
    assert.strictEqual(status.isBreached, false);
  });

  it('F10-B5: Enterprise high limit account (5,000,000 PKR) handles large credit volumes smoothly', () => {
    db.prepare('UPDATE customers SET credit_limit_amount = 5000000.00 WHERE id = 3').run();

    const status = engine.checkCreditStatus(3, 2500000.00);
    assert.strictEqual(status.utilizationPct, 50);
    assert.strictEqual(status.status, 'ACTIVE');
  });
});
