/**
 * Tier 2: F07 - Breakage, Wastage & Transit Loss (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F07 - Breakage Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F07-B1: Breakage of exactly 100% available stock drops warehouse inventory to 0', () => {
    // Product 4 has 360 bottles
    engine.recordBreakage({
      productId: 4,
      brokenBaseUnits: 360,
      cause: 'Warehouse Stack Collapse',
      actionTaken: 'EXPENSE',
    });

    const stock = engine.getProduct(4).stock_base_units;
    assert.strictEqual(stock, 0, 'Stock must drop to exactly 0');
  });

  it('F07-B2: Single base unit breakage calculates fractional unit cost without loss', () => {
    // Product 2: 950 / 6 = 158.3333 PKR
    const res = engine.recordBreakage({
      productId: 2,
      brokenBaseUnits: 1,
      cause: 'Single Bottle Drop',
      actionTaken: 'EXPENSE',
    });

    assert.nearEqual(res.totalLoss, 158.33, 0.05);
  });

  it('F07-B3: Breakage register supports non-ASCII / Unicode and Urdu terminology', () => {
    engine.recordBreakage({
      productId: 1,
      brokenBaseUnits: 2,
      cause: 'فٹی اور ٹوٹ پھوٹ - Footi Glass Crushed',
      incidentLocation: 'گودام - Bay 1',
      responsiblePerson: 'اصغر علی',
      actionTaken: 'EXPENSE',
    });

    const row = db.prepare("SELECT * FROM breakage_logs WHERE cause LIKE '%Footi%'").get();
    assert.ok(row, 'Unicode record must be found');
  });

  it('F07-B4: Rejects zero broken base units with explicit error', () => {
    assert.throws(
      () => engine.recordBreakage({
        productId: 1,
        brokenBaseUnits: 0,
      }),
      /must be positive/
    );
  });

  it('F07-B5: Staff recovery action records loss without inflating operating expense', () => {
    const expCountBefore = db.prepare("SELECT COUNT(*) as cnt FROM operating_expenses WHERE account_id = 6050").get().cnt;

    engine.recordBreakage({
      productId: 1,
      brokenBaseUnits: 5,
      cause: 'Driver Negligence',
      actionTaken: 'STAFF_RECOVERY',
    });

    const expCountAfter = db.prepare("SELECT COUNT(*) as cnt FROM operating_expenses WHERE account_id = 6050").get().cnt;
    assert.strictEqual(expCountAfter, expCountBefore, 'Operating expenses should NOT increase when charged to staff');
  });
});
