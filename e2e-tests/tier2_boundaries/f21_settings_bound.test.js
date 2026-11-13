/**
 * Tier 2: F21 - Dedicated Business Settings (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F21 - Business Settings Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F21-B1: Empty string setting value is persisted without error', () => {
    engine.updateSetting('optional_ntn_number', '', 1);
    const settings = engine.getSettings();
    assert.strictEqual(settings.optional_ntn_number, '');
  });

  it('F21-B2: Alphanumeric invoice prefix with custom date format syntax is preserved', () => {
    engine.updateSetting('prefix_invoice', 'LT/INV/2026/', 1);
    const settings = engine.getSettings();
    assert.strictEqual(settings.prefix_invoice, 'LT/INV/2026/');
  });

  it('F21-B3: Setting credit grace period to 0 days (immediate cash due terms)', () => {
    engine.updateSetting('default_grace_days', '0', 1);
    const settings = engine.getSettings();
    assert.strictEqual(settings.default_grace_days, '0');
  });

  it('F21-B4: Setting default crate security deposit rate to 0.00', () => {
    engine.updateSetting('default_crate_deposit', '0.00', 1);
    const settings = engine.getSettings();
    assert.strictEqual(settings.default_crate_deposit, '0.00');
  });

  it('F21-B5: Rejects settings update attempted by Warehouse Operator (Role 4)', () => {
    assert.throws(
      () => engine.updateSetting('agency_name', 'Unauthorized Change', 4),
      /Only Admin can update business settings/
    );
  });
});
