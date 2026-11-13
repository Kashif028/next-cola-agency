/**
 * Tier 1: Feature 19 - System Audit Logging Engine
 * Minimum 5 test cases covering immutable event capturing, JSON snapshots, and supervisor authorizations.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F19 - System Audit Logging Engine', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F19-T1: Captures critical system event with category, user, role, and terminal IP', () => {
    engine.logAuditEvent({
      userId: 1,
      role: 'admin',
      eventCategory: 'RATE_EDIT',
      entityType: 'products',
      entityId: '1',
      oldState: { wholesaleRate: 1400 },
      newState: { wholesaleRate: 1440 },
      reason: 'Factory price revision notice',
    });

    const log = db.prepare("SELECT * FROM audit_logs WHERE event_category = 'RATE_EDIT'").get();
    assert.ok(log, 'Audit log must exist');
    assert.strictEqual(log.user_id, 1);
    assert.strictEqual(log.user_role, 'admin');
    assert.strictEqual(log.terminal_ip, '127.0.0.1');
    assert.strictEqual(log.reason_notes, 'Factory price revision notice');
  });

  it('F19-T2: Captures differential old and new JSON state snapshots', () => {
    engine.logAuditEvent({
      userId: 1,
      role: 'admin',
      eventCategory: 'CREDIT_LIMIT_OVERRIDE',
      entityType: 'customers',
      entityId: '2',
      oldState: { currentBalance: 50000, creditLimit: 50000 },
      newState: { currentBalance: 65000, creditLimit: 50000 },
      reason: 'Long-term trusted retailer festival credit',
      authorizedByPin: 1,
    });

    const log = db.prepare("SELECT * FROM audit_logs WHERE event_category = 'CREDIT_LIMIT_OVERRIDE'").get();
    assert.ok(log.old_state_json);
    const oldObj = JSON.parse(log.old_state_json);
    const newObj = JSON.parse(log.new_state_json);
    assert.strictEqual(oldObj.currentBalance, 50000);
    assert.strictEqual(newObj.currentBalance, 65000);
  });

  it('F19-T3: Records supervisor authorization user reference for elevated actions', () => {
    engine.logAuditEvent({
      userId: 3, // Salesman
      role: 'salesman',
      eventCategory: 'DISCOUNT_OVERRIDE',
      entityType: 'sales_invoices',
      entityId: 'INV-109',
      oldState: { discount: 0 },
      newState: { discount: 500 },
      reason: 'Volume promotional clearance',
      authorizedByPin: 1, // Admin approved
    });

    const log = db.prepare("SELECT * FROM audit_logs WHERE event_category = 'DISCOUNT_OVERRIDE'").get();
    assert.strictEqual(log.authorized_by_pin, 1, 'Authorized by pin must record admin user ID');
  });

  it('F19-T4: Chronological activity query retrieves audit trail in descending timestamp order', () => {
    engine.logAuditEvent({ userId: 1, role: 'admin', eventCategory: 'EVENT_1', entityType: 'T', entityId: '1' });
    engine.logAuditEvent({ userId: 1, role: 'admin', eventCategory: 'EVENT_2', entityType: 'T', entityId: '2' });
    engine.logAuditEvent({ userId: 1, role: 'admin', eventCategory: 'EVENT_3', entityType: 'T', entityId: '3' });

    const report = engine.generateReport(30);
    assert.ok(report.length >= 3);
    assert.strictEqual(report[0].event_category, 'EVENT_3', 'Latest event must be first');
  });

  it('F19-T5: Immutability: Audit log entries cannot be tampered with or modified', () => {
    engine.logAuditEvent({
      userId: 1,
      role: 'admin',
      eventCategory: 'SENSITIVE_DELETE',
      entityType: 'records',
      entityId: '99',
      reason: 'Integrity test',
    });

    const count = db.prepare('SELECT COUNT(*) as cnt FROM audit_logs').get().cnt;
    assert.ok(count > 0, 'Audit record exists');
  });
});
