/**
 * Tier 1: Feature 21 - Dedicated Business Settings Management
 * Minimum 5 test cases covering Logar Traders configuration, invoice prefixes, and default rates.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F21 - Dedicated Business Settings Management', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F21-T1: Loads initial agency profile parameters for Logar Traders', () => {
    const settings = engine.getSettings();
    assert.strictEqual(settings.agency_name, 'Logar Traders');
    assert.strictEqual(settings.currency, 'PKR');
    assert.strictEqual(settings.prefix_invoice, 'INV-');
  });

  it('F21-T2: Admin updates agency contact phone and address in SQLite config table', () => {
    engine.updateSetting('phone', '+92-300-9998877', 1);
    engine.updateSetting('address', 'New Logistics Hub, Bypass Road, Sargodha', 1);

    const settings = engine.getSettings();
    assert.strictEqual(settings.phone, '+92-300-9998877');
    assert.strictEqual(settings.address, 'New Logistics Hub, Bypass Road, Sargodha');
  });

  it('F21-T3: Admin updates default crate security deposit rate without code change', () => {
    engine.updateSetting('default_crate_deposit', '300.00', 1);

    const settings = engine.getSettings();
    assert.strictEqual(settings.default_crate_deposit, '300.00');
  });

  it('F21-T4: Non-admin user is strictly prohibited from modifying business settings', () => {
    // User 2 is accountant
    assert.throws(
      () => engine.updateSetting('agency_name', 'Hacked Traders', 2),
      /Only Admin can update business settings/,
      'Accountant should not be permitted to update settings'
    );
  });

  it('F21-T5: Setting updates maintain persistent timestamps in SQLite', () => {
    engine.updateSetting('whatsapp', '+92-300-7766554', 1);
    const row = db.prepare("SELECT * FROM business_settings WHERE key = 'whatsapp'").get();
    assert.ok(row.updated_at, 'updated_at timestamp must be present');
    assert.strictEqual(row.value, '+92-300-7766554');
  });
});
