/**
 * Tier 1: Feature 5 - Sales Returns & Bottle Returns
 * Minimum 5 test cases covering customer sales returns, salable vs damaged routing, and credit notes.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F05 - Sales Returns & Bottle Returns', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F05-T1: Salable return restocks sellable inventory and posts credit note to customer ledger', () => {
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-RET-01',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }], // 60 bottles @ 166.67
      paymentType: 'CREDIT',
    });

    const stockBefore = engine.getProduct(2).stock_base_units;
    const custBefore = db.prepare('SELECT current_balance FROM customers WHERE id = 1').get().current_balance;

    // Return 2 cartons (12 bottles) in SALABLE condition
    const res = engine.recordSalesReturn({
      invoiceId: inv.invoiceId,
      customerId: 1,
      items: [{ productId: 2, baseUnits: 12, refundRate: 166.67, condition: 'SALABLE' }],
      refundMode: 'CREDIT_NOTE',
      reason: 'Shop overstocked',
    });

    // Stock incremented by 12 bottles
    assert.strictEqual(engine.getProduct(2).stock_base_units, stockBefore + 12, 'Sellable stock should increment');
    // Customer balance reduced
    const custAfter = db.prepare('SELECT current_balance FROM customers WHERE id = 1').get().current_balance;
    assert.nearEqual(custAfter, custBefore - 2000.04, 1.0, 'Customer balance should decrease by return value');
  });

  it('F05-T2: Damaged return diverts to breakage loss register without altering sellable stock', () => {
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-RET-02',
      invoiceDate: '2026-11-02',
      items: [{ productId: 1, packQty: 5, unitPrice: 1440.00 }], // 120 bottles
      paymentType: 'CREDIT',
    });

    const stockBefore = engine.getProduct(1).stock_base_units;
    const initialBreakageLogs = db.prepare('SELECT COUNT(*) as cnt FROM breakage_logs').get().cnt;

    // Return 4 bottles damaged/leaking
    engine.recordSalesReturn({
      invoiceId: inv.invoiceId,
      customerId: 1,
      items: [{ productId: 1, baseUnits: 4, refundRate: 60.00, condition: 'DAMAGED' }],
      refundMode: 'CREDIT_NOTE',
      reason: 'Crown seal leakage',
    });

    // Sellable stock NOT incremented
    assert.strictEqual(engine.getProduct(1).stock_base_units, stockBefore, 'Sellable stock must remain unchanged');
    // Breakage log created
    const finalBreakageLogs = db.prepare('SELECT COUNT(*) as cnt FROM breakage_logs').get().cnt;
    assert.strictEqual(finalBreakageLogs, initialBreakageLogs + 1, 'Breakage log must be created');
  });

  it('F05-T3: Cash refund return records cash out from Cash Book', () => {
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'INIT',
      refType: 'INIT',
      refId: 1,
      description: 'Drawer',
      cashIn: 10000.00,
    });

    engine.recordSalesReturn({
      customerId: 2,
      items: [{ productId: 3, baseUnits: 10, refundRate: 50.00, condition: 'SALABLE' }], // 500 PKR
      refundMode: 'CASH',
      reason: 'Cash customer counter return',
    });

    assert.strictEqual(engine.getCashBalance(), 9500.00, 'Cash balance should decrease by 500 PKR');
  });

  it('F05-T4: Rejects return quantity exceeding original invoiced quantity', () => {
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-RET-04',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 2, unitPrice: 1000.00 }], // 12 bottles
      paymentType: 'CREDIT',
    });

    assert.throws(
      () => engine.recordSalesReturn({
        invoiceId: inv.invoiceId,
        customerId: 1,
        items: [{ productId: 2, baseUnits: 20, refundRate: 166.67, condition: 'SALABLE' }], // 20 > 12
        refundMode: 'CREDIT_NOTE',
      }),
      /exceeds billed quantity/,
      'Should reject return quantity exceeding billed quantity'
    );
  });

  it('F05-T5: Customer ledger properly shows SALE_RETURN entry reducing outstanding balance', () => {
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-RET-05',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }], // 5,000 PKR
      paymentType: 'CREDIT',
    });

    engine.recordSalesReturn({
      invoiceId: inv.invoiceId,
      customerId: 1,
      items: [{ productId: 2, baseUnits: 6, refundRate: 166.67, condition: 'SALABLE' }], // 1 carton = 1,000 PKR
      refundMode: 'CREDIT_NOTE',
      reason: 'Adjustment return',
    });

    const ledger = engine.getCustomerLedger(1);
    const returnEntry = ledger.find((e) => e.voucher_type === 'SALE_RETURN');
    assert.ok(returnEntry, 'Ledger must contain SALE_RETURN voucher');
    assert.nearEqual(returnEntry.credit, 1000.00, 1.0, 'Credit entry should be 1,000 PKR');
  });
});
