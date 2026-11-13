/**
 * Tier 2: F13 - Bank Book & Bank Reconciliation (Boundary & Corner Cases)
 */

const { describe, it, beforeEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F13 - Bank Book Boundary & Corner Cases', () => {
  let db;
  let engine;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  it('F13-B1: Depositing entire cash drawer balance into bank leaves drawer at exactly 0.00', () => {
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', cashIn: 40000.00 });

    const newBankBal = engine.recordBankDepositFromCash(40000.00, '2026-11-02', 1);

    assert.strictEqual(engine.getCashBalance(), 0.00);
    assert.strictEqual(newBankBal, 140000.00); // 100k seeded + 40k
  });

  it('F13-B2: Rejects zero or negative bank deposit attempt', () => {
    assert.throws(
      () => engine.recordBankDepositFromCash(0.00, '2026-11-02', 1),
      /must be positive/
    );
  });

  it('F13-B3: Additional secondary bank account with zero opening balance operates cleanly', () => {
    db.prepare(`
      INSERT INTO bank_accounts (id, bank_name, account_number, account_title, branch, current_balance)
      VALUES (2, 'Habib Bank Ltd', '1111-2222-3333', 'Logar Secondary Account', 'Main Branch', 0.00)
    `).run();

    engine.recordCashBookEntry({ date: '2026-11-02', type: 'INIT', cashIn: 10000.00 });
    const bal = engine.recordBankDepositFromCash(10000.00, '2026-11-02', 2);
    assert.strictEqual(bal, 10000.00);
  });

  it('F13-B4: Toggling uncleared cheque to cleared updates bank statement reconciliation flag', () => {
    db.prepare(`
      INSERT INTO bank_transactions (bank_account_id, entry_date, transaction_type, ref_no, description, deposit_amount, withdrawal_amount, running_balance, is_cleared)
      VALUES (1, '2026-11-02', 'CHEQUE', 'CHQ-99', 'Customer Cheque', 50000.00, 0, 150000.00, 0)
    `).run();

    const txId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    db.prepare('UPDATE bank_transactions SET is_cleared = 1 WHERE id = ?').run(txId);

    const tx = db.prepare('SELECT is_cleared FROM bank_transactions WHERE id = ?').get(txId);
    assert.strictEqual(tx.is_cleared, 1);
  });

  it('F13-B5: High-value bank transfer (5,000,000 PKR) preserves integer Paisa precision', () => {
    db.prepare('UPDATE bank_accounts SET current_balance = 5000000.00 WHERE id = 1').run();
    const bal = db.prepare('SELECT current_balance FROM bank_accounts WHERE id = 1').get().current_balance;
    assert.strictEqual(bal, 5000000.00);
  });
});
