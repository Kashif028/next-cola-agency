/**
 * Tier 2: F03 - Multi-Product POS Invoicing (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F03 - POS Invoicing Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F03-B1: Zero discount invoice matches subtotal to net total exactly', () => {
    const res = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-B03-1',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }],
      discountAmount: 0.00,
      paymentType: 'CASH',
    });

    assert.strictEqual(res.netTotalAmount, 5000.00);
  });

  it('F03-B2: 100% promotional discount reduces net total to exactly 0.00', () => {
    // 5 cartons @ 1000 = 5,000 subtotal. 100% discount = 5,000. Net total = 0.
    const res = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-B03-2',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }],
      discountAmount: 5000.00,
      paymentType: 'CASH',
    });

    assert.strictEqual(res.netTotalAmount, 0.00);
    assert.strictEqual(res.paidAmount, 0.00);
    assert.strictEqual(res.dueAmount, 0.00);
  });

  it('F03-B3: Split payment with 0 cash paid records 100% of bill on credit', () => {
    const res = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-B03-3',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }],
      paymentType: 'SPLIT',
      paidAmount: 0.00,
    });

    assert.strictEqual(res.paidAmount, 0.00);
    assert.strictEqual(res.dueAmount, 5000.00);
  });

  it('F03-B4: Split payment with full amount paid records 0 credit due and status PAID', () => {
    const res = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-B03-4',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }], // 5,000 PKR
      paymentType: 'SPLIT',
      paidAmount: 5000.00,
    });

    assert.strictEqual(res.dueAmount, 0.00);
    const inv = db.prepare('SELECT status FROM sales_invoices WHERE id = ?').get(res.invoiceId);
    assert.strictEqual(inv.status, 'PAID');
  });

  it('F03-B5: Exhausts exactly 100% of available warehouse inventory (stock reaches 0)', () => {
    // Product 4 has 360 base units (30 packs of 12)
    const res = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-B03-5',
      invoiceDate: '2026-11-02',
      items: [{ productId: 4, packQty: 30, looseQty: 0, unitPrice: 480.00 }],
      paymentType: 'CASH',
    });

    const stock = engine.getProduct(4).stock_base_units;
    assert.strictEqual(stock, 0, 'Stock must drop to exactly 0 base units');
  });
});
