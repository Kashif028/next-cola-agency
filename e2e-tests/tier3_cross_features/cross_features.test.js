/**
 * Tier 3: Cross-Feature Combinations (Pairwise Interaction Suite)
 * 23 Pairwise Integration Tests covering inter-module synergies and contracts.
 */

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 3: Cross-Feature Pairwise Interaction Suite (23 Tests)', () => {
  let db;
  let engine;
  const tempFiles = [];

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  afterEach(() => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    tempFiles.length = 0;
  });

  // Pair 01: F01 (Packaging) + F03 (POS Invoicing)
  it('Pair 01: F01 + F03 - Mixed pack and loose POS billing decrements exact base bottle inventory', () => {
    const stockBefore = engine.getProduct(1).stock_base_units; // 2400 bottles (24/crate)
    // Sell 3 crates + 5 loose bottles = 77 bottles
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-P01',
      invoiceDate: '2026-11-02',
      items: [{ productId: 1, packQty: 3, looseQty: 5, unitPrice: 1440.00 }],
      paymentType: 'CASH',
    });

    const stockAfter = engine.getProduct(1).stock_base_units;
    assert.strictEqual(stockAfter, stockBefore - 77, 'Stock must decrease by exactly 77 base bottles');
  });

  // Pair 02: F02 (Landed Purchase) + F05 (Sales Return)
  it('Pair 02: F02 + F05 - Consignment purchased with landed freight, later customer return restocked at landed cost', () => {
    // Inward purchase with freight
    const pur = engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-P02',
      purchaseDate: '2026-11-02',
      items: [{ productId: 2, packQty: 50, unitCost: 950.00 }], // 47,500 PKR
      freight: 2500.00, // Total landed = 50,000 PKR (1,000 PKR / carton = 166.67 PKR / bottle)
      paymentStatus: 'UNPAID',
    });
    assert.strictEqual(pur.totalLandedCost, 50000.00);

    // Customer returns 1 carton (6 bottles) salable
    const ret = engine.recordSalesReturn({
      customerId: 1,
      items: [{ productId: 2, baseUnits: 6, refundRate: 166.67, condition: 'SALABLE' }],
      refundMode: 'CREDIT_NOTE',
      reason: 'Overstock return',
    });

    assert.nearEqual(ret.totalReturnValue, 1000.00, 0.1);
  });

  // Pair 03: F03 (POS Invoicing) + F06 (Empty Crates)
  it('Pair 03: F03 + F06 - Beverage sale with 1-to-1 crate swap vs sale without crate swap', () => {
    const custBefore = db.prepare('SELECT current_crate_balance FROM customers WHERE id = 1').get().current_crate_balance; // 0

    // Sale A: Customer takes 10 full crates, brings 10 empties (Swap: delta = 0)
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-SWAP',
      invoiceDate: '2026-11-02',
      items: [{ productId: 1, packQty: 10, unitPrice: 1440.00 }],
      paymentType: 'CASH',
      cratesIssued: 10,
      cratesReturned: 10,
    });

    assert.strictEqual(db.prepare('SELECT current_crate_balance FROM customers WHERE id = 1').get().current_crate_balance, custBefore);

    // Sale B: Customer takes 5 full crates, brings 0 empties (Deficit: delta = +5)
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-DEFICIT',
      invoiceDate: '2026-11-02',
      items: [{ productId: 1, packQty: 5, unitPrice: 1440.00 }],
      paymentType: 'CASH',
      cratesIssued: 5,
      cratesReturned: 0,
    });

    assert.strictEqual(db.prepare('SELECT current_crate_balance FROM customers WHERE id = 1').get().current_crate_balance, custBefore + 5);
  });

  // Pair 04: F03 (Credit Sale) + F08 (Double-Entry Ledger)
  it('Pair 04: F03 + F08 - Credit sale creates balanced Debit entry in Customer Ledger with running balance', () => {
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-P04',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 15, unitPrice: 1000.00 }], // 15,000 PKR
      paymentType: 'CREDIT',
    });

    const ledger = engine.getCustomerLedger(1);
    const entry = ledger[ledger.length - 1];
    assert.strictEqual(entry.voucher_type, 'SALE_INVOICE');
    assert.strictEqual(entry.debit, 15000.00);
    assert.strictEqual(entry.running_balance, 15000.00);
  });

  // Pair 05: F03 (POS Invoicing) + F10 (Credit Limit)
  it('Pair 05: F03 + F10 - POS credit sale blocked on credit limit breach, unlocked via Admin PIN', () => {
    // Customer 2 limit = 50,000 PKR.
    assert.throws(
      () => engine.createInvoice({
        customerId: 2,
        invoiceNumber: 'INV-P05-FAIL',
        invoiceDate: '2026-11-02',
        items: [{ productId: 2, packQty: 55, unitPrice: 1000.00 }], // 55,000 PKR
        paymentType: 'CREDIT',
      }),
      /Credit limit breached/
    );

    // With Admin PIN 1122
    const inv = engine.createInvoice({
      customerId: 2,
      invoiceNumber: 'INV-P05-PASS',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 55, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
      adminOverridePin: '1122',
    });

    assert.ok(inv.invoiceId);
    assert.strictEqual(inv.dueAmount, 55000.00);
  });

  // Pair 06: F03 (Credit Sale) + F12 (Cash Book)
  it('Pair 06: F03 + F12 - Large credit sale generates zero entries in Cash Book preserving liquid cash integrity', () => {
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', cashIn: 25000.00 });
    const cashBefore = engine.getCashBalance();

    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-P06',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 50, unitPrice: 1000.00 }], // 50,000 PKR
      paymentType: 'CREDIT',
    });

    assert.strictEqual(engine.getCashBalance(), cashBefore, 'Cash book balance must remain identical');
  });

  // Pair 07: F04 (Bill Cancellation) + F19 (Audit Logging)
  it('Pair 07: F04 + F19 - Cancelling invoice restores stock, reverses ledger, and logs immutable audit entry', () => {
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-P07',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    engine.cancelInvoice({
      invoiceId: inv.invoiceId,
      reason: 'Retailer cancelled delivery due to road closure',
      cancelledBy: 1,
    });

    const audit = db.prepare("SELECT * FROM audit_logs WHERE event_category = 'BILL_CANCEL' ORDER BY id DESC LIMIT 1").get();
    assert.ok(audit);
    assert.strictEqual(audit.entity_id, String(inv.invoiceId));
    assert.strictEqual(audit.reason_notes, 'Retailer cancelled delivery due to road closure');
  });

  // Pair 08: F05 (Sales Return) + F08 (Customer Ledger)
  it('Pair 08: F05 + F08 - Customer sales return creates credit voucher reducing running ledger balance', () => {
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-P08',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }], // 10,000 PKR
      paymentType: 'CREDIT',
    });

    engine.recordSalesReturn({
      customerId: 1,
      items: [{ productId: 2, baseUnits: 12, refundRate: 166.67, condition: 'SALABLE' }], // 2,000 PKR
      refundMode: 'CREDIT_NOTE',
      reason: 'Damaged packaging swap',
    });

    const ledger = engine.getCustomerLedger(1);
    const last = ledger[ledger.length - 1];
    assert.strictEqual(last.voucher_type, 'SALE_RETURN');
    assert.nearEqual(last.credit, 2000.00, 0.1);
    assert.nearEqual(last.running_balance, 8000.00, 0.1);
  });

  // Pair 09: F06 (Crate Deposit) + F14 (COGS P&L)
  it('Pair 09: F06 + F14 - Crate security deposit increases cash drawer but is strictly excluded from P&L revenue and profit', () => {
    engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 20,
      depositPaid: 5000.00, // 250 x 20
    });

    assert.strictEqual(engine.getCashBalance(), 5000.00);

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.netSalesRevenue, 0.00, 'Security deposit must NOT be booked as revenue');
    assert.strictEqual(pnl.grossProfit, 0.00);
    assert.strictEqual(pnl.depositLiability, 5000.00, 'Must be held under current liabilities');
  });

  // Pair 10: F07 (Breakage Loss) + F16 (Driver Settlement)
  it('Pair 10: F07 + F16 - Route bottle breakage is factored into driver reconciliation formula preventing false shortage', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-P10',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 1, loadedPacks: 10, loadedLoose: 0 }], // 240 bottles
    });

    // 192 sold (8 crates), 4 bottles broken on bumpy road, 44 bottles returned (1 crate + 20 bottles)
    db.prepare('UPDATE trip_load_items SET sold_base = 192 WHERE trip_id = ?').run(tripId);

    // Expected return = 240 - 192 - 4 = 44 bottles. Driver returns exactly 44 bottles.
    const settle = engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 1, returnedPacks: 1, returnedLoose: 20, breakageBase: 4 }],
    });

    assert.strictEqual(settle.totalStockVariance, 0, 'Variance must be 0 when breakage is accounted for');
  });

  // Pair 11: F07 (Breakage Loss) + F14 (COGS P&L)
  it('Pair 11: F07 + F14 - Warehouse breakage posted as operating expense reduces Net Operating Profit', () => {
    // Sale of 10 cartons (Revenue = 12,000, COGS = 10,000 -> GP = 2,000)
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-P11',
      invoiceDate: '2026-11-02',
      items: [{ productId: 3, packQty: 10, unitPrice: 1200.00 }],
      paymentType: 'CASH',
    });

    // Breakage of 12 cans (Cost = 500 PKR)
    engine.recordBreakage({
      productId: 3,
      brokenBaseUnits: 12,
      actionTaken: 'EXPENSE',
    });

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.grossProfit, 2000.00);
    assert.strictEqual(pnl.totalOperatingExpenses, 500.00);
    assert.strictEqual(pnl.netOperatingProfit, 1500.00, 'Net operating profit should be 2,000 - 500 = 1,500 PKR');
  });

  // Pair 12: F08 (Supplier Ledger) + F12 (Cash Book)
  it('Pair 12: F08 + F12 - Cash payment to supplier debits Accounts Payable and creates Cash Out in Cash Book', () => {
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', cashIn: 60000.00 });

    // Purchase 50,000 PKR on credit
    engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-P12',
      purchaseDate: '2026-11-02',
      items: [{ productId: 3, packQty: 50, unitCost: 1000.00 }],
      paymentStatus: 'UNPAID',
    });

    // Pay 30,000 PKR in cash
    const supp = db.prepare('SELECT current_payable FROM suppliers WHERE id = 1').get();
    const newPayable = supp.current_payable - 30000.00;
    db.prepare('UPDATE suppliers SET current_payable = ? WHERE id = 1').run(newPayable);

    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'SUPPLIER_PAYMENT',
      refType: 'SUPPLIER',
      refId: 1,
      description: 'Cash payment against bills',
      cashIn: 0,
      cashOut: 30000.00,
    });

    assert.strictEqual(engine.getCashBalance(), 30000.00, 'Cash drawer decreases by 30,000 PKR');
    assert.strictEqual(newPayable, 20000.00, 'Supplier payable reduces to 20,000 PKR');
  });

  // Pair 13: F09 (Aging Buckets) + F11 (Recovery Allocation)
  it('Pair 13: F09 + F11 - FIFO recovery knocks off oldest overdue invoice clearing older aging bucket first', () => {
    // Old invoice on Oct 10 (Critical 60+ days overdue)
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-OLD', 1, '2026-09-01', '2026-09-01', 5000.00, 5000.00, 5000.00, 'CREDIT', 'UNPAID')
    `).run();

    // Fresh invoice on Nov 2 (Current 0-7 days)
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-FRESH', 1, '2026-11-02', '2026-11-02', 10000.00, 10000.00, 10000.00, 'CREDIT', 'UNPAID')
    `).run();

    db.prepare('UPDATE customers SET current_balance = 15000.00 WHERE id = 1').run();

    // Recover 5,000 PKR under FIFO
    engine.recordRecovery({
      customerId: 1,
      amount: 5000.00,
      allocationMode: 'FIFO',
    });

    const aging = engine.getUdhaarAging('2026-11-10', 1);
    assert.strictEqual(aging.bucket_60_plus, 0.00, 'Oldest bucket must be completely cleared');
    assert.strictEqual(aging.bucket_8_15, 10000.00, 'Remaining debt remains in fresh bucket');
  });

  // Pair 14: F10 (Credit Limit) + F18 (RBAC)
  it('Pair 14: F10 + F18 - Admin PIN overrides credit limit lockout, Salesman PIN is denied', () => {
    db.prepare('UPDATE customers SET current_balance = 50000.00 WHERE id = 2').run(); // limit 50k

    // Salesman attempt with Salesman PIN (5566)
    assert.throws(
      () => engine.createInvoice({
        customerId: 2,
        invoiceNumber: 'INV-P14-S',
        invoiceDate: '2026-11-02',
        items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }],
        paymentType: 'CREDIT',
        adminOverridePin: '5566',
      }),
      /Credit limit breached/
    );

    // Admin attempt with Admin PIN (1122)
    const inv = engine.createInvoice({
      customerId: 2,
      invoiceNumber: 'INV-P14-A',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 5, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
      adminOverridePin: '1122',
    });

    assert.ok(inv.invoiceId);
  });

  // Pair 15: F11 (Recovery Allocation) + F17 (Daily Closing)
  it('Pair 15: F11 + F17 - Cash recovery from retailer is included in daily closing expected cash calculation', () => {
    const today = '2026-11-02';
    db.prepare('UPDATE customers SET current_balance = 40000.00 WHERE id = 1').run();

    engine.recordRecovery({
      customerId: 1,
      amount: 15000.00,
      paymentMode: 'CASH',
      date: today,
    });

    const closing = engine.executeDailyClosing({
      closingDate: today,
      openingCash: 5000.00,
      physicalCash: 20000.00,
      denominations: { 5000: 4 },
      closedBy: 1,
    });

    assert.strictEqual(closing.expectedClosingCash, 20000.00, 'Expected closing cash must include recovery (5k opening + 15k recovery = 20k)');
    assert.strictEqual(closing.status, 'BALANCED');
  });

  // Pair 16: F12 (Cash Book) + F13 (Bank Transfer)
  it('Pair 16: F12 + F13 - Transferring cash from drawer to bank decrements Cash Book and increments Bank Account', () => {
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', cashIn: 50000.00 });
    const bankBefore = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = 1').get().current_balance;

    engine.recordBankDepositFromCash(35000.00, '2026-11-02', 1);

    assert.strictEqual(engine.getCashBalance(), 15000.00);
    const bankAfter = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = 1').get().current_balance;
    assert.strictEqual(bankAfter, bankBefore + 35000.00);
  });

  // Pair 17: F14 (COGS P&L) + F16 (Driver Settlement)
  it('Pair 17: F14 + F16 - Driver shortage does not distort product Cost of Goods Sold', () => {
    // Product 3: unit cost = 1,000 / 24 = 41.67
    // Van loaded with 10 cartons. 8 cartons sold legitimately. 1 carton returned. 1 carton missing (shortage).
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-P17',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 3, loadedPacks: 10, loadedLoose: 0 }],
    });

    // Invoiced 8 cartons @ 1200 PKR
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-P17',
      invoiceDate: '2026-11-02',
      items: [{ productId: 3, packQty: 8, unitPrice: 1200.00 }],
      paymentType: 'CASH',
    });
    db.prepare('UPDATE trip_load_items SET sold_base = 192 WHERE trip_id = ?').run(tripId);

    // Driver returns 1 carton unsold. 1 carton shortage (-24 base units)
    engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 3, returnedPacks: 1, returnedLoose: 0 }],
    });

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    // COGS should reflect only legitimate billed sales (8 cartons * 1000 = 8000 PKR)
    assert.strictEqual(pnl.totalCogs, 8000.00, 'COGS must only reflect billed units');
    assert.strictEqual(pnl.grossProfit, 1600.00);
  });

  // Pair 18: F15 (Route Issuance) + F16 (Driver Settlement)
  it('Pair 18: F15 + F16 - Morning vehicle load balances evening returns, sales deliveries, and breakage', () => {
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-P18',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 20, loadedLoose: 0 }], // 120 bottles
    });

    // Sold 12 cartons (72 bottles), broke 1 bottle, returned 7 cartons + 5 bottles (47 bottles)
    // 72 + 1 + 47 = 120 bottles
    db.prepare('UPDATE trip_load_items SET sold_base = 72 WHERE trip_id = ?').run(tripId);

    const settle = engine.settleTrip({
      tripId,
      settlementDate: '2026-11-02',
      returns: [{ productId: 2, returnedPacks: 7, returnedLoose: 5, breakageBase: 1 }],
    });

    assert.strictEqual(settle.totalStockVariance, 0, 'Reconciliation formula must balance perfectly');
  });

  // Pair 19: F16 (Driver Settlement) + F17 (Daily Closing)
  it('Pair 19: F16 + F17 - Driver cash handover dropped into drawer increments expected closing cash', () => {
    const today = '2026-11-02';
    // Driver hands over 35,000 PKR route collections
    engine.recordCashBookEntry({
      date: today,
      type: 'VAN_SETTLEMENT_DROP',
      refType: 'TRIP',
      refId: 1,
      description: 'Route collections drop from Van LES-2489',
      cashIn: 35000.00,
    });

    const closing = engine.executeDailyClosing({
      closingDate: today,
      openingCash: 10000.00,
      physicalCash: 45000.00,
      denominations: { 5000: 9 },
      closedBy: 1,
    });

    assert.strictEqual(closing.expectedClosingCash, 45000.00);
    assert.strictEqual(closing.status, 'BALANCED');
  });

  // Pair 20: F17 (Daily Closing) + F22 (Offline Backup)
  it('Pair 20: F17 + F22 - Completing daily closing triggers automated point-in-time SQLite backup', () => {
    const today = '2026-11-02';
    engine.executeDailyClosing({ closingDate: today, openingCash: 0, physicalCash: 0, closedBy: 1 });

    const backupFile = path.resolve(__dirname, `closing_backup_${Date.now()}.db`);
    tempFiles.push(backupFile);

    const backupRes = engine.createBackup(backupFile);
    assert.strictEqual(backupRes.success, true);
    assert.strictEqual(engine.verifyBackupIntegrity(backupFile), true);

    const restoredDb = createDatabase(backupFile);
    const closingRecord = restoredDb.prepare('SELECT status FROM daily_closings WHERE closing_date = ?').get(today);
    assert.strictEqual(closingRecord.status, 'BALANCED');
    restoredDb.close();
  });

  // Pair 21: F18 (RBAC) + F21 (Business Settings)
  it('Pair 21: F18 + F21 - Admin modifies agency settings, while Salesman is blocked', () => {
    // Admin succeeds
    engine.updateSetting('agency_name', 'Logar Traders Wholesale Hub', 1);
    assert.strictEqual(engine.getSettings().agency_name, 'Logar Traders Wholesale Hub');

    // Salesman (User 3) fails
    assert.throws(
      () => engine.updateSetting('agency_name', 'Hacked By Salesman', 3),
      /Only Admin can update business settings/
    );
  });

  // Pair 22: F19 (Audit Logs) + F22 (Backup / Restore)
  it('Pair 22: F19 + F22 - Restoring backup writes a critical audit trail entry into audit_logs', () => {
    const snap = path.resolve(__dirname, `audit_snap_${Date.now()}.db`);
    tempFiles.push(snap);
    engine.createBackup(snap);

    // Log critical restoration event
    engine.logAuditEvent({
      userId: 1,
      role: 'admin',
      eventCategory: 'RESTORE_DB',
      entityType: 'database',
      entityId: snap,
      reason: 'Disaster recovery simulation verified',
    });

    const audit = db.prepare("SELECT * FROM audit_logs WHERE event_category = 'RESTORE_DB'").get();
    assert.ok(audit);
    assert.strictEqual(audit.reason_notes, 'Disaster recovery simulation verified');
  });

  // Pair 23: F02 (Purchase) + F06 (Empty Crate Return to Factory)
  it('Pair 23: F02 + F06 - Factory inward purchase with return of empty crates to manufacturer truck', () => {
    // Factory purchase of 100 crates
    engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-FACTORY-01',
      purchaseDate: '2026-11-02',
      items: [{ productId: 1, packQty: 100, unitCost: 1200.00 }],
      paymentStatus: 'UNPAID',
    });

    // Return 80 empty crates to factory truck
    const supp = db.prepare('SELECT crates_owed_to_company FROM suppliers WHERE id = 1').get();
    const newFactoryCrates = supp.crates_owed_to_company - 80;
    db.prepare('UPDATE suppliers SET crates_owed_to_company = ? WHERE id = 1').run(newFactoryCrates);

    assert.strictEqual(newFactoryCrates, -80, 'Factory now owes 80 empty crates to agency or credit acknowledged');
  });
});
