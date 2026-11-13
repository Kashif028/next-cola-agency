/**
 * Tier 2: F02 - Supplier Purchase & Landed Cost Entry (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F02 - Purchases Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F02-B1: Zero freight and zero labor direct ex-factory purchase matches base invoice cost', () => {
    const res = engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-B02-1',
      purchaseDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, unitCost: 950.00 }],
      freight: 0,
      unloadingLabor: 0,
      transitTax: 0,
      paymentStatus: 'UNPAID',
    });

    assert.strictEqual(res.baseInvoiceCost, 9500.00);
    assert.strictEqual(res.totalLandedCost, 9500.00);
    assert.strictEqual(res.dueAmount, 9500.00);
  });

  it('F02-B2: High freight and logistics exceeding base invoice cost capitalizes properly', () => {
    // 5 cartons of Product 2 @ 950 = 4,750 PKR. Long distance mountain freight = 10,000 PKR.
    const res = engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-B02-2',
      purchaseDate: '2026-11-02',
      items: [{ productId: 2, packQty: 5, unitCost: 950.00 }],
      freight: 10000.00,
      unloadingLabor: 1000.00,
      paymentStatus: 'UNPAID',
    });

    assert.strictEqual(res.baseInvoiceCost, 4750.00);
    assert.strictEqual(res.totalLandedCost, 15750.00);
    assert.strictEqual(res.newPayable, 15750.00);
  });

  it('F02-B3: Fractional unit purchase cost handles floating point precision with zero drift', () => {
    // Purchasing 10 Cartons of 24 bottles at 4,850 PKR per carton.
    // Unit bottle cost = 4,850 / 24 = 202.0833 PKR.
    const res = engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-B02-3',
      purchaseDate: '2026-11-02',
      items: [{ productId: 1, packQty: 10, unitCost: 4850.00 }],
      paymentStatus: 'UNPAID',
    });

    assert.strictEqual(res.totalLandedCost, 48500.00);
  });

  it('F02-B4: Exact 100% cash paid purchase sets dueAmount to exactly 0.00 and status to PAID', () => {
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', refType: 'I', refId: 1, cashIn: 50000.00 });

    const res = engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-B02-4',
      purchaseDate: '2026-11-02',
      items: [{ productId: 3, packQty: 20, unitCost: 1000.00 }], // 20,000 PKR
      paymentStatus: 'PAID',
      paidAmount: 20000.00,
    });

    assert.strictEqual(res.dueAmount, 0.00);
    assert.strictEqual(res.newPayable, 0.00);
    assert.strictEqual(engine.getCashBalance(), 30000.00);
  });

  it('F02-B5: High-value wholesale consignment (1,000,000 PKR) completes accurately', () => {
    const res = engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-B02-5',
      purchaseDate: '2026-11-02',
      items: [{ productId: 3, packQty: 1000, unitCost: 1000.00 }], // 1,000,000 PKR
      paymentStatus: 'UNPAID',
    });

    assert.strictEqual(res.totalLandedCost, 1000000.00);
    assert.strictEqual(res.newPayable, 1000000.00);
  });
});
