/**
 * Tier 1: Feature 2 - Supplier Purchase & Landed Cost Entry
 * Minimum 5 test cases covering factory purchases, freight, labor, and supplier payables.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F02 - Supplier Purchase & Landed Cost Entry', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F02-T1: Capitalizes freight and unloading labor into total landed cost', () => {
    // 50 cartons of Product 3 (FZ-250) @ 1,000 PKR = 50,000 base cost
    // Freight = 3,000 PKR, Unloading = 1,500 PKR, Transit Tax = 500 PKR -> Total Landed = 55,000 PKR
    const res = engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-002-1',
      purchaseDate: '2026-11-02',
      items: [{ productId: 3, packQty: 50, looseQty: 0, unitCost: 1000.00 }],
      freight: 3000.00,
      unloadingLabor: 1500.00,
      transitTax: 500.00,
      paymentStatus: 'UNPAID',
    });

    assert.strictEqual(res.baseInvoiceCost, 50000.00, 'Base invoice cost should be 50,000 PKR');
    assert.strictEqual(res.totalLandedCost, 55000.00, 'Total landed cost should be 55,000 PKR');
  });

  it('F02-T2: Increments warehouse base unit inventory immediately upon purchase', () => {
    const initialUnits = engine.getProduct(3).stock_base_units; // 480 cans
    engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-002-2',
      purchaseDate: '2026-11-02',
      items: [{ productId: 3, packQty: 25, looseQty: 0, unitCost: 1000.00 }],
      paymentStatus: 'UNPAID',
    });

    const newUnits = engine.getProduct(3).stock_base_units;
    assert.strictEqual(newUnits, initialUnits + (25 * 24), 'Stock should increment by 600 cans');
  });

  it('F02-T3: Unpaid purchase posts full payable to supplier khata ledger', () => {
    const res = engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-002-3',
      purchaseDate: '2026-11-02',
      items: [{ productId: 2, packQty: 40, looseQty: 0, unitCost: 950.00 }], // 38,000 PKR
      paymentStatus: 'UNPAID',
    });

    assert.strictEqual(res.newPayable, 38000.00, 'Supplier payable should be 38,000 PKR');
    const ledger = engine.getSupplierLedger(1);
    const lastEntry = ledger[ledger.length - 1];
    assert.strictEqual(lastEntry.credit, 38000.00, 'Credit entry should match purchase amount');
  });

  it('F02-T4: Paid purchase records cash out in cash book without inflating payable balance', () => {
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'INIT',
      refType: 'INIT',
      refId: 1,
      description: 'Cash Drawer',
      cashIn: 50000.00,
    });

    const res = engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-002-4',
      purchaseDate: '2026-11-02',
      items: [{ productId: 2, packQty: 20, looseQty: 0, unitCost: 950.00 }], // 19,000 PKR
      paymentStatus: 'PAID',
      paidAmount: 19000.00,
    });

    assert.strictEqual(res.dueAmount, 0.00, 'Due amount should be 0');
    assert.strictEqual(engine.getCashBalance(), 31000.00, 'Cash balance should decrease by 19,000 PKR');
  });

  it('F02-T5: Rejects purchase with negative direct expense or invalid supplier', () => {
    assert.throws(
      () => engine.recordPurchase({
        supplierId: 1,
        invoiceNo: 'PUR-ERR-1',
        purchaseDate: '2026-11-02',
        items: [{ productId: 1, packQty: 10, unitCost: 1000.00 }],
        freight: -500.00,
      }),
      /cannot be negative/,
      'Should reject negative freight'
    );

    assert.throws(
      () => engine.recordPurchase({
        supplierId: 9999, // Non-existent
        invoiceNo: 'PUR-ERR-2',
        purchaseDate: '2026-11-02',
        items: [{ productId: 1, packQty: 10, unitCost: 1000.00 }],
      }),
      /not found/,
      'Should reject non-existent supplier'
    );
  });
});
