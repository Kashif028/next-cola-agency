/**
 * Tier 1: Feature 1 - Multi-Packaging Hierarchy & Conversions
 * Minimum 5 test cases covering packaging conversion and integer base bottle inventory.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F01 - Multi-Packaging Hierarchy & Conversions', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F01-T1: Converts 5 cartons of 1.5L PET (6 bottles/carton) into exact base units (30 bottles)', () => {
    // Product 2 has units_per_pack = 6
    const baseUnits = engine.convertPackToBase(2, 5, 0);
    assert.strictEqual(baseUnits, 30, '5 cartons * 6 = 30 bottles');
  });

  it('F01-T2: Converts mixed pack and loose bottles (3 crates + 7 loose bottles of 250ml Glass)', () => {
    // Product 1 has units_per_pack = 24
    const baseUnits = engine.convertPackToBase(1, 3, 7);
    assert.strictEqual(baseUnits, (3 * 24) + 7, '3 crates * 24 + 7 = 79 bottles');
  });

  it('F01-T3: Human-readable display conversion splits 530 bottles into 22 crates and 2 bottles', () => {
    // 530 / 24 = 22 crates with 2 bottles remainder
    const display = engine.convertBaseToPackDisplay(1, 530);
    assert.strictEqual(display.packs, 22, 'Should be 22 packs');
    assert.strictEqual(display.loose, 2, 'Should be 2 loose units');
    assert.strictEqual(display.displayText, '22 Crates, 2 Bottles');
  });

  it('F01-T4: Reject negative packaging quantities with explicit error', () => {
    assert.throws(
      () => engine.convertPackToBase(1, -2, 5),
      /Quantities cannot be negative/,
      'Should reject negative pack quantity'
    );
  });

  it('F01-T5: Preserves exact base integer stock decrement across multiple package sales', () => {
    const initialStock = engine.getProduct(1).stock_base_units; // 2400 bottles
    // Sell 10 crates (240 bottles)
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F01-5A',
      invoiceDate: '2026-11-02',
      items: [{ productId: 1, packQty: 10, looseQty: 0 }],
      paymentType: 'CASH',
    });
    // Sell 5 loose bottles
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-F01-5B',
      invoiceDate: '2026-11-02',
      items: [{ productId: 1, packQty: 0, looseQty: 5 }],
      paymentType: 'CASH',
    });

    const finalStock = engine.getProduct(1).stock_base_units;
    assert.strictEqual(finalStock, initialStock - 245, 'Stock should decrease by exactly 245 bottles');
  });
});
