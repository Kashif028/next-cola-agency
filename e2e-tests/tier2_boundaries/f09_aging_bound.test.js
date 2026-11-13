/**
 * Tier 2: F09 - Udhaar Aging Buckets (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F09 - Aging Buckets Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F09-B1: Day 7 boundary: Exactly 7 days old belongs to Bucket 1 (0-7 Days)', () => {
    // As of 2026-11-10. Invoice date: 2026-11-03 (Exactly 7 days old)
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-B09-1', 1, '2026-11-03', '2026-11-03', 1000.00, 1000.00, 1000.00, 'CREDIT', 'UNPAID')
    `).run();

    const aging = engine.getUdhaarAging('2026-11-10', 1);
    assert.strictEqual(aging.bucket_0_7, 1000.00, 'Must be in Bucket 1');
    assert.strictEqual(aging.bucket_8_15, 0.00);
  });

  it('F09-B2: Day 8 boundary: Exactly 8 days old steps into Bucket 2 (8-15 Days)', () => {
    // As of 2026-11-10. Invoice date: 2026-11-02 (Exactly 8 days old)
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-B09-2', 1, '2026-11-02', '2026-11-02', 2000.00, 2000.00, 2000.00, 'CREDIT', 'UNPAID')
    `).run();

    const aging = engine.getUdhaarAging('2026-11-10', 1);
    assert.strictEqual(aging.bucket_0_7, 0.00);
    assert.strictEqual(aging.bucket_8_15, 2000.00, 'Must be in Bucket 2');
  });

  it('F09-B3: Day 15 vs 16 boundary: Exactly 15 days is Bucket 2, 16 days is Bucket 3', () => {
    // As of 2026-11-20:
    // Invoice A: 2026-11-05 (15 days old)
    // Invoice B: 2026-11-04 (16 days old)
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-B09-3A', 1, '2026-11-05', '2026-11-05', 3000.00, 3000.00, 3000.00, 'CREDIT', 'UNPAID')
    `).run();
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-B09-3B', 1, '2026-11-04', '2026-11-04', 4000.00, 4000.00, 4000.00, 'CREDIT', 'UNPAID')
    `).run();

    const aging = engine.getUdhaarAging('2026-11-20', 1);
    assert.strictEqual(aging.bucket_8_15, 3000.00, '15-day invoice in Bucket 2');
    assert.strictEqual(aging.bucket_16_30, 4000.00, '16-day invoice in Bucket 3');
  });

  it('F09-B4: Day 30 vs 31 boundary: Exactly 30 days is Bucket 3, 31 days is Bucket 4', () => {
    // As of 2026-11-30:
    // Invoice A: 2026-10-31 (30 days old)
    // Invoice B: 2026-10-30 (31 days old)
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-B09-4A', 1, '2026-10-31', '2026-10-31', 5000.00, 5000.00, 5000.00, 'CREDIT', 'UNPAID')
    `).run();
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-B09-4B', 1, '2026-10-30', '2026-10-30', 6000.00, 6000.00, 6000.00, 'CREDIT', 'UNPAID')
    `).run();

    const aging = engine.getUdhaarAging('2026-11-30', 1);
    assert.strictEqual(aging.bucket_16_30, 5000.00, '30-day invoice in Bucket 3');
    assert.strictEqual(aging.bucket_31_60, 6000.00, '31-day invoice in Bucket 4');
  });

  it('F09-B5: Day 60 vs 61 boundary: Exactly 60 days is Bucket 4, 61 days enters Bucket 5 (Critical)', () => {
    // As of 2026-11-30:
    // Invoice A: 2026-10-01 (60 days old)
    // Invoice B: 2026-09-30 (61 days old)
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-B09-5A', 1, '2026-10-01', '2026-10-01', 7000.00, 7000.00, 7000.00, 'CREDIT', 'UNPAID')
    `).run();
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-B09-5B', 1, '2026-09-30', '2026-09-30', 8000.00, 8000.00, 8000.00, 'CREDIT', 'UNPAID')
    `).run();

    const aging = engine.getUdhaarAging('2026-11-30', 1);
    assert.strictEqual(aging.bucket_31_60, 7000.00, '60-day invoice in Bucket 4');
    assert.strictEqual(aging.bucket_60_plus, 8000.00, '61-day invoice in Bucket 5');
  });
});
