/**
 * Tier 1: Feature 6 - Empty Crate & Glass Bottle Circulation
 * Minimum 5 test cases covering independent empties tracking, crate ledgers, and deposit liabilities.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F06 - Empty Crate & Glass Bottle Circulation', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F06-T1: Crate issue on credit increments customer crate balance and creates customer_crate_ledger entry', () => {
    const custBefore = db.prepare('SELECT current_crate_balance FROM customers WHERE id = 1').get().current_crate_balance;

    const res = engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 15,
      cratesIn: 0,
      voucherRef: 'CRT-OUT-01',
    });

    assert.strictEqual(res.newCustomerCrateBalance, custBefore + 15, 'Crate balance should increment by 15');
    const ledger = db.prepare('SELECT * FROM customer_crate_ledger WHERE customer_id = 1 ORDER BY id DESC LIMIT 1').get();
    assert.strictEqual(ledger.crates_out, 15, 'Ledger crates_out should be 15');
    assert.strictEqual(ledger.crates_in, 0, 'Ledger crates_in should be 0');
  });

  it('F06-T2: Empty crate return reduces customer crate debt and increments warehouse empty crates inventory', () => {
    db.prepare('UPDATE customers SET current_crate_balance = 20 WHERE id = 1').run();
    const whCratesBefore = engine.getProduct(1).empty_crates_stock; // 100

    const res = engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 0,
      cratesIn: 8,
      voucherRef: 'CRT-IN-01',
    });

    assert.strictEqual(res.newCustomerCrateBalance, 12, 'Customer crate balance should be 12 (20 - 8)');
    const whCratesAfter = engine.getProduct(1).empty_crates_stock;
    assert.strictEqual(whCratesAfter, whCratesBefore + 8, 'Warehouse empties stock should increase by 8');
  });

  it('F06-T3: Crate circulation operations do NOT alter liquid beverage stock or revenue', () => {
    const liquidStockBefore = engine.getProduct(1).stock_base_units;
    const pnlBefore = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');

    engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 30,
      cratesIn: 10,
      voucherRef: 'CRT-EXC-01',
    });

    const liquidStockAfter = engine.getProduct(1).stock_base_units;
    const pnlAfter = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');

    assert.strictEqual(liquidStockAfter, liquidStockBefore, 'Liquid drink stock must remain identical');
    assert.strictEqual(pnlAfter.grossSalesRevenue, pnlBefore.grossSalesRevenue, 'Revenue must remain identical');
  });

  it('F06-T4: Crate security deposit paid in cash is credited to liability, not sales revenue', () => {
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'INIT',
      refType: 'INIT',
      refId: 1,
      description: 'Cash Drawer',
      cashIn: 10000.00,
    });

    const res = engine.recordCrateTransaction({
      customerId: 2,
      date: '2026-11-02',
      cratesOut: 10,
      cratesIn: 0,
      voucherRef: 'CRT-DEP-02',
      depositPaid: 2500.00, // 250 PKR x 10
    });

    assert.strictEqual(res.depositBalance, 2500.00, 'Customer deposit balance should be 2,500 PKR');
    assert.strictEqual(engine.getCashBalance(), 12500.00, 'Cash drawer should increment by deposit');

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.grossSalesRevenue, 0.00, 'Revenue must be 0 (Deposit is not revenue)');
    assert.strictEqual(pnl.depositLiability, 2500.00, 'Deposit must be held under balance sheet liability');
  });

  it('F06-T5: Refunding crate security deposit reduces cash drawer and clears deposit liability', () => {
    db.prepare('UPDATE customers SET deposit_balance = 2500.00 WHERE id = 2').run();
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'INIT',
      refType: 'INIT',
      refId: 1,
      description: 'Drawer',
      cashIn: 10000.00,
    });

    const res = engine.recordCrateTransaction({
      customerId: 2,
      date: '2026-11-02',
      cratesOut: 0,
      cratesIn: 10,
      voucherRef: 'CRT-REF-01',
      depositRefunded: 2500.00,
    });

    assert.strictEqual(res.depositBalance, 0.00, 'Customer deposit balance should clear to 0');
    assert.strictEqual(engine.getCashBalance(), 7500.00, 'Cash balance should decrease by refunded deposit');
  });
});
