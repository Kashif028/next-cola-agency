/**
 * Tier 2: F20 - 30 Core Business Reports (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F20 - Reports Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F20-B1: Date range with no transactions returns empty array cleanly', () => {
    const report = engine.generateReport(1, { date: '1999-01-01' });
    assert.ok(Array.isArray(report));
    assert.strictEqual(report.length, 0);
  });

  it('F20-B2: Inverted date range (startDate > endDate) returns empty result set', () => {
    const report = engine.generateReport(2, { startDate: '2026-12-31', endDate: '2026-01-01' });
    assert.ok(Array.isArray(report));
    assert.strictEqual(report.length, 0);
  });

  it('F20-B3: Customer balance summary when all customers have zero balance returns 0.00 balances', () => {
    const report = engine.generateReport(8);
    for (const c of report) {
      assert.strictEqual(c.current_balance, 0.00);
    }
  });

  it('F20-B4: Stock valuation report for depleted SKU (0 stock) evaluates cost as 0.00', () => {
    db.prepare('UPDATE products SET stock_base_units = 0 WHERE id = 1').run();

    const report = engine.generateReport(19);
    const p1 = report.find((p) => p.id === 1);
    assert.strictEqual(p1.stock_base_units, 0);
    assert.strictEqual(p1.valuation_cost, 0);
  });

  it('F20-B5: Invalid or unsupported report ID returns graceful fallback object', () => {
    const report = engine.generateReport(999);
    assert.strictEqual(report.reportId, 999);
    assert.strictEqual(report.status, 'GENERATED');
    assert.strictEqual(report.recordCount, 0);
  });
});
