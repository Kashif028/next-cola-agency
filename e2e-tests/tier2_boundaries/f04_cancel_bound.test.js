/**
 * Tier 2: F04 - Bill Cancellation (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F04 - Bill Cancellation Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F04-B1: Rejects cancellation of non-existent invoice ID', () => {
    assert.throws(
      () => engine.cancelInvoice({
        invoiceId: 99999,
        reason: 'Random non-existent invoice',
        cancelledBy: 1,
      }),
      /not found/,
      'Should reject non-existent invoice'
    );
  });

  it('F04-B2: Rejects cancellation when reason consists only of tabs and whitespace', () => {
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-B04-2',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 1, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    assert.throws(
      () => engine.cancelInvoice({
        invoiceId: inv.invoiceId,
        reason: '\t  \n  ',
        cancelledBy: 1,
      }),
      /reason required/,
      'Should reject whitespace reason'
    );
  });

  it('F04-B3: Idempotency: Rejecting second cancellation of already cancelled bill', () => {
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-B04-3',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 1, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    engine.cancelInvoice({ invoiceId: inv.invoiceId, reason: 'First cancel', cancelledBy: 1 });

    assert.throws(
      () => engine.cancelInvoice({ invoiceId: inv.invoiceId, reason: 'Duplicate cancel', cancelledBy: 1 }),
      /already cancelled/
    );
  });

  it('F04-B4: Locked Day Invariant: Rejects cancellation on locked daily closing date', () => {
    const today = '2026-11-02';
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-B04-4',
      invoiceDate: today,
      items: [{ productId: 2, packQty: 1, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    engine.executeDailyClosing({ closingDate: today, openingCash: 0, physicalCash: 0, closedBy: 1 });

    assert.throws(
      () => engine.cancelInvoice({ invoiceId: inv.invoiceId, reason: 'Cancel locked day', cancelledBy: 1 }),
      /locked daily closing/
    );
  });

  it('F04-B5: Verifies PIN authentication accurately handles string types with leading zeros', () => {
    db.prepare("UPDATE users SET pin_code = '0077' WHERE id = 1").run();
    assert.strictEqual(engine.verifyAdminPin('0077'), true);
    assert.strictEqual(engine.verifyAdminPin('77'), false, 'Should not strip leading zeros');
  });
});
