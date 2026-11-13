/**
 * Tier 2: F12 - Strict Liquid Cash Book (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F12 - Cash Book Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F12-B1: Cash drawer balance drains down to exactly 0.00', () => {
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', cashIn: 5000.00 });
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'EXPENSE', cashOut: 5000.00 });

    assert.strictEqual(engine.getCashBalance(), 0.00, 'Balance must be exactly 0.00');
  });

  it('F12-B2: Empty cash book starts with initial running cash balance of 0.00', () => {
    assert.strictEqual(engine.getCashBalance(), 0.00);
  });

  it('F12-B3: High frequency series of 50 cash transactions retains exact mathematical balance', () => {
    // 50 transactions of +100 and -50 = net +50 * 50 = 2,500
    for (let i = 0; i < 50; i++) {
      engine.recordCashBookEntry({ date: '2026-11-02', type: 'IN', cashIn: 100.00 });
      engine.recordCashBookEntry({ date: '2026-11-02', type: 'OUT', cashOut: 50.00 });
    }

    assert.strictEqual(engine.getCashBalance(), 2500.00);
  });

  it('F12-B4: Large volume cash receipt (2,500,000 PKR) preserves integer Paisa precision', () => {
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'CAPITAL',
      cashIn: 2500000.00,
      description: 'Major Agency Inflow',
    });

    assert.strictEqual(engine.getCashBalance(), 2500000.00);
  });

  it('F12-B5: Cash book entry descriptions with quotation marks and symbols escape properly', () => {
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'EXPENSE',
      description: `Shopkeeper's tea & biscuits ("Special" blend)`,
      cashIn: 0,
      cashOut: 150.00,
    });

    const last = db.prepare('SELECT description FROM cash_book ORDER BY id DESC LIMIT 1').get();
    assert.strictEqual(last.description, `Shopkeeper's tea & biscuits ("Special" blend)`);
  });
});
