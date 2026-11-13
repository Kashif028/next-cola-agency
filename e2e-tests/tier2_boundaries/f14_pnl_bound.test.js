/**
 * Tier 2: F14 - Genuine Profit & Loss (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F14 - P&L Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F14-B1: Empty business period with 0 sales and 0 expenses produces exact 0.00 Net Operating Profit', () => {
    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.netSalesRevenue, 0.00);
    assert.strictEqual(pnl.totalCogs, 0.00);
    assert.strictEqual(pnl.grossProfit, 0.00);
    assert.strictEqual(pnl.totalOperatingExpenses, 0.00);
    assert.strictEqual(pnl.netOperatingProfit, 0.00);
  });

  it('F14-B2: Net Operating Loss: High operating overhead produces negative Net Operating Profit', () => {
    // Revenue = 6,000, COGS = 5,000 -> GP = 1,000
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-B14-2',
      invoiceDate: '2026-11-02',
      items: [{ productId: 3, packQty: 5, unitPrice: 1200.00 }],
      paymentType: 'CASH',
    });

    // Expenses = 5,000 PKR
    db.prepare(`
      INSERT INTO operating_expenses (expense_date, account_id, amount, payment_mode, description)
      VALUES ('2026-11-02', 6070, 5000.00, 'CASH', 'Depot Generator Diesel & Maintenance')
    `).run();

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.grossProfit, 1000.00);
    assert.strictEqual(pnl.totalOperatingExpenses, 5000.00);
    assert.strictEqual(pnl.netOperatingProfit, -4000.00, 'Net operating profit must be negative -4,000 PKR (Loss)');
  });

  it('F14-B3: Cancelled invoices are strictly filtered out and do not appear in Revenue or COGS', () => {
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-B14-3',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }], // 10,000 PKR
      paymentType: 'CREDIT',
    });

    engine.cancelInvoice({ invoiceId: inv.invoiceId, reason: 'Test Cancel', cancelledBy: 1 });

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.grossSalesRevenue, 0.00, 'Cancelled invoice must not count in revenue');
    assert.strictEqual(pnl.totalCogs, 0.00, 'Cancelled invoice must not count in COGS');
  });

  it('F14-B4: Refunding crate security deposit has zero impact on P&L statement', () => {
    db.prepare('UPDATE customers SET deposit_balance = 5000.00 WHERE id = 1').run();

    engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 0,
      cratesIn: 20,
      depositRefunded: 5000.00,
    });

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.totalOperatingExpenses, 0.00, 'Deposit refund is not an expense');
    assert.strictEqual(pnl.netOperatingProfit, 0.00, 'Deposit refund does not alter net profit');
  });

  it('F14-B5: Multi-SKU COGS calculation sums cost components with zero rounding drift', () => {
    // Item 1: 5 cartons PET (6/pack @ 950 cost) = 4,750
    // Item 2: 5 cartons Can (24/pack @ 1000 cost) = 5,000
    // Total COGS = 9,750 PKR
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-B14-5',
      invoiceDate: '2026-11-02',
      items: [
        { productId: 2, packQty: 5, unitPrice: 1000.00 },
        { productId: 3, packQty: 5, unitPrice: 1200.00 },
      ],
      paymentType: 'CASH',
    });

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.totalCogs, 9750.00);
  });
});
