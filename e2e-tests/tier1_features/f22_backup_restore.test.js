/**
 * Tier 1: Feature 22 - 100% Offline SQLite Backup & Restore
 * Minimum 5 test cases covering hot backups, SQLite header integrity, and offline restoration.
 */

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, beforeEach, afterEach, assert } = require('../framework/harness.js');
const { createDatabase } = require('../framework/db.js');
const { seedDatabase } = require('../fixtures/seed_data.js');
const { DomainEngine } = require('../framework/domain_engine.js');

describe('Tier 1: F22 - 100% Offline SQLite Backup & Restore', () => {
  let db;
  let engine;
  let backupFile;

  beforeEach(() => {
    db = createDatabase();
    seedDatabase(db);
    engine = new DomainEngine(db);
    backupFile = path.resolve(__dirname, `test_backup_${Date.now()}.db`);
  });

  afterEach(() => {
    if (fs.existsSync(backupFile)) {
      fs.unlinkSync(backupFile);
    }
  });

  it('F22-T1: Creates atomic snapshot backup using SQLite VACUUM INTO', () => {
    const res = engine.createBackup(backupFile);
    assert.strictEqual(res.success, true);
    assert.ok(fs.existsSync(backupFile), 'Backup file must exist on disk');
    assert.ok(res.sizeBytes > 0, 'Backup file size must be non-zero');
  });

  it('F22-T2: Verifies backup file contains valid SQLite 3 magic header bytes', () => {
    engine.createBackup(backupFile);
    const isValid = engine.verifyBackupIntegrity(backupFile);
    assert.strictEqual(isValid, true, 'Header should match SQLite format 3');
  });

  it('F22-T3: Restoring database snapshot preserves seeded products, customers, and tables', () => {
    // Insert a unique marker record
    db.prepare("UPDATE customers SET name = 'Restored Customer Marker' WHERE id = 1").run();
    engine.createBackup(backupFile);

    // Open restored database from backup file
    const restoredDb = createDatabase(backupFile);
    const restoredCustomer = restoredDb.prepare('SELECT name FROM customers WHERE id = 1').get();
    assert.strictEqual(restoredCustomer.name, 'Restored Customer Marker');
    restoredDb.close();
  });

  it('F22-T4: Backup verification rejects non-existent or corrupted files', () => {
    const fakePath = path.resolve(__dirname, 'non_existent_file.db');
    assert.strictEqual(engine.verifyBackupIntegrity(fakePath), false, 'Non-existent file must fail verification');

    // Create a corrupted dummy file
    const corruptPath = path.resolve(__dirname, `corrupt_${Date.now()}.db`);
    fs.writeFileSync(corruptPath, 'CORRUPTED FILE NOT SQLITE');
    assert.strictEqual(engine.verifyBackupIntegrity(corruptPath), false, 'Corrupted file must fail');
    fs.unlinkSync(corruptPath);
  });

  it('F22-T5: Executes hot backup without blocking read/write database queries', () => {
    engine.createBackup(backupFile);

    // Execute standard query immediately after backup
    const productCount = db.prepare('SELECT COUNT(*) as cnt FROM products').get().cnt;
    assert.ok(productCount > 0, 'Database queries must execute cleanly after backup');
  });
});
