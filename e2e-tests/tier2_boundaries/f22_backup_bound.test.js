/**
 * Tier 2: F22 - 100% Offline SQLite Backup & Restore (Boundary & Corner Cases)
 */

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 2: F22 - Backup Boundary & Corner Cases', () => {
  let db;
  let engine;
  const createdFiles = [];

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
  });

  afterEach(() => {
    for (const f of createdFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    createdFiles.length = 0;
  });

  it('F22-B1: Two successive back-to-back snapshot backups create distinct valid files', () => {
    const f1 = path.resolve(__dirname, `b1_${Date.now()}.db`);
    const f2 = path.resolve(__dirname, `b2_${Date.now()}.db`);
    createdFiles.push(f1, f2);

    engine.createBackup(f1);
    engine.createBackup(f2);

    assert.ok(fs.existsSync(f1));
    assert.ok(fs.existsSync(f2));
    assert.strictEqual(engine.verifyBackupIntegrity(f1), true);
    assert.strictEqual(engine.verifyBackupIntegrity(f2), true);
  });

  it('F22-B2: Backup file path with spaces and underscore symbols executes successfully', () => {
    const spaceFile = path.resolve(__dirname, `backup file with spaces ${Date.now()}.db`);
    createdFiles.push(spaceFile);

    const res = engine.createBackup(spaceFile);
    assert.strictEqual(res.success, true);
    assert.strictEqual(engine.verifyBackupIntegrity(spaceFile), true);
  });

  it('F22-B3: Restoring snapshot preserves exact customer and supplier running balances', () => {
    db.prepare('UPDATE customers SET current_balance = 78950.00 WHERE id = 1').run();
    db.prepare('UPDATE suppliers SET current_payable = 125000.00 WHERE id = 1').run();

    const snapshot = path.resolve(__dirname, `snapshot_${Date.now()}.db`);
    createdFiles.push(snapshot);
    engine.createBackup(snapshot);

    const restoredDb = createDatabase(snapshot);
    const c = restoredDb.prepare('SELECT current_balance FROM customers WHERE id = 1').get();
    const s = restoredDb.prepare('SELECT current_payable FROM suppliers WHERE id = 1').get();

    assert.strictEqual(c.current_balance, 78950.00);
    assert.strictEqual(s.current_payable, 125000.00);
    restoredDb.close();
  });

  it('F22-B4: Zero-byte empty file fails SQLite header integrity verification', () => {
    const emptyFile = path.resolve(__dirname, `empty_${Date.now()}.db`);
    createdFiles.push(emptyFile);
    fs.writeFileSync(emptyFile, '');

    assert.strictEqual(engine.verifyBackupIntegrity(emptyFile), false);
  });

  it('F22-B5: Database serves write transactions immediately after snapshot backup without locking', () => {
    const snap = path.resolve(__dirname, `snap_write_${Date.now()}.db`);
    createdFiles.push(snap);
    engine.createBackup(snap);

    // Write transaction immediately after
    engine.recordCashBookEntry({ date: '2026-11-02', type: 'SALE', cashIn: 5000.00 });
    assert.strictEqual(engine.getCashBalance(), 5000.00);
  });
});
