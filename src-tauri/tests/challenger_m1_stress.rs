use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use rusqlite::params;
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::db::pool::{create_db_pool, create_in_memory_pool, execute_transaction};
use logar_pos_lib::domain::errors::AppError;

/// Helper to initialize a file-backed pool with all migrations applied
fn setup_file_pool(dir: &tempfile::TempDir, name: &str) -> (logar_pos_lib::db::pool::DbPool, std::path::PathBuf) {
    let db_path = dir.path().join(name);
    let pool = create_db_pool(&db_path).expect("Failed to create file pool");
    {
        let mut conn = pool.get().expect("Failed to get connection for migration");
        run_migrations(&mut conn).expect("Failed to run migrations");
    }
    (pool, db_path)
}

/// Helper to initialize an in-memory pool with all migrations applied
fn setup_memory_pool() -> logar_pos_lib::db::pool::DbPool {
    let pool = create_in_memory_pool().expect("Failed to create memory pool");
    {
        let mut conn = pool.get().expect("Failed to get connection for migration");
        run_migrations(&mut conn).expect("Failed to run migrations");
    }
    pool
}

// ============================================================================
// STRESS TEST 1: WAL Concurrency — Concurrent Readers During Long-Running Writer
// ============================================================================
#[test]
fn stress_test_wal_concurrent_readers_during_writer() {
    let temp_dir = tempfile::tempdir().expect("tempdir");
    let (pool, _path) = setup_file_pool(&temp_dir, "wal_concurrency.db");

    let stop_flag = Arc::new(AtomicBool::new(false));
    let reader_success_count = Arc::new(AtomicUsize::new(0));

    // Spawn 5 concurrent reader threads
    let mut reader_handles = Vec::new();
    for reader_id in 0..5 {
        let pool_clone = pool.clone();
        let stop_clone = stop_flag.clone();
        let success_clone = reader_success_count.clone();

        let handle = thread::spawn(move || {
            let conn = pool_clone.get().expect("Reader failed to get connection");
            let mut read_iterations = 0;
            while !stop_clone.load(Ordering::Relaxed) {
                // Read from products table while writer is writing
                let count_res: Result<i64, _> = conn.query_row(
                    "SELECT COUNT(*) FROM products;",
                    [],
                    |r| r.get(0),
                );

                match count_res {
                    Ok(_) => {
                        success_clone.fetch_add(1, Ordering::Relaxed);
                        read_iterations += 1;
                    }
                    Err(e) => {
                        panic!("Reader {} was BLOCKED or errored under WAL: {}", reader_id, e);
                    }
                }
                thread::sleep(Duration::from_millis(5));
            }
            read_iterations
        });
        reader_handles.push(handle);
    }

    // Heavy writer: inserts rows with intentional delay to simulate high write duration
    let writer_pool = pool.clone();
    let write_res = execute_transaction(&writer_pool, |conn| {
        for i in 1000..1050 {
            conn.execute(
                "INSERT INTO products (
                    sku_code, name, brand, packaging_type,
                    purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa
                 ) VALUES (?1, ?2, 'Nextco', 'PET_PLASTIC', 50000, 60000, 10000);",
                params![format!("WAL-STRESS-{}", i), format!("Stress Product {}", i)],
            )?;
            // Small sleep to ensure transaction stays open during reader queries
            thread::sleep(Duration::from_millis(10));
        }
        Ok(())
    });

    // Stop readers after writer finishes
    stop_flag.store(true, Ordering::Relaxed);
    assert!(write_res.is_ok(), "Writer transaction failed: {:?}", write_res);

    let total_reads: usize = reader_handles.into_iter().map(|h| h.join().unwrap()).sum();
    let total_success = reader_success_count.load(Ordering::Relaxed);

    println!(
        "[WAL Concurrency Stress] Completed 50 writes over ~500ms. Readers performed {} non-blocking reads (success count: {}).",
        total_reads, total_success
    );

    assert!(total_success > 50, "Readers should have executed numerous queries concurrently during active write transaction without blocking");

    // Post-commit verification: all 50 inserted items must now be visible
    let conn = pool.get().expect("Final conn");
    let final_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM products WHERE sku_code LIKE 'WAL-STRESS-%';",
        [],
        |r| r.get(0),
    ).expect("Query final count");
    assert_eq!(final_count, 50, "All 50 stress products must be present after commit");
}

// ============================================================================
// STRESS TEST 2: High Contention Multiple Writers with Busy Timeout
// ============================================================================
#[test]
fn stress_test_concurrent_writers_queue_via_busy_timeout() {
    let temp_dir = tempfile::tempdir().expect("tempdir");
    let (pool, _path) = setup_file_pool(&temp_dir, "writers_contention.db");

    let num_writers = 4;
    let items_per_writer = 15;
    let mut handles = Vec::new();

    for writer_id in 0..num_writers {
        let pool_clone = pool.clone();
        let handle = thread::spawn(move || {
            let res = execute_transaction(&pool_clone, |conn| {
                for i in 0..items_per_writer {
                    let sku = format!("WRITER-{}-{}", writer_id, i);
                    conn.execute(
                        "INSERT INTO products (
                            sku_code, name, brand, packaging_type,
                            purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa
                         ) VALUES (?1, ?2, 'Nextco', 'PET_PLASTIC', 40000, 50000, 2000);",
                        params![sku, format!("Writer Prod {} {}", writer_id, i)],
                    )?;
                    thread::sleep(Duration::from_millis(5));
                }
                Ok(())
            });
            res
        });
        handles.push(handle);
    }

    for (idx, handle) in handles.into_iter().enumerate() {
        let result = handle.join().expect("Thread panicked");
        assert!(
            result.is_ok(),
            "Writer {} failed under concurrency contention: {:?}",
            idx,
            result
        );
    }

    let conn = pool.get().unwrap();
    let total_written: i64 = conn.query_row(
        "SELECT COUNT(*) FROM products WHERE sku_code LIKE 'WRITER-%';",
        [],
        |r| r.get(0),
    ).unwrap();

    assert_eq!(
        total_written,
        (num_writers * items_per_writer) as i64,
        "All concurrent writers must cleanly succeed and commit without deadlock"
    );
}

// ============================================================================
// STRESS TEST 3: Constraint Stress — Foreign Keys, ON DELETE RESTRICT/CASCADE
// ============================================================================
#[test]
fn stress_test_database_foreign_key_and_check_constraints() {
    let pool = setup_memory_pool();
    let conn = pool.get().expect("conn");

    // 1. Invalid Customer FK in Sales Invoices
    let bad_cust = conn.execute(
        "INSERT INTO sales_invoices (invoice_number, customer_id, invoice_date, due_date, subtotal_paisa, net_total_paisa, due_amount_paisa, payment_type)
         VALUES ('INV-BAD-CUST', 88888, '2026-11-04', '2026-11-18', 100000, 100000, 100000, 'CREDIT');",
        [],
    );
    assert!(bad_cust.is_err(), "Must reject invalid customer_id FK");

    // 2. Invalid Supplier FK in Purchase Invoices
    let bad_supp = conn.execute(
        "INSERT INTO purchase_invoices (purchase_number, supplier_id, purchase_date, base_goods_paisa, total_landed_cost_paisa)
         VALUES ('PO-BAD-SUPP', 88888, '2026-11-04', 100000, 100000);",
        [],
    );
    assert!(bad_supp.is_err(), "Must reject invalid supplier_id FK");

    // 3. Invalid Product FK in Packaging Units
    let bad_prod_pack = conn.execute(
        "INSERT INTO packaging_units (product_id, unit_name, multiplier_to_base)
         VALUES (88888, 'Bogus Pack', 12);",
        [],
    );
    assert!(bad_prod_pack.is_err(), "Must reject invalid product_id in packaging_units");

    // 4. Invalid Account FK in Journal Lines
    let bad_acc = conn.execute(
        "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa)
         VALUES (1, 88888, 50000, 0);",
        [],
    );
    assert!(bad_acc.is_err(), "Must reject invalid account_id in journal_lines");

    // 5. Test ON DELETE RESTRICT on Products referenced by inventory batches
    conn.execute(
        "INSERT INTO products (id, sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
         VALUES (7777, 'NC-RESTRICT-TEST', 'Restrict Product', 'Nextco', 'PET_PLASTIC', 30000, 40000, 1500);",
        [],
    ).unwrap();

    conn.execute(
        "INSERT INTO inventory_batches (product_id, batch_number, initial_base_units, remaining_base_units, unit_cost_paisa, pack_cost_paisa)
         VALUES (7777, 'BATCH-001', 100, 100, 1500, 30000);",
        [],
    ).unwrap();

    let delete_restricted = conn.execute("DELETE FROM products WHERE id = 7777;", []);
    assert!(
        delete_restricted.is_err(),
        "Deleting product with active inventory batches must be blocked by ON DELETE RESTRICT"
    );

    // 6. Test CHECK Constraint on Packaging Type
    let bad_packaging = conn.execute(
        "INSERT INTO products (sku_code, name, packaging_type) VALUES ('BAD-PACK', 'Bad', 'WOODEN_CRATE');",
        [],
    );
    assert!(bad_packaging.is_err(), "Must reject packaging_type not in CHECK enum");

    // 7. Test CHECK Constraint on Negative Amounts
    let neg_price = conn.execute(
        "INSERT INTO products (sku_code, name, packaging_type, purchase_price_pack_paisa) VALUES ('NEG-PRICE', 'Neg', 'CAN_ALU', -500);",
        [],
    );
    assert!(neg_price.is_err(), "Must reject negative purchase_price_pack_paisa");
}

// ============================================================================
// STRESS TEST 4: Trigger Stress — Cash Book & Audit Log Immutability
// ============================================================================
#[test]
fn stress_test_cash_book_and_audit_log_triggers() {
    let pool = setup_memory_pool();
    let conn = pool.get().expect("conn");

    // Seed a cash book entry
    conn.execute(
        "INSERT INTO cash_book (
            id, entry_date, transaction_type, particulars, cash_in_paisa, cash_out_paisa, running_balance_paisa, is_locked
         ) VALUES (5555, '2026-11-04', 'CASH_SALE', 'Cash sale', 500000, 0, 500000, 0);",
        [],
    ).unwrap();

    // 1. Direct DELETE on cash book must be BLOCKED by trg_prevent_delete_cash_book
    let delete_res = conn.execute("DELETE FROM cash_book WHERE id = 5555;", []);
    assert!(delete_res.is_err(), "Deleting cash book records must be blocked by trigger");
    let err_msg = delete_res.unwrap_err().to_string();
    assert!(
        err_msg.contains("Deletion Forbidden"),
        "Expected 'Deletion Forbidden' trigger error, got: {}",
        err_msg
    );

    // 2. Lock the cash book entry
    conn.execute("UPDATE cash_book SET is_locked = 1 WHERE id = 5555;", []).unwrap();

    // 3. Update locked cash book entry must be BLOCKED by trg_prevent_update_locked_cash_book
    let update_res = conn.execute("UPDATE cash_book SET cash_in_paisa = 999999 WHERE id = 5555;", []);
    assert!(update_res.is_err(), "Updating locked cash book record must be blocked");
    let err_msg = update_res.unwrap_err().to_string();
    assert!(
        err_msg.contains("Cannot modify cash book record on a locked accounting date"),
        "Expected locked date trigger error, got: {}",
        err_msg
    );

    // 4. Attempt to unlock cash book entry: must ALSO be BLOCKED!
    let unlock_attempt = conn.execute("UPDATE cash_book SET is_locked = 0 WHERE id = 5555;", []);
    assert!(unlock_attempt.is_err(), "Attempting to unlock cash book record must be blocked");

    // 5. Seed an audit log
    conn.execute(
        "INSERT INTO audit_logs (id, action, entity_type, entity_id, user_id, username)
         VALUES (4444, 'INVOICE_CREATE', 'sales_invoices', 'INV-001', 1, 'admin');",
        [],
    ).unwrap();

    // 6. Direct UPDATE on audit log must be BLOCKED by trg_prevent_update_audit_logs
    let update_audit = conn.execute("UPDATE audit_logs SET action = 'TAMPERED' WHERE id = 4444;", []);
    assert!(update_audit.is_err(), "Updating audit logs must be blocked");
    assert!(update_audit.unwrap_err().to_string().contains("Tamper Protection"));

    // 7. Direct DELETE on audit log must be BLOCKED by trg_prevent_delete_audit_logs
    let delete_audit = conn.execute("DELETE FROM audit_logs WHERE id = 4444;", []);
    assert!(delete_audit.is_err(), "Deleting audit logs must be blocked");
    assert!(delete_audit.unwrap_err().to_string().contains("Tamper Protection"));
}

// ============================================================================
// CHALLENGE TEST 5: Adversarial Trigger Vulnerability Challenge
// Testing potential bypasses in Sales Invoice Triggers & Daily Closings
// ============================================================================
#[test]
fn challenge_test_locked_sales_invoices_and_closings_vulnerabilities() {
    let pool = setup_memory_pool();
    let conn = pool.get().expect("conn");

    // Insert a test customer
    conn.execute(
        "INSERT OR REPLACE INTO customers (id, code, name, phone, address)
         VALUES (999, 'CUST-CHALLENGE', 'Challenge Customer', '03001112233', 'Main St');",
        [],
    ).unwrap();

    // Insert a sales invoice with is_locked = 1
    conn.execute(
        "INSERT INTO sales_invoices (
            id, invoice_number, customer_id, invoice_date, due_date,
            subtotal_paisa, net_total_paisa, due_amount_paisa, payment_type, is_locked
         ) VALUES (888, 'INV-LOCKED-001', 999, '2026-11-04', '2026-11-18', 1000000, 1000000, 1000000, 'CREDIT', 1);",
        [],
    ).unwrap();

    // 1. Normal modification while locked (both OLD and NEW are locked) -> BLOCKED
    let normal_mod = conn.execute("UPDATE sales_invoices SET net_total_paisa = 2000000 WHERE id = 888;", []);
    assert!(normal_mod.is_err(), "Normal update on locked sales invoice should be blocked");
    println!("[Challenge Verified] Normal update on locked sales invoice correctly blocked: {}", normal_mod.unwrap_err());

    // 2. ADVERSARIAL BYPASS TEST: Can someone bypass trg_prevent_update_locked_sales_invoice
    // by passing `is_locked = 0` in the UPDATE statement?
    // Hardened trigger condition in schema.rs: `WHEN OLD.is_locked = 1`
    let bypass_attempt = conn.execute(
        "UPDATE sales_invoices SET net_total_paisa = 500, is_locked = 0 WHERE id = 888;",
        [],
    );
    assert!(bypass_attempt.is_err(), "Trigger must prevent modifying or unlocking locked sales invoices");
    let bypass_err = bypass_attempt.unwrap_err().to_string();
    assert!(bypass_err.contains("Cannot modify a sales invoice on a locked accounting date"));

    let invoice_net: i64 = conn.query_row(
        "SELECT net_total_paisa FROM sales_invoices WHERE id = 888;",
        [],
        |r| r.get(0),
    ).unwrap();
    let invoice_locked: i32 = conn.query_row(
        "SELECT is_locked FROM sales_invoices WHERE id = 888;",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(invoice_net, 1000000, "net_total_paisa must remain intact");
    assert_eq!(invoice_locked, 1, "is_locked must remain 1");

    // 3. ADVERSARIAL DELETION TEST: Can someone DELETE a locked sales invoice?
    let delete_attempt = conn.execute("DELETE FROM sales_invoices WHERE id = 888;", []);
    assert!(delete_attempt.is_err(), "Trigger must prevent deleting locked sales invoices");
    let del_err = delete_attempt.unwrap_err().to_string();
    assert!(del_err.contains("Cannot delete a sales invoice on a locked accounting date"));

    let invoice_count: i64 = conn.query_row(
        "SELECT count(*) FROM sales_invoices WHERE id = 888;",
        [],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(invoice_count, 1, "Locked invoice must not be deleted");

    // 4. DAILY CLOSINGS IMMUTABILITY TEST:
    // Insert a locked daily closing record
    conn.execute(
        "INSERT INTO daily_closings (
            id, closing_date, opening_cash_paisa, total_cash_in_paisa, total_cash_out_paisa,
            expected_closing_cash_paisa, physical_closing_cash_paisa, variance_paisa, status, is_locked
         ) VALUES (777, '2026-11-04', 100000, 500000, 200000, 400000, 400000, 0, 'LOCKED', 1);",
        [],
    ).unwrap();

    let closing_mod = conn.execute("UPDATE daily_closings SET physical_closing_cash_paisa = 9999999 WHERE id = 777;", []);
    assert!(closing_mod.is_err(), "Trigger must prevent modifying locked daily closing record");
    let mod_err = closing_mod.unwrap_err().to_string();
    assert!(mod_err.contains("Cannot modify a finalized daily closing record"));

    let closing_del = conn.execute("DELETE FROM daily_closings WHERE id = 777;", []);
    assert!(closing_del.is_err(), "Trigger must prevent deleting locked daily closing record");
    let del_close_err = closing_del.unwrap_err().to_string();
    assert!(del_close_err.contains("Cannot delete a finalized daily closing record"));

    println!(
        "[Hardened Verification Complete] Successfully verified that modifying/unlocking/deleting locked invoices and daily closings is strictly rejected."
    );
}

// ============================================================================
// STRESS TEST 6: Transaction Rollback Stress — Multi-Table Atomic Rollback
// ============================================================================
#[test]
fn stress_test_multi_table_transaction_rollback_and_connection_health() {
    let pool = setup_memory_pool();

    // 1. Execute complex multi-table transaction that fails at step 5
    let failed_tx = execute_transaction(&pool, |conn| {
        // Step 1: Customer
        conn.execute(
            "INSERT INTO customers (id, code, name, phone, address) VALUES (333, 'CUST-ROLL', 'Rollback Cust', '0300', 'Addr');",
            [],
        )?;

        // Step 2: Sales Invoice
        conn.execute(
            "INSERT INTO sales_invoices (id, invoice_number, customer_id, invoice_date, due_date, subtotal_paisa, net_total_paisa, due_amount_paisa, payment_type)
             VALUES (333, 'INV-ROLL-001', 333, '2026-11-04', '2026-11-18', 500000, 500000, 500000, 'CREDIT');",
            [],
        )?;

        // Step 3: Journal Entry
        conn.execute(
            "INSERT INTO journal_entries (id, entry_number, entry_date, entry_type, description, total_debit_paisa, total_credit_paisa, is_balanced)
             VALUES (333, 'JV-ROLL-001', '2026-11-04', 'SALES_INVOICE', 'Sale jv', 500000, 500000, 1);",
            [],
        )?;

        // Step 4: Intentional failure — violated foreign key on journal_lines
        conn.execute(
            "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa)
             VALUES (333, 999999, 500000, 0);", // 999999 does not exist!
            [],
        )?;

        Ok(())
    });

    assert!(failed_tx.is_err(), "Multi-table transaction must fail on foreign key violation");

    // 2. Verify complete atomicity: NONE of the records in steps 1-3 exist
    let conn = pool.get().expect("conn");
    let cust_count: i64 = conn.query_row("SELECT COUNT(*) FROM customers WHERE id = 333;", [], |r| r.get(0)).unwrap();
    let inv_count: i64 = conn.query_row("SELECT COUNT(*) FROM sales_invoices WHERE id = 333;", [], |r| r.get(0)).unwrap();
    let jv_count: i64 = conn.query_row("SELECT COUNT(*) FROM journal_entries WHERE id = 333;", [], |r| r.get(0)).unwrap();

    assert_eq!(cust_count, 0, "Customer must have been rolled back cleanly");
    assert_eq!(inv_count, 0, "Invoice must have been rolled back cleanly");
    assert_eq!(jv_count, 0, "Journal entry must have been rolled back cleanly");
    drop(conn);

    // 3. Verify Connection Pool Health: subsequent transaction must succeed immediately
    let healthy_tx = execute_transaction(&pool, |conn| {
        conn.execute(
            "INSERT INTO customers (id, code, name, phone, address) VALUES (334, 'CUST-CLEAN', 'Clean Cust', '0300', 'Addr');",
            [],
        )?;
        Ok(())
    });
    assert!(healthy_tx.is_ok(), "Subsequent transaction after rollback must succeed");

    let conn = pool.get().expect("conn");
    let clean_cust: i64 = conn.query_row("SELECT COUNT(*) FROM customers WHERE id = 334;", [], |r| r.get(0)).unwrap();
    assert_eq!(clean_cust, 1, "Clean customer committed successfully");
}

// ============================================================================
// STRESS TEST 7: High Iteration Rapid-Fire Rollback & Commit Cycling
// ============================================================================
#[test]
fn stress_test_rapid_rollback_and_commit_cycles() {
    let pool = setup_memory_pool();

    // Alternate between 30 failing transactions and 30 succeeding transactions
    for cycle in 0..30 {
        // Rollback cycle
        let _: Result<(), AppError> = execute_transaction(&pool, |conn| {
            conn.execute(
                "INSERT INTO customers (code, name, phone, address) VALUES (?1, 'Doomed Cust', '0300', 'Addr');",
                params![format!("CUST-DOOM-{}", cycle)],
            )?;
            // Force error
            Err(AppError::Validation("Intentional rollback test error".into()))
        });

        // Commit cycle
        let success = execute_transaction(&pool, |conn| {
            conn.execute(
                "INSERT INTO customers (code, name, phone, address) VALUES (?1, 'Saved Cust', '0300', 'Addr');",
                params![format!("CUST-SAVED-{}", cycle)],
            )?;
            Ok(())
        });
        assert!(success.is_ok(), "Commit cycle {} failed: {:?}", cycle, success);
    }

    let conn = pool.get().expect("conn");
    let doomed_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM customers WHERE code LIKE 'CUST-DOOM-%';",
        [],
        |r| r.get(0),
    ).unwrap();
    let saved_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM customers WHERE code LIKE 'CUST-SAVED-%';",
        [],
        |r| r.get(0),
    ).unwrap();

    assert_eq!(doomed_count, 0, "Zero doomed customers should exist");
    assert_eq!(saved_count, 30, "Exactly 30 saved customers should exist");
}
