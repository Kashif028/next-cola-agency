/**
 * Tier 1: Feature 18 - Role-Based Access Control (RBAC 4 roles)
 * Minimum 5 test cases covering Admin, Accountant, Salesman, and Warehouse Operator permissions.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F18 - Role-Based Access Control (RBAC 4 roles)', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F18-T1: Admin role possesses full unconstrained permission across all modules', () => {
    assert.strictEqual(engine.checkPermission('admin', 'CANCEL_BILL'), true);
    assert.strictEqual(engine.checkPermission('admin', 'EDIT_SETTINGS'), true);
    assert.strictEqual(engine.checkPermission('admin', 'DAILY_CLOSING'), true);
    assert.strictEqual(engine.checkPermission('admin', 'VIEW_PNL'), true);
    assert.strictEqual(engine.checkPermission('admin', 'BACKUP_RESTORE'), true);
  });

  it('F18-T2: Accountant role is allowed accounting/closings but denied settings modification', () => {
    assert.strictEqual(engine.checkPermission('accountant', 'VIEW_LEDGER'), true);
    assert.strictEqual(engine.checkPermission('accountant', 'DAILY_CLOSING'), true);
    assert.strictEqual(engine.checkPermission('accountant', 'VIEW_PNL'), true);
    assert.strictEqual(engine.checkPermission('accountant', 'EDIT_SETTINGS'), false, 'Accountant cannot edit settings');
    assert.strictEqual(engine.checkPermission('accountant', 'CANCEL_BILL'), false, 'Accountant cannot cancel bills alone');
  });

  it('F18-T3: Salesman role is allowed counter/route sales but prohibited from viewing P&L or cancelling bills', () => {
    assert.strictEqual(engine.checkPermission('salesman', 'CREATE_SALE'), true);
    assert.strictEqual(engine.checkPermission('salesman', 'VIEW_PNL'), false, 'Salesman prohibited from viewing P&L');
    assert.strictEqual(engine.checkPermission('salesman', 'CANCEL_BILL'), false, 'Salesman prohibited from bill cancellation');
    assert.strictEqual(engine.checkPermission('salesman', 'EDIT_SETTINGS'), false);
  });

  it('F18-T4: Warehouse Operator is allowed stock receiving/breakage but prohibited from viewing financial ledgers', () => {
    assert.strictEqual(engine.checkPermission('warehouse_operator', 'PURCHASE_INWARD'), true);
    assert.strictEqual(engine.checkPermission('warehouse_operator', 'BREAKAGE_LOG'), true);
    assert.strictEqual(engine.checkPermission('warehouse_operator', 'STOCK_LOAD'), true);
    assert.strictEqual(engine.checkPermission('warehouse_operator', 'VIEW_LEDGER'), false, 'Prohibited from customer khata ledgers');
    assert.strictEqual(engine.checkPermission('warehouse_operator', 'VIEW_PNL'), false);
  });

  it('F18-T5: Admin PIN verification accurately authenticates supervisor overrides', () => {
    assert.strictEqual(engine.verifyAdminPin('1122'), true, 'Valid Admin PIN must authenticate');
    assert.strictEqual(engine.verifyAdminPin('9999'), false, 'Invalid PIN must fail');
    assert.strictEqual(engine.verifyAdminPin(null), false, 'Null PIN must fail');
  });
});
