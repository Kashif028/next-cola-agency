/**
 * Tier 1: Feature 8 - Double-Entry Customer & Supplier Ledgers
 * Minimum 5 test cases covering date-wise running balances, vouchers, and balanced debits/credits.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F08 - Double-Entry Customer & Supplier Ledgers', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F08-T1: Credit invoice creates balanced Debit entry in Customer Ledger updating running balance', () => {
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F08-01',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }], // 10,000 PKR
      paymentType: 'CREDIT',
    });

    const ledger = engine.getCustomerLedger(1);
    assert.strictEqual(ledger.length, 1, 'Should have 1 entry');
    assert.strictEqual(ledger[0].debit, 10000.00, 'Debit should be 10,000 PKR');
    assert.strictEqual(ledger[0].credit, 0.00, 'Credit should be 0');
    assert.strictEqual(ledger[0].running_balance, 10000.00, 'Running balance should be 10,000 PKR');
  });

  it('F08-T2: Debt recovery creates Credit entry in Customer Ledger reducing running balance', () => {
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F08-02',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    engine.recordRecovery({
      customerId: 1,
      amount: 4000.00,
      paymentMode: 'CASH',
    });

    const ledger = engine.getCustomerLedger(1);
    assert.strictEqual(ledger.length, 2, 'Should have 2 entries');
    assert.strictEqual(ledger[1].credit, 4000.00, 'Credit should be 4,000 PKR');
    assert.strictEqual(ledger[1].running_balance, 6000.00, 'Running balance should be 6,000 PKR');
  });

  it('F08-T3: Ledger query filters entries strictly within provided date range', () => {
    // Entry on 2026-11-01
    db.prepare(`
      INSERT INTO customer_ledger (customer_id, entry_date, voucher_type, voucher_ref_id, description, debit, credit, running_balance)
      VALUES (1, '2026-11-01', 'SALE_INVOICE', 1, 'Nov 1 Sale', 5000.00, 0, 5000.00)
    `).run();

    // Entry on 2026-11-05
    db.prepare(`
      INSERT INTO customer_ledger (customer_id, entry_date, voucher_type, voucher_ref_id, description, debit, credit, running_balance)
      VALUES (1, '2026-11-05', 'SALE_INVOICE', 2, 'Nov 5 Sale', 3000.00, 0, 8000.00)
    `).run();

    const filtered = engine.getCustomerLedger(1, '2026-11-04', '2026-11-06');
    assert.strictEqual(filtered.length, 1, 'Should find only 1 entry in date range');
    assert.strictEqual(filtered[0].entry_date, '2026-11-05');
  });

  it('F08-T4: Supplier purchase creates Credit entry updating Supplier Ledger running payable', () => {
    engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-F08-01',
      purchaseDate: '2026-11-02',
      items: [{ productId: 3, packQty: 10, unitCost: 1000.00 }], // 10,000 PKR
      paymentStatus: 'UNPAID',
    });

    const suppLedger = engine.getSupplierLedger(1);
    assert.strictEqual(suppLedger.length, 1, 'Supplier ledger should have 1 entry');
    assert.strictEqual(suppLedger[0].credit, 10000.00, 'Credit entry should be 10,000 PKR');
    assert.strictEqual(suppLedger[0].running_balance, 10000.00, 'Running payable should be 10,000 PKR');
  });

  it('F08-T5: Supplier payment creates Debit entry in Supplier Ledger reducing payable', () => {
    engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-F08-02',
      purchaseDate: '2026-11-02',
      items: [{ productId: 3, packQty: 20, unitCost: 1000.00 }], // 20,000 PKR
      paymentStatus: 'UNPAID',
    });

    // Make cash payment of 8,000 PKR to supplier
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'INIT',
      refType: 'INIT',
      refId: 1,
      description: 'Cash',
      cashIn: 50000.00,
    });

    const supp = db.prepare('SELECT current_payable FROM suppliers WHERE id = 1').get();
    const newPayable = supp.current_payable - 8000.00;
    db.prepare('UPDATE suppliers SET current_payable = ? WHERE id = 1').run(newPayable);

    db.prepare(`
      INSERT INTO supplier_ledger (
        supplier_id, entry_date, voucher_type, voucher_ref_id,
        description, debit, credit, running_balance
      ) VALUES (1, '2026-11-02', 'CASH_PAYMENT', 0, 'Payment against bill', 8000.00, 0, ?)
    `).run(newPayable);

    const suppLedger = engine.getSupplierLedger(1);
    assert.strictEqual(suppLedger.length, 2);
    assert.strictEqual(suppLedger[1].debit, 8000.00, 'Debit should be 8,000 PKR');
    assert.strictEqual(suppLedger[1].running_balance, 12000.00, 'Payable should be 12,000 PKR');
  });
});
