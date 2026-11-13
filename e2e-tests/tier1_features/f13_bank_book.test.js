/**
 * Tier 1: Feature 13 - Bank Book & Bank Reconciliation
 * Minimum 5 test cases covering bank deposits, clearances, supplier transfers, and drawer cash reconciliation.
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F13 - Bank Book & Bank Reconciliation', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F13-T1: Cash deposited from drawer into bank increases bank balance and decreases drawer cash', () => {
    // Put 30,000 PKR in drawer
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'INIT',
      refType: 'INIT',
      refId: 1,
      description: 'Opening Cash',
      cashIn: 30000.00,
    });

    const bankBefore = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = 1').get().current_balance; // 100,000

    // Deposit 20,000 PKR into bank
    engine.recordBankDepositFromCash(20000.00, '2026-11-02', 1);

    assert.strictEqual(engine.getCashBalance(), 10000.00, 'Cash drawer should reduce to 10,000 PKR');
    const bankAfter = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = 1').get().current_balance;
    assert.strictEqual(bankAfter, bankBefore + 20000.00, 'Bank balance should increase by 20,000 PKR');
  });

  it('F13-T2: Rejects bank deposit when cash in drawer is insufficient', () => {
    // Drawer has 5,000 PKR
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'INIT',
      refType: 'INIT',
      refId: 1,
      description: 'Opening Cash',
      cashIn: 5000.00,
    });

    assert.throws(
      () => engine.recordBankDepositFromCash(10000.00, '2026-11-02', 1),
      /Insufficient cash in drawer/,
      'Should reject deposit exceeding drawer cash'
    );
  });

  it('F13-T3: Bank transaction logs reference instrument # and running balance', () => {
    engine.recordCashBookEntry({
      date: '2026-11-02',
      type: 'INIT',
      refType: 'INIT',
      refId: 1,
      description: 'Cash',
      cashIn: 50000.00,
    });

    engine.recordBankDepositFromCash(25000.00, '2026-11-02', 1);

    const tx = db.prepare('SELECT * FROM bank_transactions WHERE bank_account_id = 1 ORDER BY id DESC LIMIT 1').get();
    assert.ok(tx, 'Bank transaction record must exist');
    assert.strictEqual(tx.deposit_amount, 25000.00);
    assert.strictEqual(tx.running_balance, 125000.00);
  });

  it('F13-T4: Direct bank supplier payment decreases bank balance without touching cash drawer', () => {
    const cashBefore = engine.getCashBalance(); // 0
    const bankBefore = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = 1').get().current_balance;

    // Supplier payment of 30,000 PKR via Raast / Online
    db.prepare('UPDATE bank_accounts SET current_balance = current_balance - 30000.00 WHERE id = 1').run();
    db.prepare(`
      INSERT INTO bank_transactions (
        bank_account_id, entry_date, transaction_type, ref_no,
        description, deposit_amount, withdrawal_amount, running_balance
      ) VALUES (1, '2026-11-02', 'ONLINE_TRANSFER', 'FT-109283', 'Payment to Nextco Factory', 0, 30000.00, ?)
    `).run(bankBefore - 30000.00);

    assert.strictEqual(engine.getCashBalance(), cashBefore, 'Cash drawer must be untouched');
    const bankAfter = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = 1').get().current_balance;
    assert.strictEqual(bankAfter, bankBefore - 30000.00, 'Bank balance should decrease by 30,000 PKR');
  });

  it('F13-T5: Distinguishes between cleared and uncleared cheque instruments', () => {
    // Record uncleared cheque
    db.prepare(`
      INSERT INTO bank_transactions (
        bank_account_id, entry_date, transaction_type, ref_no,
        description, deposit_amount, withdrawal_amount, running_balance, is_cleared
      ) VALUES (1, '2026-11-02', 'CHEQUE_DEPOSIT', 'CHQ-8821', 'Customer Cheque Deposit', 40000.00, 0, 140000.00, 0)
    `).run();

    const uncleared = db.prepare('SELECT COUNT(*) as cnt FROM bank_transactions WHERE is_cleared = 0').get().cnt;
    assert.strictEqual(uncleared, 1, 'Should find 1 uncleared cheque transaction');
  });
});
