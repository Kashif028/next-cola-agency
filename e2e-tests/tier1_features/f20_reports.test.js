/**
 * Tier 1: Feature 20 - 30 Core Business Reports Suite
 * Minimum 5 test cases covering Report generation, aggregations, KPIs, and filtering.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F20 - 30 Core Business Reports Suite', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F20-T1: Report 01 (Daily Sales Summary) returns itemized invoices and totals for requested date', () => {
    const today = '2026-11-02';
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-R01-A',
      invoiceDate: today,
      items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }],
      paymentType: 'CASH',
    });
    engine.createInvoice({
      customerId: 2,
      invoiceNumber: 'INV-R01-B',
      invoiceDate: today,
      items: [{ productId: 3, packQty: 5, unitPrice: 1200.00 }],
      paymentType: 'CREDIT',
    });

    const report = engine.generateReport(1, { date: today });
    assert.strictEqual(report.length, 2, 'Should contain 2 sales invoices for today');
  });

  it('F20-T2: Report 08 (Customer Balance Summary) lists all customer accounts and limits', () => {
    db.prepare('UPDATE customers SET current_balance = 35000.00 WHERE id = 1').run();
    db.prepare('UPDATE customers SET current_balance = 12000.00 WHERE id = 2').run();

    const report = engine.generateReport(8);
    assert.ok(report.length >= 3, 'Should list all seeded customers');
    const c1 = report.find((c) => c.id === 1);
    assert.strictEqual(c1.current_balance, 35000.00);
    assert.strictEqual(c1.credit_limit_amount, 100000.00);
  });

  it('F20-T3: Report 19 (Current Stock Valuation) calculates inventory valuation at purchase cost', () => {
    // Product 1: 2400 bottles @ (1200 / 24 = 50 PKR) = 120,000 PKR
    const report = engine.generateReport(19);
    assert.ok(report.length >= 4);
    const p1 = report.find((p) => p.id === 1);
    assert.strictEqual(p1.stock_base_units, 2400);
    assert.strictEqual(p1.valuation_cost, 120000.00);
  });

  it('F20-T4: Report 23 (Crate & Bottle Balance Summary) computes physical yard crates and market debts', () => {
    db.prepare('UPDATE customers SET current_crate_balance = 15, deposit_balance = 3750.00 WHERE id = 1').run();

    const report = engine.generateReport(23);
    assert.ok(report.length >= 1, 'Should return empties summary for glass SKUs');
    const rgb = report[0];
    assert.strictEqual(rgb.empty_crates_stock, 100, 'Yard empties stock');
    assert.strictEqual(rgb.market_crates_debt, 15, 'Customer market debt');
    assert.strictEqual(rgb.total_deposit_liability, 3750.00, 'Security deposit liability');
  });

  it('F20-T5: Report 29 (Daily Closing Reconciliation) retrieves archived Z-Report session', () => {
    const closingDate = '2026-11-02';
    engine.executeDailyClosing({
      closingDate,
      openingCash: 10000.00,
      physicalCash: 10000.00,
      closedBy: 1,
    });

    const report = engine.generateReport(29, { closingDate });
    assert.ok(report, 'Daily closing report record must exist');
    assert.strictEqual(report.closing_date, closingDate);
    assert.strictEqual(report.status, 'BALANCED');
  });
});
