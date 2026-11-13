/**
 * Tier 2: F08 - Double-Entry Ledgers (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F08 - Ledgers Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F08-B1: Empty customer ledger returns empty array without throwing error', () => {
    const ledger = engine.getCustomerLedger(3);
    assert.ok(Array.isArray(ledger));
    assert.strictEqual(ledger.length, 0);
  });

  it('F08-B2: Same-day date filtering (fromDate === toDate) isolates exact date entries', () => {
    db.prepare(`
      INSERT INTO customer_ledger (customer_id, entry_date, voucher_type, voucher_ref_id, description, debit, credit, running_balance)
      VALUES (1, '2026-11-05', 'SALE_INVOICE', 1, 'Nov 5 Sale', 2000.00, 0, 2000.00)
    `).run();

    const result = engine.getCustomerLedger(1, '2026-11-05', '2026-11-05');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].entry_date, '2026-11-05');
  });

  it('F08-B3: Multiple transactions on identical timestamps maintain deterministic chronological ID order', () => {
    for (let i = 1; i <= 5; i++) {
      db.prepare(`
        INSERT INTO customer_ledger (customer_id, entry_date, voucher_type, voucher_ref_id, description, debit, credit, running_balance)
        VALUES (1, '2026-11-02', 'SALE_INVOICE', ?, ?, 1000.00, 0, ?)
      `).run(i, `Batch invoice ${i}`, i * 1000.00);
    }

    const ledger = engine.getCustomerLedger(1);
    assert.strictEqual(ledger.length, 5);
    for (let i = 0; i < 4; i++) {
      assert.ok(ledger[i].id < ledger[i + 1].id, 'Entries must be strictly ordered by ID');
    }
  });

  it('F08-B4: Advance customer payment results in negative running balance (agency liability)', () => {
    // Customer has 0 balance, pays 15,000 PKR advance
    engine.recordRecovery({
      customerId: 1,
      amount: 15000.00,
      paymentMode: 'CASH',
    });

    const cust = db.prepare('SELECT current_balance FROM customers WHERE id = 1').get();
    assert.strictEqual(cust.current_balance, -15000.00, 'Balance should be -15,000 PKR advance');
  });

  it('F08-B5: High-value enterprise transaction (10,000,000 PKR) preserves exact precision', () => {
    db.prepare(`
      INSERT INTO customer_ledger (customer_id, entry_date, voucher_type, voucher_ref_id, description, debit, credit, running_balance)
      VALUES (1, '2026-11-02', 'SALE_INVOICE', 99, 'Wholesale Institutional Fleet', 10000000.00, 0, 10000000.00)
    `).run();

    const ledger = engine.getCustomerLedger(1);
    const entry = ledger[ledger.length - 1];
    assert.strictEqual(entry.debit, 10000000.00);
    assert.strictEqual(entry.running_balance, 10000000.00);
  });
});
