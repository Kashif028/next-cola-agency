/**
 * Tier 2: F01 - Multi-Packaging Hierarchy & Conversions (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F01 - Packaging Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F01-B1: Zero pack quantity with valid loose quantity converts accurately', () => {
    const baseUnits = engine.convertPackToBase(1, 0, 15);
    assert.strictEqual(baseUnits, 15, '0 packs + 15 loose = 15 base units');
  });

  it('F01-B2: Valid pack quantity with zero loose quantity converts accurately', () => {
    const baseUnits = engine.convertPackToBase(1, 10, 0);
    assert.strictEqual(baseUnits, 240, '10 crates * 24 = 240 base units');
  });

  it('F01-B3: Both zero pack and loose quantity returns zero base units without error', () => {
    const baseUnits = engine.convertPackToBase(1, 0, 0);
    assert.strictEqual(baseUnits, 0, '0 packs + 0 loose = 0');
  });

  it('F01-B4: Large volume packaging conversion (10,000 cartons) avoids floating point or integer overflow', () => {
    const baseUnits = engine.convertPackToBase(2, 10000, 0); // 10,000 cartons * 6 = 60,000
    assert.strictEqual(baseUnits, 60000);
    const display = engine.convertBaseToPackDisplay(2, 60000);
    assert.strictEqual(display.packs, 10000);
    assert.strictEqual(display.loose, 0);
  });

  it('F01-B5: Exact pack multiple display conversion yields exactly 0 loose remainder', () => {
    // 240 bottles / 24 = exactly 10 crates, 0 loose
    const display = engine.convertBaseToPackDisplay(1, 240);
    assert.strictEqual(display.packs, 10);
    assert.strictEqual(display.loose, 0);
    assert.strictEqual(display.displayText, '10 Crates, 0 Bottles');
  });
});
