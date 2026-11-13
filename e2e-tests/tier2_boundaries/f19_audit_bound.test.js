/**
 * Tier 2: F19 - System Audit Logging (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F19 - Audit Logging Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F19-B1: Extremely long explanation note (1,000 characters) persists completely without truncation', () => {
    const longReason = 'A'.repeat(1000);

    engine.logAuditEvent({
      userId: 1,
      role: 'admin',
      eventCategory: 'SENSITIVE_OVERRIDE',
      entityType: 'customers',
      entityId: '1',
      reason: longReason,
    });

    const row = db.prepare("SELECT reason_notes FROM audit_logs WHERE event_category = 'SENSITIVE_OVERRIDE'").get();
    assert.strictEqual(row.reason_notes.length, 1000);
  });

  it('F19-B2: Deeply nested JSON state snapshots preserve complex object hierarchies', () => {
    const complexState = {
      pricing: { carton: 1000, loose: 166.67, tiers: { wholesale: 980, subdealer: 950 } },
      meta: { authorizer: 'Admin Dogar', ip: '192.168.1.100' }
    };

    engine.logAuditEvent({
      userId: 1,
      role: 'admin',
      eventCategory: 'COMPLEX_STATE_EDIT',
      entityType: 'products',
      entityId: '2',
      oldState: complexState,
      newState: { ...complexState, pricing: { ...complexState.pricing, carton: 1050 } }
    });

    const row = db.prepare("SELECT old_state_json FROM audit_logs WHERE event_category = 'COMPLEX_STATE_EDIT'").get();
    const parsed = JSON.parse(row.old_state_json);
    assert.strictEqual(parsed.pricing.tiers.subdealer, 950);
  });

  it('F19-B3: Empty audit table query returns empty array cleanly', () => {
    const report = engine.generateReport(30);
    assert.ok(Array.isArray(report));
    assert.strictEqual(report.length, 0);
  });

  it('F19-B4: Consecutive audit entries have strictly monotonically increasing IDs', () => {
    for (let i = 0; i < 10; i++) {
      engine.logAuditEvent({ userId: 1, role: 'admin', eventCategory: `EVT_${i}`, entityType: 'E', entityId: String(i) });
    }

    const rows = db.prepare('SELECT id FROM audit_logs ORDER BY id ASC').all();
    assert.strictEqual(rows.length, 10);
    for (let i = 0; i < 9; i++) {
      assert.strictEqual(rows[i + 1].id, rows[i].id + 1);
    }
  });

  it('F19-B5: Handles null old_state and null new_state without throwing error', () => {
    engine.logAuditEvent({
      userId: 1,
      role: 'admin',
      eventCategory: 'SIMPLE_PING',
      entityType: 'system',
      entityId: '0',
      oldState: null,
      newState: null,
    });

    const row = db.prepare("SELECT * FROM audit_logs WHERE event_category = 'SIMPLE_PING'").get();
    assert.strictEqual(row.old_state_json, null);
    assert.strictEqual(row.new_state_json, null);
  });
});
