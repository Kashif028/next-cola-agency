/**
 * Tier 2: F17 - Daily Cash Closing (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F17 - Daily Closing Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F17-B1: Day closing with 0 opening cash and 0 transactions produces expected 0.00 closing cash', () => {
    const res = engine.executeDailyClosing({
      closingDate: '2026-11-02',
      openingCash: 0.00,
      physicalCash: 0.00,
      denominations: {},
      closedBy: 1,
    });

    assert.strictEqual(res.expectedClosingCash, 0.00);
    assert.strictEqual(res.cashVariance, 0.00);
    assert.strictEqual(res.status, 'BALANCED');
  });

  it('F17-B2: Physical cash count of 0.00 when cash was expected flags full shortage', () => {
    const today = '2026-11-02';
    engine.recordCashBookEntry({ date: today, type: 'CASH_SALE', cashIn: 10000.00 });

    const res = engine.executeDailyClosing({
      closingDate: today,
      openingCash: 0.00,
      physicalCash: 0.00, // Complete drain
      closedBy: 1,
    });

    assert.strictEqual(res.expectedClosingCash, 10000.00);
    assert.strictEqual(res.cashVariance, -10000.00);
    assert.strictEqual(res.status, 'SHORTAGE');
  });

  it('F17-B3: Cash count composed entirely of small notes (50x, 20x, 10x) serializes properly', () => {
    const today = '2026-11-02';
    const coinsBreakdown = { 50: 10, 20: 15, 10: 20 }; // 500 + 300 + 200 = 1,000 PKR

    const res = engine.executeDailyClosing({
      closingDate: today,
      openingCash: 0,
      physicalCash: 1000.00,
      denominations: coinsBreakdown,
      closedBy: 1,
    });

    assert.strictEqual(res.physicalCash, 1000.00);
  });

  it('F17-B4: Subtle boundary variance: Exactly 1 Rupee shortage (-1.00 PKR) is cleanly flagged', () => {
    const today = '2026-11-02';
    engine.recordCashBookEntry({ date: today, type: 'CASH_SALE', cashIn: 1000.00 });

    const res = engine.executeDailyClosing({
      closingDate: today,
      openingCash: 0.00,
      physicalCash: 999.00,
      closedBy: 1,
    });

    assert.strictEqual(res.cashVariance, -1.00);
    assert.strictEqual(res.status, 'SHORTAGE');
  });

  it('F17-B5: Multi-day sequential closings locks each respective business day independently', () => {
    const day1 = '2026-11-01';
    const day2 = '2026-11-02';

    engine.executeDailyClosing({ closingDate: day1, openingCash: 0, physicalCash: 0, closedBy: 1 });
    engine.executeDailyClosing({ closingDate: day2, openingCash: 0, physicalCash: 0, closedBy: 1 });

    const count = db.prepare('SELECT COUNT(*) as cnt FROM daily_closings').get().cnt;
    assert.strictEqual(count, 2, 'Two closing sessions must be recorded');
  });
});
