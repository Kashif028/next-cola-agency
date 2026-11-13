/**
 * Tier 1: Feature 9 - Udhaar Aging Buckets Analysis
 * Minimum 5 test cases covering 5 standard aging buckets (0-7, 8-15, 16-30, 31-60, 60+ days).
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F09 - Udhaar Aging Buckets Analysis', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F09-T1: Classifies 4-day-old invoice into Bucket 1 (0-7 Days Current)', () => {
    // Current date: 2026-11-10. Invoice date: 2026-11-06 (4 days old)
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-AGE-1', 1, '2026-11-06', '2026-11-06', 5000.00, 5000.00, 5000.00, 'CREDIT', 'UNPAID')
    `).run();

    const aging = engine.getUdhaarAging('2026-11-10', 1);
    assert.strictEqual(aging.bucket_0_7, 5000.00, 'Should fall into 0-7 days bucket');
    assert.strictEqual(aging.bucket_8_15, 0.00);
  });

  it('F09-T2: Classifies 12-day-old invoice into Bucket 2 (8-15 Days Due)', () => {
    // As of 2026-11-20. Invoice date: 2026-11-08 (12 days old)
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-AGE-2', 1, '2026-11-08', '2026-11-08', 7500.00, 7500.00, 7500.00, 'CREDIT', 'UNPAID')
    `).run();

    const aging = engine.getUdhaarAging('2026-11-20', 1);
    assert.strictEqual(aging.bucket_8_15, 7500.00, 'Should fall into 8-15 days bucket');
  });

  it('F09-T3: Classifies 25-day-old invoice into Bucket 3 (16-30 Days Overdue)', () => {
    // As of 2026-11-30. Invoice date: 2026-11-05 (25 days old)
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-AGE-3', 1, '2026-11-05', '2026-11-05', 12000.00, 12000.00, 12000.00, 'CREDIT', 'UNPAID')
    `).run();

    const aging = engine.getUdhaarAging('2026-11-30', 1);
    assert.strictEqual(aging.bucket_16_30, 12000.00, 'Should fall into 16-30 days bucket');
  });

  it('F09-T4: Classifies 45-day-old invoice into Bucket 4 (31-60 Days Critical Overdue)', () => {
    // As of 2026-11-30. Invoice date: 2026-10-16 (45 days old)
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-AGE-4', 1, '2026-10-16', '2026-10-16', 15000.00, 15000.00, 15000.00, 'CREDIT', 'UNPAID')
    `).run();

    const aging = engine.getUdhaarAging('2026-11-30', 1);
    assert.strictEqual(aging.bucket_31_60, 15000.00, 'Should fall into 31-60 days bucket');
  });

  it('F09-T5: Classifies 75-day-old invoice into Bucket 5 (60+ Days Bad Debt Risk)', () => {
    // As of 2026-11-30. Invoice date: 2026-09-16 (75 days old)
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-AGE-5', 1, '2026-09-16', '2026-09-16', 20000.00, 20000.00, 20000.00, 'CREDIT', 'UNPAID')
    `).run();

    const aging = engine.getUdhaarAging('2026-11-30', 1);
    assert.strictEqual(aging.bucket_60_plus, 20000.00, 'Should fall into 60+ days bucket');
    assert.strictEqual(aging.totalOutstanding, 20000.00, 'Total outstanding should sum all buckets');
  });
});
