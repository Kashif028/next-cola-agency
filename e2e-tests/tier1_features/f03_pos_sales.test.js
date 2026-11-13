/**
 * Tier 1: Feature 3 - Multi-Product POS Invoicing (Cash & Credit)
 * Minimum 5 test cases covering POS invoicing modes, stock decrements, and receipts.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F03 - Multi-Product POS Invoicing (Cash & Credit)', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F03-T1: 100% Cash POS sale decrements stock and immediately increments liquid Cash Book', () => {
    const initialCash = engine.getCashBalance(); // 0
    const initialStock = engine.getProduct(2).stock_base_units; // 600

    const res = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-POS-101',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, looseQty: 0, unitPrice: 1000.00 }], // 10,000 PKR
      paymentType: 'CASH',
    });

    assert.strictEqual(res.netTotalAmount, 10000.00, 'Total should be 10,000 PKR');
    assert.strictEqual(res.paidAmount, 10000.00, 'Paid amount should be 10,000 PKR');
    assert.strictEqual(res.dueAmount, 0.00, 'Due amount should be 0');
    assert.strictEqual(engine.getCashBalance(), initialCash + 10000.00, 'Cash balance should increment by 10,000 PKR');
    assert.strictEqual(engine.getProduct(2).stock_base_units, initialStock - 60, 'Stock should decrement by 60 bottles');
  });

  it('F03-T2: 100% Credit sale increases customer balance and creates ZERO cash book entries', () => {
    const initialCash = engine.getCashBalance();
    const res = engine.createInvoice({
      customerId: 2,
      invoiceNumber: 'INV-POS-102',
      invoiceDate: '2026-11-02',
      items: [{ productId: 4, packQty: 20, looseQty: 0, unitPrice: 480.00 }], // 9,600 PKR
      paymentType: 'CREDIT',
    });

    assert.strictEqual(res.dueAmount, 9600.00, 'Due amount should be 9,600 PKR');
    assert.strictEqual(res.newCustomerBalance, 9600.00, 'Customer balance should be 9,600 PKR');
    assert.strictEqual(engine.getCashBalance(), initialCash, 'Cash book balance must remain untouched');
  });

  it('F03-T3: Split-payment invoice accurately divides amount between cash drawer and customer ledger', () => {
    const initialCash = engine.getCashBalance();
    // 20 cartons of Product 3 @ 1200 PKR = 24,000 PKR.
    // Paid 10,000 PKR in cash, balance 14,000 PKR on credit
    const res = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-POS-103',
      invoiceDate: '2026-11-02',
      items: [{ productId: 3, packQty: 20, looseQty: 0, unitPrice: 1200.00 }],
      paymentType: 'SPLIT',
      paidAmount: 10000.00,
    });

    assert.strictEqual(res.paidAmount, 10000.00, 'Cash paid is 10,000 PKR');
    assert.strictEqual(res.dueAmount, 14000.00, 'Credit due is 14,000 PKR');
    assert.strictEqual(engine.getCashBalance(), initialCash + 10000.00, 'Cash book should increase by 10,000 PKR');
    assert.strictEqual(res.newCustomerBalance, 14000.00, 'Customer balance should increase by 14,000 PKR');
  });

  it('F03-T4: Multi-item invoice combining cartons and loose bottles applies line-item pricing correctly', () => {
    // Item 1: 5 cartons of Product 2 (6/pack @ 1000) = 5,000 PKR
    // Item 2: 2 loose bottles of Product 1 (24/pack @ 1440, base rate 60) = 120 PKR
    const res = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-POS-104',
      invoiceDate: '2026-11-02',
      items: [
        { productId: 2, packQty: 5, looseQty: 0, unitPrice: 1000.00 },
        { productId: 1, packQty: 0, looseQty: 2, unitPrice: 1440.00 }
      ],
      paymentType: 'CASH',
    });

    assert.strictEqual(res.netTotalAmount, 5120.00, 'Total should be 5,120 PKR');
  });

  it('F03-T5: Blocks invoice generation when requested quantity exceeds available stock', () => {
    // Product 4 has 360 base units. Attempting to sell 400 base units.
    assert.throws(
      () => engine.createInvoice({
        customerId: 1,
        invoiceNumber: 'INV-POS-ERR',
        invoiceDate: '2026-11-02',
        items: [{ productId: 4, packQty: 35, looseQty: 0, unitPrice: 480.00 }], // 35 * 12 = 420 > 360
        paymentType: 'CASH',
      }),
      /Insufficient base stock/,
      'Should block sale when stock is insufficient'
    );
  });
});
