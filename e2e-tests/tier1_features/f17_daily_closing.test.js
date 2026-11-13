/**
 * Tier 1: Feature 17 - Daily Cash Closing & Variance Reconciliation
 * Minimum 5 test cases covering expected cash formula, physical denominations, shortage/excess, and day locking.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F17 - Daily Cash Closing & Variance Reconciliation', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F17-T1: Reconciles perfect balanced closing when physical count equals expected cash', () => {
    const closingDate = '2026-11-02';
    engine.recordCashBookEntry({
      date: closingDate,
      type: 'CASH_SALE',
      refType: 'INV',
      refId: 1,
      cashIn: 20000.00,
    });

    const res = engine.executeDailyClosing({
      closingDate,
      openingCash: 5000.00,
      physicalCash: 25000.00,
      denominations: { 5000: 5 },
      closedBy: 1,
    });

    assert.strictEqual(res.expectedClosingCash, 25000.00, 'Expected closing cash is 25,000 PKR');
    assert.strictEqual(res.cashVariance, 0.00, 'Variance should be 0');
    assert.strictEqual(res.status, 'BALANCED', 'Status should be BALANCED');
  });

  it('F17-T2: Flags cash shortage when physical cash is less than expected system cash', () => {
    const closingDate = '2026-11-02';
    engine.recordCashBookEntry({
      date: closingDate,
      type: 'CASH_SALE',
      refType: 'INV',
      refId: 1,
      cashIn: 30000.00,
    });

    const res = engine.executeDailyClosing({
      closingDate,
      openingCash: 10000.00,
      physicalCash: 38000.00, // Shortage of 2,000 PKR
      denominations: { 5000: 7, 1000: 3 },
      closedBy: 1,
      notes: 'Cash Shortage in drawer',
    });

    assert.strictEqual(res.expectedClosingCash, 40000.00);
    assert.strictEqual(res.cashVariance, -2000.00, 'Variance must be -2,000 PKR');
    assert.strictEqual(res.status, 'SHORTAGE', 'Status must be SHORTAGE');
  });

  it('F17-T3: Flags cash excess when physical cash count exceeds expected system cash', () => {
    const closingDate = '2026-11-02';
    engine.recordCashBookEntry({
      date: closingDate,
      type: 'CASH_SALE',
      refType: 'INV',
      refId: 1,
      cashIn: 10000.00,
    });

    const res = engine.executeDailyClosing({
      closingDate,
      openingCash: 5000.00,
      physicalCash: 15500.00, // Excess 500 PKR
      denominations: { 5000: 3, 500: 1 },
      closedBy: 1,
    });

    assert.strictEqual(res.expectedClosingCash, 15000.00);
    assert.strictEqual(res.cashVariance, 500.00, 'Variance must be +500 PKR');
    assert.strictEqual(res.status, 'EXCESS', 'Status must be EXCESS');
  });

  it('F17-T4: Stores serialized Pakistani Rupee currency denomination count breakdown', () => {
    const closingDate = '2026-11-02';
    const noteCounts = { 5000: 4, 1000: 5, 500: 8, 100: 10 }; // 20k + 5k + 4k + 1k = 30k

    engine.executeDailyClosing({
      closingDate,
      openingCash: 0,
      physicalCash: 30000.00,
      denominations: noteCounts,
      closedBy: 1,
    });

    const record = db.prepare('SELECT denominations_json FROM daily_closings WHERE closing_date = ?').get(closingDate);
    const parsed = JSON.parse(record.denominations_json);
    assert.strictEqual(parsed['5000'], 4);
    assert.strictEqual(parsed['1000'], 5);
  });

  it('F17-T5: Immutability lock: Locks transactions on the closed date preventing modification', () => {
    const closingDate = '2026-11-02';
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-CLS-01',
      invoiceDate: closingDate,
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    engine.executeDailyClosing({
      closingDate,
      openingCash: 0,
      physicalCash: 0,
      closedBy: 1,
    });

    // Invoice is now locked
    const lockedInv = db.prepare('SELECT is_locked FROM sales_invoices WHERE id = ?').get(inv.invoiceId);
    assert.strictEqual(lockedInv.is_locked, 1, 'Invoice must be locked after daily closing');

    // Attempting to cancel locked invoice should fail
    assert.throws(
      () => engine.cancelInvoice({
        invoiceId: inv.invoiceId,
        reason: 'Attempt cancel on locked day',
        cancelledBy: 1,
      }),
      /locked daily closing/,
      'Should reject cancellation on locked date'
    );
  });
});
