/**
 * Tier 2: F18 - RBAC Permissions (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F18 - RBAC Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F18-B1: Unrecognized or invalid role string is denied all permissions by default', () => {
    assert.strictEqual(engine.checkPermission('guest', 'CREATE_SALE'), false);
    assert.strictEqual(engine.checkPermission('temp_intern', 'VIEW_LEDGER'), false);
    assert.strictEqual(engine.checkPermission(null, 'DAILY_CLOSING'), false);
  });

  it('F18-B2: Unregistered arbitrary action name is denied across all roles', () => {
    assert.strictEqual(engine.checkPermission('admin', 'DROP_DATABASE_SCHEMA'), false);
    assert.strictEqual(engine.checkPermission('accountant', 'PRINT_COUNTERFEIT_MONEY'), false);
  });

  it('F18-B3: Role permissions enforce strict case sensitivity', () => {
    assert.strictEqual(engine.checkPermission('admin', 'CREATE_SALE'), true);
    assert.strictEqual(engine.checkPermission('ADMIN', 'CREATE_SALE'), false, 'Uppercase ADMIN should not match lowercase admin');
  });

  it('F18-B4: Failed Admin PIN verification with near-match numbers', () => {
    // Correct PIN is 1122
    assert.strictEqual(engine.verifyAdminPin('1123'), false);
    assert.strictEqual(engine.verifyAdminPin('112'), false);
    assert.strictEqual(engine.verifyAdminPin(' 1122 '), false);
  });

  it('F18-B5: Warehouse Operator is strictly denied from executing Daily Closing or viewing P&L', () => {
    assert.strictEqual(engine.checkPermission('warehouse_operator', 'DAILY_CLOSING'), false);
    assert.strictEqual(engine.checkPermission('warehouse_operator', 'VIEW_PNL'), false);
  });
});
