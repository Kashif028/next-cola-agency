use std::fs::{self, File, OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use rusqlite::{params, Connection};
use logar_pos_lib::db::backup::BackupService;
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::db::pool::{create_db_pool, execute_transaction, DbPool};

/// Helper to set up a freshly migrated live database on disk
fn setup_test_db(dir: &Path, name: &str) -> (DbPool, PathBuf) {
    let db_path = dir.join(name);
    let pool = create_db_pool(&db_path).expect("Failed to create test pool");
    {
        let mut conn = pool.get().expect("Failed to get conn for migrations");
        run_migrations(&mut conn).expect("Failed to run migrations");
    }
    (pool, db_path)
}

// =========================================================================
// CHALLENGE 1: Live Hot Backup Under Heavy Concurrent Write Transactions
// =========================================================================
#[test]
fn challenge_live_hot_backup_during_concurrent_writes() {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let (pool, _db_path) = setup_test_db(temp_dir.path(), "concurrent_live.db");
    let backup_path = temp_dir.path().join("concurrent_hot_backup.db");

    let running = Arc::new(AtomicBool::new(true));

    // Worker 1: Rapid product batch inserts inside transactions
    let pool1 = pool.clone();
    let r1 = running.clone();
    let handle1 = thread::spawn(move || {
        let mut idx = 0;
        while r1.load(Ordering::Relaxed) && idx < 50 {
            idx += 1;
            let sku = format!("SKU-CONC-P1-{:05}", idx);
            let res = execute_transaction(&pool1, |conn| {
                conn.execute(
                    "INSERT INTO products (sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
                     VALUES (?1, 'Concurrent Drink', 'Nextco', 'PET_PLASTIC', 50000, 65000, 10000);",
                    params![sku],
                )?;
                Ok(())
            });
            if res.is_err() {
                // If busy timeout occurs, brief pause
                thread::sleep(Duration::from_millis(2));
            } else {
                thread::sleep(Duration::from_millis(1));
            }
        }
        idx
    });

    // Worker 2: Rapid customer inserts and balance updates
    let pool2 = pool.clone();
    let r2 = running.clone();
    let handle2 = thread::spawn(move || {
        let mut idx = 0;
        while r2.load(Ordering::Relaxed) && idx < 50 {
            idx += 1;
            let code = format!("CUST-CONC-{:05}", idx);
            let res = execute_transaction(&pool2, |conn| {
                conn.execute(
                    "INSERT INTO customers (code, name, phone, address, current_balance_paisa)
                     VALUES (?1, 'Concurrent Retailer', '03000000000', 'Faisalabad', 100000);",
                    params![code],
                )?;
                Ok(())
            });
            if res.is_err() {
                thread::sleep(Duration::from_millis(2));
            } else {
                thread::sleep(Duration::from_millis(1));
            }
        }
        idx
    });

    // Worker 3: Rapid Cash Book logging
    let pool3 = pool.clone();
    let r3 = running.clone();
    let handle3 = thread::spawn(move || {
        let mut idx = 0;
        while r3.load(Ordering::Relaxed) && idx < 50 {
            idx += 1;
            let res = execute_transaction(&pool3, |conn| {
                conn.execute(
                    "INSERT INTO cash_book (entry_date, transaction_type, account_id, particulars, cash_in_paisa, cash_out_paisa, running_balance_paisa)
                     VALUES ('2026-11-04', 'DIRECT_INCOME', 1, 'Concurrent Cash', 50000, 0, 50000);",
                    [],
                )?;
                Ok(())
            });
            if res.is_err() {
                thread::sleep(Duration::from_millis(2));
            } else {
                thread::sleep(Duration::from_millis(1));
            }
        }
        idx
    });

    // Let concurrent transactions warm up and saturate WAL
    thread::sleep(Duration::from_millis(50));

    // Trigger Hot Online Backup while 3 worker threads are actively writing transactions
    let backup_start = std::time::Instant::now();
    let backup_meta = BackupService::create_live_backup(&pool, Some(backup_path.clone()))
        .expect("Hot backup failed during concurrent write load!");
    let backup_duration = backup_start.elapsed();

    // Stop workers and join
    running.store(false, Ordering::Relaxed);
    let count1 = handle1.join().unwrap();
    let count2 = handle2.join().unwrap();
    let count3 = handle3.join().unwrap();

    println!(
        "Concurrent stress results: Worker1={} products, Worker2={} customers, Worker3={} cash entries. Backup completed in {:?}",
        count1, count2, count3, backup_duration
    );

    // Assertions on hot backup file
    assert!(backup_path.exists(), "Backup file must exist on disk");
    assert!(backup_meta.size_bytes > 0, "Backup file size must be > 0");

    // 1. Verify standard SQLite magic header
    assert!(BackupService::verify_sqlite_header(&backup_path).is_ok());

    // 2. Open backup database directly and execute PRAGMA integrity_check
    let backup_conn = Connection::open(&backup_path).expect("Must open backup DB");
    let integrity: String = backup_conn
        .query_row("PRAGMA integrity_check;", [], |r| r.get(0))
        .expect("Integrity check query failed");
    assert_eq!(integrity, "ok", "Hot backup taken during concurrent writes must pass integrity_check");

    // 3. Verify foreign key consistency of the snapshot
    let fk_violations: i64 = backup_conn
        .query_row("SELECT count(*) FROM pragma_foreign_key_check();", [], |r| r.get(0))
        .expect("FK check query failed");
    assert_eq!(fk_violations, 0, "Hot backup snapshot must have 0 foreign key violations");

    // 4. Verify snapshot contains records
    let backup_products: i64 = backup_conn
        .query_row("SELECT count(*) FROM products;", [], |r| r.get(0))
        .unwrap();
    assert!(backup_products > 0, "Backup must contain products written prior to or during backup");
}

// =========================================================================
// CHALLENGE 2: Corruption Detection & Truncation Rejection
// =========================================================================
#[test]
fn challenge_corruption_detection_suite() {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let (pool, db_path) = setup_test_db(temp_dir.path(), "corruption_test.db");

    // Insert baseline product to verify live DB is NOT damaged on failed restores
    {
        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO products (sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
             VALUES ('BASELINE-PROD-1', 'Baseline Drink', 'Nextco', 'RGB_GLASS', 10000, 15000, 2000);",
            [],
        ).unwrap();
    }

    let verify_baseline_intact = || {
        let conn = pool.get().unwrap();
        let count: i64 = conn
            .query_row("SELECT count(*) FROM products WHERE sku_code = 'BASELINE-PROD-1';", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1, "Live database must remain intact after failed restore attempt");
    };

    // Case 2A: Non-existent file
    let non_existent = temp_dir.path().join("does_not_exist.db");
    let res_missing = BackupService::restore_from_backup(&pool, &non_existent, &db_path);
    assert!(res_missing.is_err(), "Non-existent backup file must be rejected");
    let err_str = res_missing.unwrap_err().to_string();
    assert!(err_str.contains("not found"), "Error must state archive not found, got: {}", err_str);
    verify_baseline_intact();

    // Case 2B: 0-byte (Empty) file
    let empty_file = temp_dir.path().join("empty_backup.db");
    File::create(&empty_file).unwrap();
    let res_empty = BackupService::restore_from_backup(&pool, &empty_file, &db_path);
    assert!(res_empty.is_err(), "Zero-byte backup file must be rejected");
    verify_baseline_intact();

    // Case 2C: Truncated header (under 16 bytes: 1 byte, 7 bytes, 15 bytes)
    for sz in [1, 7, 15] {
        let trunc_path = temp_dir.path().join(format!("trunc_{}b.db", sz));
        fs::write(&trunc_path, vec![0x53; sz]).unwrap();
        let res_trunc = BackupService::restore_from_backup(&pool, &trunc_path, &db_path);
        assert!(res_trunc.is_err(), "Truncated {} bytes file must be rejected", sz);
        assert!(BackupService::verify_sqlite_header(&trunc_path).is_err());
        verify_baseline_intact();
    }

    // Case 2D: Invalid header signature (16+ bytes of non-SQLite signature)
    let fake_header = temp_dir.path().join("fake_header.db");
    let garbage_payload = b"NOT_SQLITE_FORMAT_THIS_IS_CORRUPT_PAYLOAD_DATA_1234567890";
    fs::write(&fake_header, garbage_payload).unwrap();
    let res_fake = BackupService::restore_from_backup(&pool, &fake_header, &db_path);
    assert!(res_fake.is_err(), "File with invalid header must be rejected");
    let fake_err = res_fake.unwrap_err().to_string();
    assert!(fake_err.contains("Missing SQLite header") || fake_err.contains("Invalid database"), "Got: {}", fake_err);
    verify_baseline_intact();

    // Case 2E: Valid 16-byte magic header, but severely truncated body (64 bytes total)
    let valid_magic_trunc = temp_dir.path().join("valid_magic_trunc.db");
    let mut truncated_data = Vec::from(b"SQLite format 3\0");
    truncated_data.resize(64, 0x00);
    fs::write(&valid_magic_trunc, truncated_data).unwrap();
    assert!(BackupService::verify_sqlite_header(&valid_magic_trunc).is_ok());
    let res_magic_trunc = BackupService::restore_from_backup(&pool, &valid_magic_trunc, &db_path);
    assert!(res_magic_trunc.is_err(), "Valid magic but truncated file must be rejected by integrity check");
    verify_baseline_intact();

    // Case 2F: Valid SQLite file corrupted on disk (B-Tree corruption)
    let valid_backup = temp_dir.path().join("valid_to_corrupt.db");
    BackupService::create_live_backup(&pool, Some(valid_backup.clone())).unwrap();
    assert!(BackupService::verify_sqlite_header(&valid_backup).is_ok());

    // Corrupt page header at offset 100 (first byte of root b-tree page)
    {
        let mut f = OpenOptions::new().read(true).write(true).open(&valid_backup).unwrap();
        f.seek(SeekFrom::Start(100)).unwrap();
        // 0xFF is an invalid page type flag (valid are 0x02, 0x05, 0x0a, 0x0d)
        f.write_all(&[0xFF; 32]).unwrap();
        f.flush().unwrap();
    }

    let res_corrupted = BackupService::restore_from_backup(&pool, &valid_backup, &db_path);
    println!("Corrupted restore result: {:?}", res_corrupted);
    assert!(res_corrupted.is_err(), "Corrupted B-Tree SQLite backup must be rejected by integrity check");
    let corr_err = res_corrupted.unwrap_err().to_string();
    assert!(corr_err.contains("corrupted") || corr_err.contains("Integrity check") || corr_err.contains("Cannot open"), "Got: {}", corr_err);
    verify_baseline_intact();
}

// =========================================================================
// CHALLENGE 3: SHA-256 Tamper Detection & Integrity Verification
// =========================================================================
#[test]
fn challenge_sha256_checksum_tamper_detection() {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let (pool, _db_path) = setup_test_db(temp_dir.path(), "sha_test.db");
    let backup_path = temp_dir.path().join("sha_backup.db");

    let meta = BackupService::create_live_backup(&pool, Some(backup_path.clone())).unwrap();
    let initial_hash = meta.checksum_sha256;
    assert_eq!(initial_hash.len(), 64, "SHA-256 hash must be 64 hex characters");

    // Recompute directly
    let direct_hash = BackupService::calculate_file_sha256(&backup_path).unwrap();
    assert_eq!(initial_hash, direct_hash, "Direct SHA-256 must match metadata hash");

    // Tamper with a single bit in the file at offset 512
    {
        let mut file_bytes = fs::read(&backup_path).unwrap();
        assert!(file_bytes.len() > 512);
        file_bytes[512] ^= 0x01; // flip single bit
        fs::write(&backup_path, file_bytes).unwrap();
    }

    let tampered_hash = BackupService::calculate_file_sha256(&backup_path).unwrap();
    assert_ne!(initial_hash, tampered_hash, "Flipping a single bit must alter the SHA-256 checksum completely");
}

// =========================================================================
// CHALLENGE 4: Restore Safety, Pre-Restore Snapshot & Reverse Fidelity
// =========================================================================
#[test]
fn challenge_restore_fidelity_and_prerestore_safety_snapshot() {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let (pool, db_path) = setup_test_db(temp_dir.path(), "fidelity_live.db");
    let backup_v1_path = temp_dir.path().join("state_v1.db");

    // 1. Establish State V1
    {
        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO customers (id, code, name, phone, address, current_balance_paisa)
             VALUES (101, 'CUST-V1-01', 'State V1 Customer', '03001111111', 'Lahore', 500000);",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO products (id, sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
             VALUES (201, 'SKU-V1-01', 'State V1 Product', 'Nextco', 'CAN_ALU', 30000, 40000, 5000);",
            [],
        ).unwrap();
    }

    // Backup State V1
    BackupService::create_live_backup(&pool, Some(backup_v1_path.clone())).expect("V1 backup failed");

    // 2. Mutate live DB to State V2 (Add new rows, mutate customer balance, delete product)
    {
        let conn = pool.get().unwrap();
        conn.execute("UPDATE customers SET current_balance_paisa = 999999 WHERE id = 101;", []).unwrap();
        conn.execute("DELETE FROM products WHERE id = 201;", []).unwrap();
        conn.execute(
            "INSERT INTO products (id, sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
             VALUES (202, 'SKU-V2-MUTANT', 'Mutant V2 Product', 'Nextco', 'PET_PLASTIC', 60000, 70000, 8000);",
            [],
        ).unwrap();
    }

    // Verify State V2 is live
    {
        let conn = pool.get().unwrap();
        let bal: i64 = conn.query_row("SELECT current_balance_paisa FROM customers WHERE id = 101;", [], |r| r.get(0)).unwrap();
        assert_eq!(bal, 999999);
        let prod201: i64 = conn.query_row("SELECT count(*) FROM products WHERE id = 201;", [], |r| r.get(0)).unwrap();
        assert_eq!(prod201, 0);
        let prod202: i64 = conn.query_row("SELECT count(*) FROM products WHERE id = 202;", [], |r| r.get(0)).unwrap();
        assert_eq!(prod202, 1);
    }

    // 3. Trigger Restore from Backup V1
    let safety_snapshot_str = BackupService::restore_from_backup(&pool, &backup_v1_path, &db_path)
        .expect("Restore from V1 backup failed");

    // 4. Verify Pre-Restore Safety Snapshot
    let safety_path = PathBuf::from(&safety_snapshot_str);
    assert!(safety_path.exists(), "Pre-restore safety snapshot file must exist on disk");
    assert!(BackupService::verify_sqlite_header(&safety_path).is_ok());

    // Check that pre-restore safety snapshot actually contains State V2!
    {
        let safety_conn = Connection::open(&safety_path).expect("Must open safety snapshot");
        let safety_bal: i64 = safety_conn
            .query_row("SELECT current_balance_paisa FROM customers WHERE id = 101;", [], |r| r.get(0))
            .unwrap();
        assert_eq!(safety_bal, 999999, "Safety snapshot must preserve the pre-restore customer balance of State V2");

        let safety_prod202: i64 = safety_conn
            .query_row("SELECT count(*) FROM products WHERE id = 202;", [], |r| r.get(0))
            .unwrap();
        assert_eq!(safety_prod202, 1, "Safety snapshot must contain mutant product 202 from State V2");
    }

    // 5. Verify Live Database Restored Exactly to State V1 Fidelity
    {
        let conn = pool.get().unwrap();
        let bal: i64 = conn.query_row("SELECT current_balance_paisa FROM customers WHERE id = 101;", [], |r| r.get(0)).unwrap();
        assert_eq!(bal, 500000, "Customer balance must be restored to State V1 (500000)");

        let prod201: i64 = conn.query_row("SELECT count(*) FROM products WHERE id = 201;", [], |r| r.get(0)).unwrap();
        assert_eq!(prod201, 1, "Deleted product 201 must be restored from State V1");

        let prod202: i64 = conn.query_row("SELECT count(*) FROM products WHERE id = 202;", [], |r| r.get(0)).unwrap();
        assert_eq!(prod202, 0, "Mutant product 202 must NOT exist in restored State V1");

        // Verify WAL Mode and Foreign Keys post-restore
        let journal_mode: String = conn.query_row("PRAGMA journal_mode;", [], |r| r.get(0)).unwrap();
        assert_eq!(journal_mode.to_lowercase(), "wal", "Post-restore database must maintain WAL mode");

        let foreign_keys: i32 = conn.query_row("PRAGMA foreign_keys;", [], |r| r.get(0)).unwrap();
        assert_eq!(foreign_keys, 1, "Post-restore database must have foreign keys enabled");
    }
}

// =========================================================================
// CHALLENGE 5: Multi-Cycle Cascading Backup & Time-Travel Restore
// =========================================================================
#[test]
fn challenge_multi_cycle_cascade_and_time_travel() {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let (pool, db_path) = setup_test_db(temp_dir.path(), "cascade_live.db");

    let b1 = temp_dir.path().join("cascade_b1.db");
    let b2 = temp_dir.path().join("cascade_b2.db");
    let b3 = temp_dir.path().join("cascade_b3.db");

    // Cycle 1: 5 products
    {
        let conn = pool.get().unwrap();
        for i in 1..=5 {
            conn.execute(
                "INSERT INTO products (sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
                 VALUES (?1, 'Drink', 'Nextco', 'CAN_ALU', 1000, 2000, 300);",
                params![format!("CYCLE-1-{}", i)],
            ).unwrap();
        }
    }
    BackupService::create_live_backup(&pool, Some(b1.clone())).unwrap();

    // Cycle 2: Add 5 more products (10 total)
    {
        let conn = pool.get().unwrap();
        for i in 6..=10 {
            conn.execute(
                "INSERT INTO products (sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
                 VALUES (?1, 'Drink', 'Nextco', 'CAN_ALU', 1000, 2000, 300);",
                params![format!("CYCLE-2-{}", i)],
            ).unwrap();
        }
    }
    BackupService::create_live_backup(&pool, Some(b2.clone())).unwrap();

    // Cycle 3: Add 5 more products (15 total)
    {
        let conn = pool.get().unwrap();
        for i in 11..=15 {
            conn.execute(
                "INSERT INTO products (sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
                 VALUES (?1, 'Drink', 'Nextco', 'CAN_ALU', 1000, 2000, 300);",
                params![format!("CYCLE-3-{}", i)],
            ).unwrap();
        }
    }
    BackupService::create_live_backup(&pool, Some(b3.clone())).unwrap();

    // Time-travel: Restore B1 (Expect 5 products)
    BackupService::restore_from_backup(&pool, &b1, &db_path).unwrap();
    {
        let conn = pool.get().unwrap();
        let cnt: i64 = conn.query_row("SELECT count(*) FROM products WHERE sku_code LIKE 'CYCLE-%';", [], |r| r.get(0)).unwrap();
        assert_eq!(cnt, 5, "Restoring B1 must yield exactly 5 products");
    }

    // Time-travel: Restore B3 (Expect 15 products)
    BackupService::restore_from_backup(&pool, &b3, &db_path).unwrap();
    {
        let conn = pool.get().unwrap();
        let cnt: i64 = conn.query_row("SELECT count(*) FROM products WHERE sku_code LIKE 'CYCLE-%';", [], |r| r.get(0)).unwrap();
        assert_eq!(cnt, 15, "Restoring B3 must yield exactly 15 products");
    }

    // Time-travel: Restore B2 (Expect 10 products)
    BackupService::restore_from_backup(&pool, &b2, &db_path).unwrap();
    {
        let conn = pool.get().unwrap();
        let cnt: i64 = conn.query_row("SELECT count(*) FROM products WHERE sku_code LIKE 'CYCLE-%';", [], |r| r.get(0)).unwrap();
        assert_eq!(cnt, 10, "Restoring B2 must yield exactly 10 products");
    }
}

// =========================================================================
// CHALLENGE 6: Isolation Against Uncommitted Transactions & Dirty Reads
// =========================================================================
#[test]
fn challenge_uncommitted_transaction_isolation() {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let (pool, _db_path) = setup_test_db(temp_dir.path(), "isolation_live.db");
    let backup_path = temp_dir.path().join("isolation_backup.db");

    // 1. Initial committed state
    {
        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO products (sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
             VALUES ('COMMITTED-PROD-1', 'Committed Drink', 'Nextco', 'PET_PLASTIC', 20000, 25000, 3000);",
            [],
        ).unwrap();
    }

    // 2. Open an uncommitted transaction in a separate connection
    let uncommitted_conn = pool.get().unwrap();
    uncommitted_conn.execute_batch("BEGIN IMMEDIATE;").unwrap();
    uncommitted_conn.execute(
        "INSERT INTO products (sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
         VALUES ('DIRTY-PROD-UNCOMMITTED', 'Dirty Drink', 'Nextco', 'PET_PLASTIC', 99999, 99999, 9999);",
        [],
    ).unwrap();

    // 3. Concurrently take hot backup while uncommitted transaction is open
    // In SQLite WAL mode, readers do not see uncommitted dirty writes from active transactions.
    let backup_meta = BackupService::create_live_backup(&pool, Some(backup_path.clone()))
        .expect("Backup should succeed without blocking on open transaction in WAL mode");
    assert!(backup_meta.size_bytes > 0);

    // 4. Rollback the uncommitted transaction
    uncommitted_conn.execute_batch("ROLLBACK;").unwrap();
    drop(uncommitted_conn);

    // 5. Inspect the backup file: MUST NOT contain dirty uncommitted data!
    let backup_conn = Connection::open(&backup_path).unwrap();
    let dirty_count: i64 = backup_conn
        .query_row("SELECT count(*) FROM products WHERE sku_code = 'DIRTY-PROD-UNCOMMITTED';", [], |r| r.get(0))
        .unwrap();
    assert_eq!(dirty_count, 0, "Online backup must NEVER contain dirty/uncommitted transaction records");

    let committed_count: i64 = backup_conn
        .query_row("SELECT count(*) FROM products WHERE sku_code = 'COMMITTED-PROD-1';", [], |r| r.get(0))
        .unwrap();
    assert_eq!(committed_count, 1, "Online backup must preserve committed transaction records");
}

// =========================================================================
// CHALLENGE 7: High Volume Multi-Page Data Fidelity & Trigger Integrity
// =========================================================================
#[test]
fn challenge_large_dataset_multipage_backup_and_restore() {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let (pool, db_path) = setup_test_db(temp_dir.path(), "large_dataset_live.db");
    let backup_path = temp_dir.path().join("large_dataset_backup.db");

    // Insert 200 products and 100 customers within a transaction
    execute_transaction(&pool, |conn| {
        for i in 1..=200 {
            conn.execute(
                "INSERT INTO products (sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
                 VALUES (?1, 'Bulk Drink', 'Nextco', 'PET_PLASTIC', 30000, 38000, 4500);",
                params![format!("SKU-BULK-{:04}", i)],
            )?;
        }
        for i in 1..=100 {
            conn.execute(
                "INSERT INTO customers (code, name, phone, address, current_balance_paisa)
                 VALUES (?1, 'Bulk Retailer', '03001234567', 'Market', 250000);",
                params![format!("CUST-BULK-{:04}", i)],
            )?;
        }
        // Insert 100 sales invoices and 300 line items
        for i in 1..=100 {
            let inv_num = format!("INV-BULK-{:04}", i);
            conn.execute(
                "INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa, payment_type, status)
                 VALUES (?1, 1, '2026-11-04', '2026-11-18', 30000, 30000, 0, 30000, 'CREDIT', 'UNPAID');",
                params![inv_num],
            )?;
            let inv_id: i64 = conn.last_insert_rowid();
            for item_idx in 1..=3 {
                conn.execute(
                    "INSERT INTO sales_invoice_items (invoice_id, product_id, unit_chosen, pack_qty, total_base_units, unit_price_paisa, line_total_paisa)
                     VALUES (?1, ?2, 'PACK', 2, 24, 5000, 10000);",
                    params![inv_id, item_idx],
                )?;
            }
        }
        Ok(())
    }).expect("Bulk seed failed");

    // Hot backup
    let meta = BackupService::create_live_backup(&pool, Some(backup_path.clone())).expect("Bulk backup failed");
    println!("Bulk backup created: {} bytes", meta.size_bytes);
    assert!(meta.size_bytes > 50_000, "Bulk database backup must span multiple SQLite 4KB pages");

    // Destructively mutate live database
    execute_transaction(&pool, |conn| {
        conn.execute("DELETE FROM sales_invoice_items WHERE invoice_id > 50;", [])?;
        conn.execute("DELETE FROM sales_invoices WHERE invoice_number > 'INV-BULK-0050';", [])?;
        conn.execute("DELETE FROM products WHERE sku_code LIKE 'SKU-BULK-%' AND id % 2 = 0;", [])?;
        conn.execute("DELETE FROM customers WHERE code LIKE 'CUST-BULK-%' AND id % 2 = 0;", [])?;
        Ok(())
    }).expect("Mutation failed");

    // Verify destructive mutation took place
    {
        let conn = pool.get().unwrap();
        let prod_cnt: i64 = conn.query_row("SELECT count(*) FROM products WHERE sku_code LIKE 'SKU-BULK-%';", [], |r| r.get(0)).unwrap();
        assert!(prod_cnt < 200, "Products should have been partially deleted");
    }

    // Restore from backup
    let safety_path = BackupService::restore_from_backup(&pool, &backup_path, &db_path).expect("Bulk restore failed");
    assert!(Path::new(&safety_path).exists(), "Pre-restore safety snapshot must exist");

    // Verify complete data fidelity post-restore
    {
        let conn = pool.get().unwrap();
        let prod_cnt: i64 = conn.query_row("SELECT count(*) FROM products WHERE sku_code LIKE 'SKU-BULK-%';", [], |r| r.get(0)).unwrap();
        assert_eq!(prod_cnt, 200, "All 200 bulk products must be restored");

        let cust_cnt: i64 = conn.query_row("SELECT count(*) FROM customers WHERE code LIKE 'CUST-BULK-%';", [], |r| r.get(0)).unwrap();
        assert_eq!(cust_cnt, 100, "All 100 bulk customers must be restored");

        let inv_cnt: i64 = conn.query_row("SELECT count(*) FROM sales_invoices WHERE invoice_number LIKE 'INV-BULK-%';", [], |r| r.get(0)).unwrap();
        assert_eq!(inv_cnt, 100, "All 100 bulk invoices must be restored");

        let item_cnt: i64 = conn.query_row("SELECT count(*) FROM sales_invoice_items WHERE invoice_id IN (SELECT id FROM sales_invoices WHERE invoice_number LIKE 'INV-BULK-%');", [], |r| r.get(0)).unwrap();
        assert_eq!(item_cnt, 300, "All 300 invoice items must be restored");

        // Integrity and FK check
        let integrity: String = conn.query_row("PRAGMA integrity_check;", [], |r| r.get(0)).unwrap();
        assert_eq!(integrity, "ok");

        let fk_violations: i64 = conn.query_row("SELECT count(*) FROM pragma_foreign_key_check();", [], |r| r.get(0)).unwrap();
        assert_eq!(fk_violations, 0);
    }
}

