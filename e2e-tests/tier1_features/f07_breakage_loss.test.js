/**
 * Tier 1: Feature 7 - Breakage, Wastage & Transit Loss
 * Minimum 5 test cases covering glass breakage, stock deductions, and loss accounting.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F07 - Breakage, Wastage & Transit Loss', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F07-T1: Records bottle breakage in warehouse, decrements stock and logs entry', () => {
    const stockBefore = engine.getProduct(1).stock_base_units; // 2400

    const res = engine.recordBreakage({
      productId: 1,
      brokenBaseUnits: 12,
      cause: 'Pallet Stacking Slip',
      incidentLocation: 'Warehouse Bay 2',
      responsiblePerson: 'Ghulam Abbas (Storekeeper)',
      actionTaken: 'EXPENSE',
    });

    const stockAfter = engine.getProduct(1).stock_base_units;
    assert.strictEqual(stockAfter, stockBefore - 12, 'Stock must decrease by 12 bottles');
    assert.strictEqual(res.unitCost, 50.00, 'Unit cost is 1200 / 24 = 50 PKR');
    assert.strictEqual(res.totalLoss, 600.00, 'Total loss is 12 * 50 = 600 PKR');
  });

  it('F07-T2: Automatically posts loss to Operating Expenses (Account 6050) when action is EXPENSE', () => {
    engine.recordBreakage({
      productId: 2, // 1.5L PET: 950 / 6 = 158.33 PKR/bottle
      brokenBaseUnits: 6,
      cause: 'Carton Punctured',
      incidentLocation: 'Warehouse',
      actionTaken: 'EXPENSE',
    });

    const exp = db.prepare("SELECT * FROM operating_expenses WHERE account_id = 6050 ORDER BY id DESC LIMIT 1").get();
    assert.ok(exp, 'Operating expense voucher for Account 6050 must exist');
    assert.nearEqual(exp.amount, 950.00, 0.5, 'Expense amount should be 950 PKR');
  });

  it('F07-T3: Rejects breakage quantity greater than available warehouse stock', () => {
    assert.throws(
      () => engine.recordBreakage({
        productId: 4, // 360 bottles in stock
        brokenBaseUnits: 500, // 500 > 360
      }),
      /exceeds available stock/,
      'Should reject breakage exceeding stock'
    );
  });

  it('F07-T4: Preserves complete incident context in breakage register (cause, location, staff)', () => {
    engine.recordBreakage({
      productId: 3,
      brokenBaseUnits: 5,
      cause: 'Road Pot Hole Vibration',
      incidentLocation: 'Van LES-2489 Transit',
      responsiblePerson: 'Driver Imran',
      actionTaken: 'EXPENSE',
    });

    const log = db.prepare("SELECT * FROM breakage_logs WHERE cause = 'Road Pot Hole Vibration'").get();
    assert.ok(log, 'Breakage log must exist');
    assert.strictEqual(log.incident_location, 'Van LES-2489 Transit');
    assert.strictEqual(log.responsible_person, 'Driver Imran');
    assert.strictEqual(log.broken_base_units, 5);
  });

  it('F07-T5: Rejects zero or negative breakage quantities with explicit error', () => {
    assert.throws(
      () => engine.recordBreakage({
        productId: 1,
        brokenBaseUnits: 0,
      }),
      /must be positive/,
      'Should reject zero broken units'
    );
  });
});
