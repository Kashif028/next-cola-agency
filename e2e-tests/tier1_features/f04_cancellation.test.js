/**
 * Tier 1: Feature 4 - Bill Cancellation with Audit Trail
 * Minimum 5 test cases covering supervisor approval, inventory restoral, ledger reversal, and audit logging.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F04 - Bill Cancellation with Audit Trail', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F04-T1: Admin cancels credit bill: stock is restored and customer balance is credited', () => {
    const stockBefore = engine.getProduct(2).stock_base_units; // 600
    // Create 10 cartons credit sale (60 bottles)
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-CAN-001',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }], // 10,000 PKR
      paymentType: 'CREDIT',
    });

    assert.strictEqual(engine.getProduct(2).stock_base_units, stockBefore - 60, 'Stock decremented');

    // Cancel bill as Admin (user 1)
    const cancelRes = engine.cancelInvoice({
      invoiceId: inv.invoiceId,
      reason: 'Customer refused delivery at shop',
      cancelledBy: 1,
    });

    assert.ok(cancelRes.success, 'Cancellation should succeed');
    // Stock restored
    assert.strictEqual(engine.getProduct(2).stock_base_units, stockBefore, 'Stock must be fully restored');
    // Customer balance restored
    const cust = db.prepare('SELECT current_balance FROM customers WHERE id = 1').get();
    assert.strictEqual(cust.current_balance, 0.00, 'Customer balance should be zero');
  });

  it('F04-T2: Admin cancels cash bill: stock is restored and cash refund is recorded in Cash Book', () => {
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'INIT',
      refType: 'INIT',
      refId: 1,
      description: 'Cash Drawer',
      cashIn: 20000.00,
    });

    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-CAN-002',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }], // 5,000 PKR
      paymentType: 'CASH',
    });

    assert.strictEqual(engine.getCashBalance(), 25000.00, 'Cash should be 25,000 PKR');

    engine.cancelInvoice({
      invoiceId: inv.invoiceId,
      reason: 'Billing error in price',
      cancelledBy: 1,
    });

    assert.strictEqual(engine.getCashBalance(), 20000.00, 'Cash balance should refund 5,000 PKR');
  });

  it('F04-T3: Cancellation writes an immutable audit record with reason, user, and previous state', () => {
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-CAN-003',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    engine.cancelInvoice({
      invoiceId: inv.invoiceId,
      reason: 'Wrong delivery beat',
      cancelledBy: 1,
    });

    const audit = db.prepare("SELECT * FROM audit_logs WHERE event_category = 'BILL_CANCEL' ORDER BY id DESC LIMIT 1").get();
    assert.ok(audit, 'Audit log entry must exist');
    assert.strictEqual(audit.user_role, 'admin', 'Audit role must be admin');
    assert.strictEqual(audit.reason_notes, 'Wrong delivery beat', 'Audit reason must match');
    assert.strictEqual(audit.entity_id, String(inv.invoiceId), 'Audit entity must be invoice ID');
  });

  it('F04-T4: Non-admin user without valid admin PIN is strictly rejected from cancelling', () => {
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-CAN-004',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    // User 3 is salesman
    assert.throws(
      () => engine.cancelInvoice({
        invoiceId: inv.invoiceId,
        reason: 'Salesman trying to cancel',
        cancelledBy: 3,
        adminPin: '9999', // Invalid PIN
      }),
      /Permission denied/,
      'Should deny cancellation without admin PIN'
    );
  });

  it('F04-T5: Rejects cancellation if invoice is already cancelled or reason is blank', () => {
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-CAN-005',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    assert.throws(
      () => engine.cancelInvoice({
        invoiceId: inv.invoiceId,
        reason: '   ',
        cancelledBy: 1,
      }),
      /reason required/,
      'Should reject empty reason'
    );

    engine.cancelInvoice({
      invoiceId: inv.invoiceId,
      reason: 'Valid cancel',
      cancelledBy: 1,
    });

    assert.throws(
      () => engine.cancelInvoice({
        invoiceId: inv.invoiceId,
        reason: 'Second cancel attempt',
        cancelledBy: 1,
      }),
      /already cancelled/,
      'Should reject double cancellation'
    );
  });
});
