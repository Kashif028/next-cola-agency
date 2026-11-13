/**
 * Tier 1: Feature 14 - Genuine Profit & Loss (COGS & Expense Engine)
 * Minimum 5 test cases covering COGS calculation, Gross Margin, Net Operating Profit, and revenue isolation.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F14 - Genuine Profit & Loss (COGS & Expense Engine)', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F14-T1: Computes Gross Profit strictly as Net Sales Revenue minus COGS', () => {
    // Sell 10 cartons of Product 3 (FZ-250) @ 1,200 PKR.
    // Sale price: 1,200 / carton. Purchase cost: 1,000 / carton.
    // Revenue = 12,000. COGS = 10,000. Gross Profit = 2,000 PKR.
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F14-1',
      invoiceDate: '2026-11-02',
      items: [{ productId: 3, packQty: 10, unitPrice: 1200.00 }],
      paymentType: 'CASH',
    });

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.netSalesRevenue, 12000.00, 'Net revenue should be 12,000 PKR');
    assert.strictEqual(pnl.totalCogs, 10000.00, 'COGS should be 10,000 PKR');
    assert.strictEqual(pnl.grossProfit, 2000.00, 'Gross profit should be 2,000 PKR');
  });

  it('F14-T2: Deducts Operating Expenses from Gross Profit to arrive at Net Operating Profit', () => {
    // Revenue = 12,000, COGS = 10,000 -> Gross Profit = 2,000
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F14-2',
      invoiceDate: '2026-11-02',
      items: [{ productId: 3, packQty: 10, unitPrice: 1200.00 }],
      paymentType: 'CASH',
    });

    // Expenses = 800 PKR
    db.prepare(`
      INSERT INTO operating_expenses (expense_date, account_id, amount, payment_mode, description)
      VALUES ('2026-11-02', 6080, 800.00, 'CASH', 'Tea & Refreshment')
    `).run();

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.totalOperatingExpenses, 800.00);
    assert.strictEqual(pnl.netOperatingProfit, 1200.00, 'Net profit should be 2,000 - 800 = 1,200 PKR');
  });

  it('F14-T3: Invoice discount correctly reduces Gross Sales to Net Sales Revenue', () => {
    // 10 cartons @ 1,200 = 12,000 gross. Discount = 500 -> Net = 11,500. COGS = 10,000. GP = 1,500.
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F14-3',
      invoiceDate: '2026-11-02',
      items: [{ productId: 3, packQty: 10, unitPrice: 1200.00 }],
      discountAmount: 500.00,
      paymentType: 'CASH',
    });

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.grossSalesRevenue, 12000.00);
    assert.strictEqual(pnl.totalDiscounts, 500.00);
    assert.strictEqual(pnl.netSalesRevenue, 11500.00);
    assert.strictEqual(pnl.grossProfit, 1500.00);
  });

  it('F14-T4: Crate security deposit liability is strictly isolated from P&L revenue', () => {
    // Customer pays 5,000 PKR crate deposit
    engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 20,
      depositPaid: 5000.00,
    });

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.grossSalesRevenue, 0.00, 'Revenue must be 0');
    assert.strictEqual(pnl.grossProfit, 0.00, 'Gross profit must be 0');
    assert.strictEqual(pnl.depositLiability, 5000.00, 'Deposit must be held as liability');
  });

  it('F14-T5: Owner capital injection into cash drawer does not inflate operating revenue', () => {
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'OWNER_CAPITAL',
      refType: 'EQUITY',
      refId: 1,
      accountId: 3010,
      description: 'Owner Equity Injection',
      cashIn: 500000.00,
    });

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.grossSalesRevenue, 0.00, 'Operating revenue must remain zero');
    assert.strictEqual(pnl.netOperatingProfit, 0.00, 'Operating profit must remain zero');
  });
});
