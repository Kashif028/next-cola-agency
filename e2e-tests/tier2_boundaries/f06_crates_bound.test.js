/**
 * Tier 2: F06 - Empty Crate & Glass Bottle Circulation (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F06 - Empty Crates Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F06-B1: Customer returning more crates than owed results in negative balance (agency liability to retailer)', () => {
    // Customer owes 5 crates. Returns 20 crates -> Net balance = -15 crates
    db.prepare('UPDATE customers SET current_crate_balance = 5 WHERE id = 1').run();

    const res = engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 0,
      cratesIn: 20,
      voucherRef: 'CRT-B06-1',
    });

    assert.strictEqual(res.newCustomerCrateBalance, -15, 'Customer crate balance should be -15 (Agency owes customer)');
  });

  it('F06-B2: Zero crates out and zero crates in operates cleanly as a no-op', () => {
    const custBefore = db.prepare('SELECT current_crate_balance FROM customers WHERE id = 1').get().current_crate_balance;

    const res = engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 0,
      cratesIn: 0,
    });

    assert.strictEqual(res.newCustomerCrateBalance, custBefore);
  });

  it('F06-B3: Crate movement with zero security deposit updates crate balance with zero cash effect', () => {
    const cashBefore = engine.getCashBalance();

    const res = engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 10,
      cratesIn: 0,
      depositPaid: 0,
    });

    assert.strictEqual(engine.getCashBalance(), cashBefore, 'Cash must remain completely unchanged');
    assert.strictEqual(res.depositBalance, 0);
  });

  it('F06-B4: Large volume crate turnover (10,000 crates) maintains exact count', () => {
    const res = engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 10000,
      cratesIn: 0,
    });

    assert.strictEqual(res.newCustomerCrateBalance, 10000);
  });

  it('F06-B5: Rejects negative crate quantities with explicit validation error', () => {
    assert.throws(
      () => engine.recordCrateTransaction({
        customerId: 1,
        date: '2026-11-02',
        cratesOut: -5,
        cratesIn: 10,
      }),
      /cannot be negative/,
      'Should reject negative crates'
    );
  });
});
