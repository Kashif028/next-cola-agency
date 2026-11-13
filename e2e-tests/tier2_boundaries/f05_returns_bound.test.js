/**
 * Tier 2: F05 - Sales Returns & Bottle Returns (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F05 - Sales Returns Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F05-B1: Returns 100% of invoiced items restoring original stock exactly', () => {
    const stockBefore = engine.getProduct(2).stock_base_units; // 600

    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-B05-1',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }], // 60 bottles
      paymentType: 'CREDIT',
    });

    assert.strictEqual(engine.getProduct(2).stock_base_units, stockBefore - 60);

    // Return all 60 bottles
    engine.recordSalesReturn({
      invoiceId: inv.invoiceId,
      customerId: 1,
      items: [{ productId: 2, baseUnits: 60, refundRate: 166.67, condition: 'SALABLE' }],
      refundMode: 'CREDIT_NOTE',
    });

    assert.strictEqual(engine.getProduct(2).stock_base_units, stockBefore, 'Stock must return to exact initial count');
  });

  it('F05-B2: Granular single base unit return (1 bottle) updates inventory and credit note', () => {
    const stockBefore = engine.getProduct(1).stock_base_units;

    engine.recordSalesReturn({
      customerId: 1,
      items: [{ productId: 1, baseUnits: 1, refundRate: 60.00, condition: 'SALABLE' }],
      refundMode: 'CREDIT_NOTE',
      reason: 'Single bottle cork defect',
    });

    assert.strictEqual(engine.getProduct(1).stock_base_units, stockBefore + 1);
  });

  it('F05-B3: General customer return without linking to specific historical invoice ID', () => {
    const custBefore = db.prepare('SELECT current_balance FROM customers WHERE id = 1').get().current_balance;

    const res = engine.recordSalesReturn({
      customerId: 1,
      items: [{ productId: 3, baseUnits: 12, refundRate: 50.00, condition: 'SALABLE' }], // 600 PKR
      refundMode: 'CREDIT_NOTE',
    });

    assert.strictEqual(res.totalReturnValue, 600.00);
    const custAfter = db.prepare('SELECT current_balance FROM customers WHERE id = 1').get().current_balance;
    assert.strictEqual(custAfter, custBefore - 600.00);
  });

  it('F05-B4: Composite return containing both salable and damaged goods in same batch', () => {
    const stockBefore = engine.getProduct(1).stock_base_units;
    const initialBreakage = db.prepare('SELECT COUNT(*) as cnt FROM breakage_logs').get().cnt;

    // Return 20 bottles total: 15 Salable, 5 Damaged
    engine.recordSalesReturn({
      customerId: 1,
      items: [
        { productId: 1, baseUnits: 15, refundRate: 60.00, condition: 'SALABLE' },
        { productId: 1, baseUnits: 5, refundRate: 60.00, condition: 'DAMAGED' }
      ],
      refundMode: 'CREDIT_NOTE',
    });

    assert.strictEqual(engine.getProduct(1).stock_base_units, stockBefore + 15, 'Only 15 salable units restocked');
    const finalBreakage = db.prepare('SELECT COUNT(*) as cnt FROM breakage_logs').get().cnt;
    assert.strictEqual(finalBreakage, initialBreakage + 1, 'Damaged units logged to breakage');
  });

  it('F05-B5: Zero return amount handling generates 0.00 credit note without altering stock', () => {
    const stockBefore = engine.getProduct(1).stock_base_units;

    const res = engine.recordSalesReturn({
      customerId: 1,
      items: [{ productId: 1, baseUnits: 0, refundRate: 60.00, condition: 'SALABLE' }],
      refundMode: 'CREDIT_NOTE',
    });

    assert.strictEqual(res.totalReturnValue, 0.00);
    assert.strictEqual(engine.getProduct(1).stock_base_units, stockBefore);
  });
});
