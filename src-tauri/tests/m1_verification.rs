use std::path::Path;
use rusqlite::params;
use logar_pos_lib::db::backup::BackupService;
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::db::pool::{create_db_pool, create_in_memory_pool, execute_transaction};

#[test]
fn test_db_connection_and_wal_mode() {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let db_path = temp_dir.path().join("test_wal.db");
    let pool = create_db_pool(&db_path).expect("Failed to build test pool");
    let conn = pool.get().expect("Failed to obtain pooled connection");

    // Verify WAL Mode
    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode;", [], |r| r.get(0))
        .expect("Failed to query journal_mode");
    assert_eq!(journal_mode.to_lowercase(), "wal", "SQLite must operate in WAL journal mode");

    // Verify Foreign Keys
    let foreign_keys: i32 = conn
        .query_row("PRAGMA foreign_keys;", [], |r| r.get(0))
        .expect("Failed to query foreign_keys");
    assert_eq!(foreign_keys, 1, "Foreign keys must be enabled (PRAGMA foreign_keys = ON)");

    // Verify Synchronous
    let synchronous: i32 = conn
        .query_row("PRAGMA synchronous;", [], |r| r.get(0))
        .expect("Failed to query synchronous");
    assert_eq!(synchronous, 1, "PRAGMA synchronous must be NORMAL (1) for optimal WAL performance");

    // Verify Busy Timeout
    let busy_timeout: i32 = conn
        .query_row("PRAGMA busy_timeout;", [], |r| r.get(0))
        .expect("Failed to query busy_timeout");
    assert!(busy_timeout >= 5000, "PRAGMA busy_timeout must be >= 5000 ms");
}

#[test]
fn test_14_tables_creation_and_introspection() {
    let pool = create_in_memory_pool().expect("Failed to create in-memory pool");
    let mut conn = pool.get().expect("Failed to obtain connection");
    let applied = run_migrations(&mut conn).expect("Failed to execute migrations");
    assert!(!applied.is_empty(), "Migrations should have been applied");

    let expected_tables = vec![
        "products",
        "packaging_units",
        "customers",
        "suppliers",
        "delivery_routes",
        "delivery_sheets",
        "delivery_items",
        "sales_invoices",
        "sales_invoice_items",
        "purchase_invoices",
        "chart_of_accounts",
        "journal_entries",
        "journal_lines",
        "cash_book",
        "daily_closings",
        "app_settings",
        "users",
        "audit_logs",
    ];

    for table in expected_tables {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?1;",
                params![table],
                |r| r.get(0),
            )
            .unwrap_or(0);
        assert_eq!(count, 1, "Expected table '{}' must exist in sqlite_master", table);
    }
}

#[test]
fn test_foreign_key_constraints_enforced() {
    let pool = create_in_memory_pool().expect("Failed to create in-memory pool");
    let mut conn = pool.get().expect("Failed to obtain connection");
    run_migrations(&mut conn).expect("Failed to execute migrations");

    // Attempt to insert sales_invoices with a non-existent customer_id (9999)
    let result = conn.execute(
        "INSERT INTO sales_invoices (
            invoice_number, customer_id, invoice_date, due_date,
            subtotal_paisa, net_total_paisa, due_amount_paisa, payment_type
         ) VALUES ('INV-TEST-FK-001', 9999, '2026-11-02', '2026-11-16', 5000000, 5000000, 5000000, 'CREDIT');",
        [],
    );

    assert!(result.is_err(), "Inserting invoice with non-existent customer_id must fail Foreign Key constraint");
    let err_str = result.unwrap_err().to_string();
    assert!(
        err_str.contains("FOREIGN KEY constraint failed"),
        "Error must specify foreign key failure, got: {}",
        err_str
    );
}

#[test]
fn test_transaction_atomicity_and_rollback() {
    let pool = create_in_memory_pool().expect("Failed to create in-memory pool");
    let mut conn = pool.get().expect("Failed to obtain connection");
    run_migrations(&mut conn).expect("Failed to execute migrations");
    drop(conn);

    // 1. Successful transaction commit via execute_transaction
    let res = execute_transaction(&pool, |conn| {
        conn.execute(
            "INSERT INTO products (sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
             VALUES ('NC-TEST-ATOM-1', 'Test Cola Atom 1', 'Nextco', 'RGB_GLASS', 40000, 50000, 2500);",
            [],
        )?;
        Ok(())
    });
    assert!(res.is_ok(), "Commit transaction must succeed");

    let conn = pool.get().unwrap();
    let product_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM products WHERE sku_code = 'NC-TEST-ATOM-1';", [], |r| r.get(0))
        .expect("Failed to query product");
    assert_eq!(product_count, 1, "Committed product must be present");
    drop(conn);

    // 2. Transaction rollback on intentional failure
    let rollback_attempt = execute_transaction(&pool, |conn| {
        conn.execute(
            "INSERT INTO customers (code, name, phone, address) VALUES ('CUST-ATOM-FAIL', 'Atom Fail Customer', '03001234567', 'Main Bazar');",
            [],
        )?;
        // Intentional duplicate SKU error
        conn.execute(
            "INSERT INTO products (sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
             VALUES ('NC-TEST-ATOM-1', 'Duplicate SKU', 'Nextco', 'RGB_GLASS', 40000, 50000, 2500);",
            [],
        )?;
        Ok(())
    });

    assert!(rollback_attempt.is_err(), "Transaction must fail on duplicate SKU");

    // Verify customer was NOT inserted due to atomicity rollback
    let conn = pool.get().unwrap();
    let cust_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM customers WHERE code = 'CUST-ATOM-FAIL';", [], |r| r.get(0))
        .expect("Failed to query customers");
    assert_eq!(cust_count, 0, "Customer record must have been cleanly rolled back");
}

#[test]
fn test_hot_backup_and_restore_cycle() {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp dir");
    let live_db_path = temp_dir.path().join("live.db");
    let backup_file_path = temp_dir.path().join("backup_snapshot.db");

    let pool = create_db_pool(&live_db_path).expect("Failed to create live pool");
    {
        let mut conn = pool.get().expect("Failed to get connection");
        run_migrations(&mut conn).expect("Failed migrations");

        conn.execute(
            "INSERT INTO products (sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
             VALUES ('NC-TEST-HOT-1', 'Hot Backup Test Product', 'Nextco', 'PET_PLASTIC', 60000, 75000, 12500);",
            [],
        ).expect("Insert product failed");
    }

    // 2. Perform Hot Online Backup
    let meta = BackupService::create_live_backup(&pool, Some(backup_file_path.clone()))
        .expect("Hot backup failed");
    assert!(meta.size_bytes > 0, "Backup file size must be > 0");

    // Assert backup file exists and has valid SQLite header
    assert!(backup_file_path.exists(), "Backup file must exist on disk");
    assert!(BackupService::verify_sqlite_header(&backup_file_path).is_ok());

    // 3. Mutate live database post-backup
    {
        let conn = pool.get().expect("Open live conn");
        conn.execute(
            "INSERT INTO products (sku_code, name, brand, packaging_type, purchase_price_pack_paisa, wholesale_price_pack_paisa, retail_price_base_paisa)
             VALUES ('MUTANT-POST-BACKUP', 'Mutant Post Backup Product', 'Nextco', 'PET_PLASTIC', 45000, 55000, 4500);",
            [],
        ).expect("Insert mutant failed");
    }

    // 4. Restore: Online Backup from backup file into live database
    let safety_path = BackupService::restore_from_backup(&pool, &backup_file_path, &live_db_path)
        .expect("Restore failed");
    assert!(Path::new(&safety_path).exists(), "Safety pre-restore backup must exist");

    // 5. Verify restored state: NC-TEST-HOT-1 present, MUTANT-POST-BACKUP gone
    {
        let conn = pool.get().expect("Open live conn post restore");
        let orig_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM products WHERE sku_code = 'NC-TEST-HOT-1';", [], |r| r.get(0))
            .unwrap();
        let mutant_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM products WHERE sku_code = 'MUTANT-POST-BACKUP';", [], |r| r.get(0))
            .unwrap();

        assert_eq!(orig_count, 1, "Restored database must contain snapshot data");
        assert_eq!(mutant_count, 0, "Mutant post-backup data must be gone after restore");
    }
}

#[test]
fn test_strict_cash_book_isolation() {
    let pool = create_in_memory_pool().expect("Failed to create in-memory pool");
    let mut conn = pool.get().expect("Failed to get connection");
    run_migrations(&mut conn).expect("Failed migrations");

    // Clear any seeded cash book entries for clean test isolation
    conn.execute("DELETE FROM cash_book;", []).unwrap_or(0);

    // Insert Customer
    conn.execute(
        "INSERT OR REPLACE INTO customers (id, code, name, phone, address, current_balance_paisa)
         VALUES (9001, 'CUST-ISO-100', 'Bismillah Store Iso', '03001234567', 'Market', 0);",
        [],
    ).unwrap();

    // 1. Credit Sale of Rs. 50,000 (5_000_000 Paisas)
    // Invariant: Customer balance increases by 50,000; cash_book has ZERO entries!
    conn.execute(
        "INSERT INTO sales_invoices (
            id, invoice_number, customer_id, invoice_date, due_date,
            subtotal_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa, payment_type, status
         ) VALUES (9001, 'INV-ISO-001', 9001, '2026-11-02', '2026-11-16', 5000000, 5000000, 0, 5000000, 'CREDIT', 'UNPAID');",
        [],
    ).unwrap();

    conn.execute(
        "UPDATE customers SET current_balance_paisa = current_balance_paisa + 5000000 WHERE id = 9001;",
        [],
    ).unwrap();

    let cust_bal: i64 = conn
        .query_row("SELECT current_balance_paisa FROM customers WHERE id = 9001;", [], |r| r.get(0))
        .unwrap();
    assert_eq!(cust_bal, 5000000, "Customer balance must be 50,000 PKR (5_000_000 Paisas)");

    let cash_entries_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM cash_book;", [], |r| r.get(0))
        .unwrap();
    assert_eq!(cash_entries_count, 0, "Cash Book must have exactly 0 entries following a pure credit sale");

    // 2. Partial Cash Recovery of Rs. 20,000 (2_000_000 Paisas)
    // Invariant: Customer balance drops to 30,000 PKR; Cash book gets +20,000 PKR cash_in
    conn.execute(
        "UPDATE customers SET current_balance_paisa = current_balance_paisa - 2000000 WHERE id = 9001;",
        [],
    ).unwrap();

    conn.execute(
        "INSERT INTO cash_book (
            entry_date, transaction_type, voucher_ref_type, voucher_ref_id,
            account_id, particulars, cash_in_paisa, cash_out_paisa, running_balance_paisa
         ) VALUES ('2026-11-02', 'UDHAAR_RECOVERY', 'sales_invoices', 9001, 2, 'Recovery from Bismillah Store', 2000000, 0, 2000000);",
        [],
    ).unwrap();

    let updated_cust_bal: i64 = conn
        .query_row("SELECT current_balance_paisa FROM customers WHERE id = 9001;", [], |r| r.get(0))
        .unwrap();
    assert_eq!(updated_cust_bal, 3000000, "Remaining customer balance must be exactly 30,000 PKR");

    let cash_in_total: i64 = conn
        .query_row("SELECT SUM(cash_in_paisa) FROM cash_book;", [], |r| r.get(0))
        .unwrap();
    assert_eq!(cash_in_total, 2000000, "Cash book must show exactly 20,000 PKR collected in cash");
}

#[test]
fn test_app_settings_crud_and_validation() {
    let pool = create_in_memory_pool().expect("Failed to create in-memory pool");
    let mut conn = pool.get().expect("Failed to get connection");
    run_migrations(&mut conn).expect("Failed migrations");

    let agency_name: String = conn
        .query_row("SELECT agency_name FROM app_settings WHERE id = 1;", [], |r| r.get(0))
        .unwrap();
    assert!(agency_name.contains("Logar Traders"));

    // Update Settings
    conn.execute(
        "UPDATE app_settings SET phone = '+92 301 9998877', invoice_prefix = 'NEXTCO-' WHERE id = 1;",
        [],
    ).unwrap();

    let (new_phone, new_prefix): (String, String) = conn
        .query_row("SELECT phone, invoice_prefix FROM app_settings WHERE id = 1;", [], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .unwrap();
    assert_eq!(new_phone, "+92 301 9998877");
    assert_eq!(new_prefix, "NEXTCO-");
}
