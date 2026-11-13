/**
 * Tier 1: Feature 10 - Customer Credit Limit & Warnings
 * Minimum 5 test cases covering limit enforcement, warning thresholds (80%), and Admin overrides.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F10 - Customer Credit Limit & Warnings', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F10-T1: Sale within customer credit limit proceeds without warnings', () => {
    // Customer 2 limit = 50,000 PKR, current balance = 0
    const status = engine.checkCreditStatus(2, 25000.00);
    assert.strictEqual(status.status, 'ACTIVE');
    assert.strictEqual(status.isBreached, false);
    assert.strictEqual(status.isWarning, false);
    assert.strictEqual(status.utilizationPct, 50);
  });

  it('F10-T2: Reaching 80% limit threshold triggers WARNING status alert', () => {
    // Customer 2 limit = 50,000 PKR, test sale of 42,000 PKR (84% utilization)
    const status = engine.checkCreditStatus(2, 42000.00);
    assert.strictEqual(status.isWarning, true);
    assert.strictEqual(status.isBreached, false);
    assert.strictEqual(status.status, 'WARNING');
  });

  it('F10-T3: Sale exceeding credit limit is strictly blocked without supervisor override', () => {
    // Customer 2 limit = 50,000 PKR. Attempting sale of 60,000 PKR
    assert.throws(
      () => engine.createInvoice({
        customerId: 2,
        invoiceNumber: 'INV-CRD-ERR',
        invoiceDate: '2026-11-02',
        items: [{ productId: 2, packQty: 60, unitPrice: 1000.00 }], // 60,000 PKR
        paymentType: 'CREDIT',
      }),
      /Credit limit breached/,
      'Should block sale exceeding credit limit'
    );
  });

  it('F10-T4: Authorized Admin PIN override unlocks transaction exceeding credit limit', () => {
    // Admin PIN: '1122'
    const res = engine.createInvoice({
      customerId: 2,
      invoiceNumber: 'INV-CRD-OVR',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 60, unitPrice: 1000.00 }], // 60,000 PKR
      paymentType: 'CREDIT',
      adminOverridePin: '1122',
    });

    assert.ok(res.invoiceId, 'Invoice should generate with Admin PIN');
    assert.strictEqual(res.dueAmount, 60000.00, 'Due amount should be 60,000 PKR');
  });

  it('F10-T5: Invalid PIN does not unlock credit limit lock', () => {
    assert.throws(
      () => engine.createInvoice({
        customerId: 2,
        invoiceNumber: 'INV-CRD-FAIL',
        invoiceDate: '2026-11-02',
        items: [{ productId: 2, packQty: 60, unitPrice: 1000.00 }],
        paymentType: 'CREDIT',
        adminOverridePin: '0000', // Invalid PIN
      }),
      /Credit limit breached/,
      'Should reject invalid PIN'
    );
  });
});
