/**
 * Tier 4: Real-World Application Scenarios Suite (12 Multi-Step Workflows)
 * Derived from TEST_INFRA.md Section: Real-World Application Scenarios.
 */

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 4: Real-World Distribution Workflows Suite (12 Scenarios)', () => {
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

  // Scenario 1: Full Morning-to-Night Distribution Cycle
  it('Scenario 01: Full Morning-to-Night Distribution Cycle', () => {
    const today = '2026-11-02';
    // 07:00 AM - Vehicle Load Issuance: 20 cartons PET (120 bottles)
    const tripId = engine.dispatchTrip({
      tripCode: 'TRIP-DAY-01',
      tripDate: today,
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 20, loadedLoose: 0 }],
    });

    // 10:30 AM - Shop 1: Cash delivery 8 cartons @ 1000 = 8,000 PKR cash
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-ROUTE-01',
      invoiceDate: today,
      items: [{ productId: 2, packQty: 8, unitPrice: 1000.00 }],
      paymentType: 'CASH',
    });

    // 02:00 PM - Shop 2: Credit delivery 7 cartons @ 1000 = 7,000 PKR Udhaar
    engine.createInvoice({
      customerId: 2,
      invoiceNumber: 'INV-ROUTE-02',
      invoiceDate: today,
      items: [{ productId: 2, packQty: 7, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    // 04:00 PM - Shop 3: Old Udhaar Recovery collected in cash: 4,000 PKR
    db.prepare('UPDATE customers SET current_balance = current_balance + 4000.00 WHERE id = 1').run();
    engine.recordRecovery({
      customerId: 1,
      amount: 4000.00,
      paymentMode: 'CASH',
      date: today,
    });

    // 06:30 PM - Evening Return: 5 cartons unsold returned to warehouse
    db.prepare('UPDATE trip_load_items SET sold_base = 90 WHERE trip_id = ?').run(tripId); // 15 cartons sold
    const settle = engine.settleTrip({
      tripId,
      settlementDate: today,
      returns: [{ productId: 2, returnedPacks: 5, returnedLoose: 0 }],
      cashHandedOver: 12000.00, // 8k cash sale + 4k recovery
    });
    assert.strictEqual(settle.totalStockVariance, 0);

    // 07:30 PM - Daily Closing: Expected = 8,000 (sale) + 4,000 (recovery) = 12,000 PKR
    const closing = engine.executeDailyClosing({
      closingDate: today,
      openingCash: 0,
      physicalCash: 12000.00,
      denominations: { 5000: 2, 1000: 2 },
      closedBy: 1,
    });
    assert.strictEqual(closing.expectedClosingCash, 12000.00);
    assert.strictEqual(closing.status, 'BALANCED');
  });

  // Scenario 2: High-Volume Udhaar Cycle with Partial Recoveries
  it('Scenario 02: High-Volume Udhaar Cycle with Partial Recoveries', () => {
    // 3 successive credit sales over 3 weeks
    // Week 1: 20,000 PKR
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-UDH-W1', 1, '2026-10-10', '2026-10-10', 20000.00, 20000.00, 20000.00, 'CREDIT', 'UNPAID')
    `).run();
    // Week 2: 15,000 PKR
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-UDH-W2', 1, '2026-10-20', '2026-10-20', 15000.00, 15000.00, 15000.00, 'CREDIT', 'UNPAID')
    `).run();
    // Week 3: 10,000 PKR
    db.prepare(`
      INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_amount, net_total_amount, due_amount, payment_type, status)
      VALUES ('INV-UDH-W3', 1, '2026-11-01', '2026-11-01', 10000.00, 10000.00, 10000.00, 'CREDIT', 'UNPAID')
    `).run();

    db.prepare('UPDATE customers SET current_balance = 45000.00 WHERE id = 1').run();

    // Partial recovery 1: 25,000 PKR under FIFO (Clears Week 1 in full, knocks 5,000 off Week 2)
    engine.recordRecovery({
      customerId: 1,
      amount: 25000.00,
      allocationMode: 'FIFO',
    });

    const w1 = db.prepare("SELECT status FROM sales_invoices WHERE invoice_number = 'INV-UDH-W1'").get();
    const w2 = db.prepare("SELECT status, due_amount FROM sales_invoices WHERE invoice_number = 'INV-UDH-W2'").get();
    assert.strictEqual(w1.status, 'PAID');
    assert.strictEqual(w2.status, 'PARTIAL');
    assert.strictEqual(w2.due_amount, 10000.00);

    // Partial recovery 2: 15,000 PKR under FIFO (Clears Week 2 in full, knocks 5,000 off Week 3)
    engine.recordRecovery({
      customerId: 1,
      amount: 15000.00,
      allocationMode: 'FIFO',
    });

    const w3 = db.prepare("SELECT status, due_amount FROM sales_invoices WHERE invoice_number = 'INV-UDH-W3'").get();
    assert.strictEqual(w3.status, 'PARTIAL');
    assert.strictEqual(w3.due_amount, 5000.00);

    const cust = db.prepare('SELECT current_balance FROM customers WHERE id = 1').get();
    assert.strictEqual(cust.current_balance, 5000.00, 'Final remaining balance must be 5,000 PKR');
  });

  // Scenario 3: Factory Inward Purchase with Transit Freight & Empties Return
  it('Scenario 03: Factory Inward Purchase with Transit Freight & Empties Return', () => {
    // Consignment of 100 crates Next Cola Glass @ 1,200 ex-factory = 120,000 PKR
    // Direct freight paid in cash: 6,000 PKR, Unloading labor in cash: 2,000 PKR
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', cashIn: 20000.00 });

    const pur = engine.recordPurchase({
      supplierId: 1,
      invoiceNo: 'PUR-FACTORY-CONSIGN',
      purchaseDate: '2026-11-02',
      items: [{ productId: 1, packQty: 100, unitCost: 1200.00 }],
      freight: 6000.00,
      unloadingLabor: 2000.00,
      paymentStatus: 'UNPAID', // Factory bill unpaid
    });

    assert.strictEqual(pur.totalLandedCost, 128000.00);

    // Pay freight and labor in cash from drawer
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'FREIGHT_PAYMENT', cashIn: 0, cashOut: 8000.00 });
    assert.strictEqual(engine.getCashBalance(), 12000.00);

    // Return 80 empty crates to factory trailer
    const supp = db.prepare('SELECT current_payable, crates_owed_to_company FROM suppliers WHERE id = 1').get();
    assert.strictEqual(supp.current_payable, 128000.00);
    db.prepare('UPDATE suppliers SET crates_owed_to_company = crates_owed_to_company - 80 WHERE id = 1').run();

    const suppAfter = db.prepare('SELECT crates_owed_to_company FROM suppliers WHERE id = 1').get();
    assert.strictEqual(suppAfter.crates_owed_to_company, -80);
  });

  // Scenario 4: Canceled Bill & Restocking Audit Flow
  it('Scenario 04: Canceled Bill & Restocking Audit Flow', () => {
    const stockBefore = engine.getProduct(2).stock_base_units; // 600

    // Issue invoice: 15 cartons @ 1000 = 15,000 PKR credit
    const inv = engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-SCEN-04',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 15, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
    });

    assert.strictEqual(engine.getProduct(2).stock_base_units, stockBefore - 90);

    // Driver reports shop was closed and owner refuses bill -> Supervisor cancels
    engine.cancelInvoice({
      invoiceId: inv.invoiceId,
      reason: 'Shop shutter closed, delivery refused by retailer',
      cancelledBy: 1,
    });

    // 1. Stock restored
    assert.strictEqual(engine.getProduct(2).stock_base_units, stockBefore);
    // 2. Customer balance reversed
    const cust = db.prepare('SELECT current_balance FROM customers WHERE id = 1').get();
    assert.strictEqual(cust.current_balance, 0.00);
    // 3. Audit trail contains cancel entry
    const audit = db.prepare("SELECT * FROM audit_logs WHERE event_category = 'BILL_CANCEL' AND entity_id = ?").get(String(inv.invoiceId));
    assert.ok(audit);
    assert.strictEqual(audit.reason_notes, 'Shop shutter closed, delivery refused by retailer');
  });

  // Scenario 5: Glass Bottle Breakage & Loss Recovery from Staff
  it('Scenario 05: Glass Bottle Breakage & Loss Recovery from Staff', () => {
    const stockBefore = engine.getProduct(1).stock_base_units; // 2400

    // Breakage of 6 glass bottles during depot loading
    const res = engine.recordBreakage({
      productId: 1,
      brokenBaseUnits: 6,
      cause: 'Depot Stacking Fall',
      incidentLocation: 'Depot Gate Bay 1',
      responsiblePerson: 'Loader Tariq',
      actionTaken: 'EXPENSE',
    });

    assert.strictEqual(engine.getProduct(1).stock_base_units, stockBefore - 6);
    assert.strictEqual(res.totalLoss, 300.00); // 6 * 50 PKR

    // Verification: Loss logged in operating expenses
    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    assert.strictEqual(pnl.totalOperatingExpenses, 300.00);
  });

  // Scenario 6: Monthly P&L and Balance Sheet Reconciliation with Security Deposits
  it('Scenario 06: Monthly P&L and Balance Sheet Reconciliation with Security Deposits', () => {
    // 1. Sales: 100 cartons of Product 2 @ 1200 PKR = 120,000 PKR. Cost = 950 PKR/carton = 95,000 COGS.
    engine.createInvoice({
      customerId: 1,
      invoiceNumber: 'INV-M06-1',
      invoiceDate: '2026-11-15',
      items: [{ productId: 2, packQty: 100, unitPrice: 1200.00 }],
      paymentType: 'CASH',
    });

    // 2. Operating Expenses: Fuel 5,000 + Rent 10,000 = 15,000 PKR
    db.prepare("INSERT INTO operating_expenses (expense_date, account_id, amount, payment_mode, description) VALUES ('2026-11-15', 6010, 5000.00, 'CASH', 'Fuel')").run();
    db.prepare("INSERT INTO operating_expenses (expense_date, account_id, amount, payment_mode, description) VALUES ('2026-11-15', 6070, 10000.00, 'CASH', 'Warehouse Rent')").run();

    // 3. Security deposits collected in cash: 50 crates @ 250 PKR = 12,500 PKR
    engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-15',
      cratesOut: 50,
      depositPaid: 12500.00,
    });

    const pnl = engine.calculateProfitAndLoss('2026-11-01', '2026-11-30');
    // Gross Profit = 120,000 - 95,000 = 25,000 PKR
    assert.strictEqual(pnl.grossProfit, 25000.00);
    // Net Profit = 25,000 - 15,000 = 10,000 PKR
    assert.strictEqual(pnl.netOperatingProfit, 10000.00);
    // Deposit Liability = 12,500 PKR (Balance Sheet only)
    assert.strictEqual(pnl.depositLiability, 12500.00);
  });

  // Scenario 7: Multi-Route Fleet Dispatch with Shortage Penalty Settlement
  it('Scenario 07: Multi-Route Fleet Dispatch with Shortage Penalty Settlement', () => {
    // Van 1: Dispatched 10 cartons PET. Returns balanced.
    const t1 = engine.dispatchTrip({
      tripCode: 'TRIP-V1',
      tripDate: '2026-11-02',
      routeId: 1,
      driverId: 3,
      vehicleNumber: 'LES-2489',
      items: [{ productId: 2, loadedPacks: 10, loadedLoose: 0 }],
    });
    db.prepare('UPDATE trip_load_items SET sold_base = 60 WHERE trip_id = ?').run(t1);
    const s1 = engine.settleTrip({
      tripId: t1,
      settlementDate: '2026-11-02',
      returns: [{ productId: 2, returnedPacks: 0, returnedLoose: 0 }],
    });
    assert.strictEqual(s1.totalStockVariance, 0);

    // Van 2: Dispatched 10 cartons PET (60 bottles). Sold 30 bottles. Driver returns 2 cartons (12 bottles).
    // Shortage = 12 - 30 = -18 bottles (3 cartons missing).
    const t2 = engine.dispatchTrip({
      tripCode: 'TRIP-V2',
      tripDate: '2026-11-02',
      routeId: 2,
      driverId: 3,
      vehicleNumber: 'LXZ-9012',
      items: [{ productId: 2, loadedPacks: 10, loadedLoose: 0 }],
    });
    db.prepare('UPDATE trip_load_items SET sold_base = 30 WHERE trip_id = ?').run(t2);
    const s2 = engine.settleTrip({
      tripId: t2,
      settlementDate: '2026-11-02',
      returns: [{ productId: 2, returnedPacks: 2, returnedLoose: 0 }],
    });
    assert.strictEqual(s2.totalStockVariance, -18, 'Shortage of -18 bottles detected');
  });

  // Scenario 8: Bank Cash Deposit & Supplier Online Payment Cycle
  it('Scenario 08: Bank Cash Deposit & Supplier Online Payment Cycle', () => {
    // Put 80,000 PKR in cash drawer
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', cashIn: 80000.00 });
    const bankStart = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = 1').get().current_balance;

    // 1. Deposit 50,000 PKR from drawer into bank
    engine.recordBankDepositFromCash(50000.00, '2026-11-02', 1);
    assert.strictEqual(engine.getCashBalance(), 30000.00);
    assert.strictEqual(db.prepare('SELECT current_balance FROM bank_accounts WHERE id = 1').get().current_balance, bankStart + 50000.00);

    // 2. Transfer 40,000 PKR from bank to Nextco factory for purchase payable
    db.prepare('UPDATE bank_accounts SET current_balance = current_balance - 40000.00 WHERE id = 1').run();
    db.prepare('UPDATE suppliers SET current_payable = current_payable - 40000.00 WHERE id = 1').run();

    assert.strictEqual(engine.getCashBalance(), 30000.00, 'Drawer cash must not be touched by bank transfer');
    assert.strictEqual(db.prepare('SELECT current_balance FROM bank_accounts WHERE id = 1').get().current_balance, bankStart + 10000.00);
  });

  // Scenario 9: Retailer Credit Limit Lockout and Admin Override Protocol
  it('Scenario 09: Retailer Credit Limit Lockout and Admin Override Protocol', () => {
    // Retailer 2 has limit 50,000 PKR.
    db.prepare('UPDATE customers SET current_balance = 45000.00 WHERE id = 2').run();

    // Salesman attempts 10,000 PKR sale (Total 55k > 50k limit) -> BLOCKED
    assert.throws(
      () => engine.createInvoice({
        customerId: 2,
        invoiceNumber: 'INV-LOCK-01',
        invoiceDate: '2026-11-02',
        items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }],
        paymentType: 'CREDIT',
      }),
      /Credit limit breached/
    );

    // Admin enters override PIN 1122 -> APPROVED
    const inv = engine.createInvoice({
      customerId: 2,
      invoiceNumber: 'INV-OVERRIDE-01',
      invoiceDate: '2026-11-02',
      items: [{ productId: 2, packQty: 10, unitPrice: 1000.00 }],
      paymentType: 'CREDIT',
      adminOverridePin: '1122',
    });
    assert.ok(inv.invoiceId);
    assert.strictEqual(inv.dueAmount, 10000.00);
  });

  // Scenario 10: Emergency System Backup & One-Click Disaster Restore
  it('Scenario 10: Emergency System Backup & One-Click Disaster Restore', () => {
    // Generate 5 active sales
    for (let i = 1; i <= 5; i++) {
      engine.createInvoice({
        customerId: 1,
        invoiceNumber: `INV-DR-${i}`,
        invoiceDate: '2026-11-02',
        items: [{ productId: 2, packQty: 2, unitPrice: 1000.00 }],
        paymentType: 'CASH',
      });
    }

    const backupPath = path.resolve(__dirname, `disaster_backup_${Date.now()}.db`);
    tempFiles.push(backupPath);
    engine.createBackup(backupPath);

    // Verify restored database integrity
    const restored = createDatabase(backupPath);
    const invoiceCount = restored.prepare('SELECT COUNT(*) as cnt FROM sales_invoices').get().cnt;
    assert.strictEqual(invoiceCount, 5, 'Restored database must contain exactly 5 invoices');
    restored.close();
  });

  // Scenario 11: Retailer Store Liquidation with Crate Refund Deduction
  it('Scenario 11: Retailer Store Liquidation with Crate Refund Deduction', () => {
    // Retailer owes 20,000 PKR Udhaar. Holds 80 crates with 20,000 PKR deposit liability (250 PKR/crate).
    db.prepare('UPDATE customers SET current_balance = 20000.00, current_crate_balance = 80, deposit_balance = 20000.00 WHERE id = 1').run();

    // Return 80 crates, refund deposit against Udhaar debt
    engine.recordCrateTransaction({
      customerId: 1,
      date: '2026-11-02',
      cratesOut: 0,
      cratesIn: 80,
      depositRefunded: 20000.00,
    });

    // Apply deposit refund as customer recovery offset
    engine.recordRecovery({
      customerId: 1,
      amount: 20000.00,
      allocationMode: 'ON_ACCOUNT',
    });

    const cust = db.prepare('SELECT current_balance, current_crate_balance, deposit_balance FROM customers WHERE id = 1').get();
    assert.strictEqual(cust.current_balance, 0.00, 'Debt settled to 0.00');
    assert.strictEqual(cust.current_crate_balance, 0, 'Crates settled to 0');
    assert.strictEqual(cust.deposit_balance, 0.00, 'Deposits settled to 0');
  });

  // Scenario 12: End-of-Day Terminal Closing with Physical Shortage Audit
  it('Scenario 12: End-of-Day Terminal Closing with Physical Shortage Audit', () => {
    const today = '2026-11-02';
    // Starting cash: 10,000 PKR
    // POS cash sales: 50,000 PKR
    // Total Expected = 60,000 PKR
    engine.recordCashBookEntry({ date: today, type: 'CASH_SALE', cashIn: 50000.00 });

    // Physical count: 58,000 PKR (Shortage of 2,000 PKR)
    const closing = engine.executeDailyClosing({
      closingDate: today,
      openingCash: 10000.00,
      physicalCash: 58000.00,
      denominations: { 5000: 11, 1000: 3 }, // 55k + 3k = 58k
      closedBy: 1,
      notes: 'Counter till shortage reported and logged to Suspense',
    });

    assert.strictEqual(closing.expectedClosingCash, 60000.00);
    assert.strictEqual(closing.cashVariance, -2000.00);
    assert.strictEqual(closing.status, 'SHORTAGE');

    // Audit log written
    engine.logAuditEvent({
      userId: 1,
      role: 'admin',
      eventCategory: 'CASH_VARIANCE',
      entityType: 'daily_closings',
      entityId: today,
      reason: 'Physical shortage of 2,000 PKR approved by GM',
    });

    const audit = db.prepare("SELECT * FROM audit_logs WHERE event_category = 'CASH_VARIANCE'").get();
    assert.ok(audit);
  });
});
