use std::sync::Arc;
use std::thread;
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::db::pool::{create_db_pool, create_in_memory_pool};
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::services::inventory::*;

/// Test 1: Unit Conversions & Zero-Drift Integer Math
#[test]
fn test_packaging_unit_conversions_exact_integer() {
    let pool = create_in_memory_pool().expect("Failed to initialize test pool");
    let mut conn = pool.get().expect("Failed to get connection");
    run_migrations(&mut conn).expect("Failed to run migrations");

    // Product 2: Next Cola 1.5L PET (6 bottles/pack)
    let p2_res = InventoryService::convert_pack_to_base(&conn, 2, 5, 0)
        .expect("Conversion should succeed");
    assert_eq!(p2_res.total_base_units, 30, "5 cartons * 6 bottles/carton = 30 base bottles");

    // Product 1: Next Cola 250ml Glass Bottle (24 bottles/crate)
    let p1_mixed = InventoryService::convert_pack_to_base(&conn, 1, 3, 7)
        .expect("Mixed conversion should succeed");
    assert_eq!(p1_mixed.total_base_units, 79, "3 crates * 24 + 7 loose = 79 base bottles");

    // Human-readable display: 530 bottles -> 22 Crates, 2 Bottles
    let display = InventoryService::convert_base_to_pack(&conn, 1, 530)
        .expect("Decomposition should succeed");
    assert_eq!(display.packs, 22);
    assert_eq!(display.loose, 2);
    assert_eq!(display.display_text, "22 Crates, 2 Bottles");

    // Negative validation: must fail with Validation error
    let neg_err = InventoryService::convert_pack_to_base(&conn, 1, -2, 5);
    assert!(neg_err.is_err(), "Negative pack quantity must be rejected");
    match neg_err {
        Err(AppError::Validation(msg)) => assert!(msg.contains("negative")),
        _ => panic!("Expected Validation error for negative quantity"),
    }
}

/// Test 2: Stock Balance Atomic Decrement & Insufficient Stock Prevention
#[test]
fn test_stock_balance_atomic_decrement_and_insufficient_stock() {
    let pool = create_in_memory_pool().expect("Failed to initialize test pool");
    let mut conn = pool.get().expect("Failed to get connection");
    run_migrations(&mut conn).expect("Failed to run migrations");

    // Product 1 initial stock is seeded as 12,000 base bottles
    let initial_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
        .expect("Query initial stock");
    assert_eq!(initial_stock, 12000);

    // Decrement 240 base units (10 crates)
    let adj1 = InventoryService::adjust_stock(
        &mut conn,
        AdjustStockDto {
            product_id: 1,
            delta_base_units: -240,
            reason: "Sale Dispatch".to_string(),
            notes: None,
            user_id: Some(1),
        },
    ).expect("Decrement should succeed");
    assert_eq!(adj1.new_stock_base_units, 11760);

    // Decrement 5 loose bottles
    let adj2 = InventoryService::adjust_stock(
        &mut conn,
        AdjustStockDto {
            product_id: 1,
            delta_base_units: -5,
            reason: "Loose Sale".to_string(),
            notes: None,
            user_id: Some(1),
        },
    ).expect("Decrement should succeed");
    assert_eq!(adj2.new_stock_base_units, 11755);

    // Attempt to decrement 20,000 units (exceeding stock of 11,755)
    let overdraft = InventoryService::adjust_stock(
        &mut conn,
        AdjustStockDto {
            product_id: 1,
            delta_base_units: -20000,
            reason: "Excessive decrement".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(overdraft.is_err(), "Must reject stock overdraft");
    match overdraft {
        Err(AppError::InsufficientStock { product_id, requested_base, available_base }) => {
            assert_eq!(product_id, 1);
            assert_eq!(requested_base, 20000);
            assert_eq!(available_base, 11755);
        }
        _ => panic!("Expected InsufficientStock error"),
    }

    // Verify stock remains untouched at 11,755
    let current_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
        .expect("Query stock");
    assert_eq!(current_stock, 11755, "Stock must remain intact after failed overdraft");
}

/// Test 3: Concurrent Stock Movements Integrity Under Parallel Load
#[test]
fn test_concurrent_stock_movements_integrity() {
    let temp_dir = tempfile::tempdir().expect("Create temp dir");
    let db_path = temp_dir.path().join("concurrent_inventory.db");
    let pool = create_db_pool(&db_path).expect("Create db pool");

    {
        let mut conn = pool.get().expect("Get setup connection");
        run_migrations(&mut conn).expect("Run migrations");
    }

    let initial_stock: i64 = {
        let conn = pool.get().expect("Get conn");
        conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
            .expect("Get stock")
    };

    let pool_arc = Arc::new(pool);
    let mut handles = vec![];
    let workers_count = 10;
    let units_per_worker = 50;

    // Spawn 10 concurrent threads each decrementing 50 base units
    for i in 0..workers_count {
        let pool_clone = Arc::clone(&pool_arc);
        handles.push(thread::spawn(move || {
            let mut conn = pool_clone.get().expect("Thread get conn");
            // Retry loop in case SQLite is busy during concurrent test writes
            let mut retries = 0;
            loop {
                let res = InventoryService::adjust_stock(
                    &mut conn,
                    AdjustStockDto {
                        product_id: 1,
                        delta_base_units: -units_per_worker,
                        reason: format!("Concurrent thread {}", i),
                        notes: None,
                        user_id: Some(1),
                    },
                );
                if res.is_ok() || retries > 10 {
                    return res;
                }
                retries += 1;
                thread::sleep(std::time::Duration::from_millis(50));
            }
        }));
    }

    let mut successful_decrements = 0;
    for handle in handles {
        let res = handle.join().expect("Thread joined");
        if res.is_ok() {
            successful_decrements += 1;
        }
    }

    assert_eq!(successful_decrements, workers_count, "All concurrent decrements must succeed");

    let final_stock: i64 = {
        let conn = pool_arc.get().expect("Get conn");
        conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
            .expect("Get stock")
    };

    let expected_final = initial_stock - (workers_count * units_per_worker);
    assert_eq!(final_stock, expected_final, "Final stock must exactly match sum of atomic decrements");
}

/// Test 4: Empty Crate Circulation Independent of Liquid Stock
#[test]
fn test_empty_crate_circulation_independent_of_liquid_stock() {
    let pool = create_in_memory_pool().expect("Initialize pool");
    let mut conn = pool.get().expect("Get connection");
    run_migrations(&mut conn).expect("Run migrations");

    let liquid_stock_before: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
        .expect("Liquid stock");
    let wh_crates_before: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1;", [], |r| r.get(0))
        .expect("WH crates stock");
    let cust_crate_bal_before: i64 = conn
        .query_row("SELECT current_crate_balance FROM customers WHERE id = 1;", [], |r| r.get(0))
        .expect("Cust crate balance");

    // 1. Issue 15 crates to Customer 1
    let res1 = InventoryService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 1,
            crates_out: 15,
            crates_in: 0,
            voucher_ref: "CRT-ISSUE-01".to_string(),
            date: Some("2026-11-04".to_string()),
            deposit_paid_paisa: None,
            deposit_refunded_paisa: None,
            notes: Some("Crates issued on delivery".to_string()),
            user_id: Some(1),
        },
    ).expect("Crate issuance should succeed");

    assert_eq!(res1.new_customer_crate_balance, cust_crate_bal_before + 15);

    // 2. Customer 1 returns 8 empty crates
    let res2 = InventoryService::record_crate_transaction(
        &mut conn,
        RecordCrateTransactionDto {
            customer_id: 1,
            crates_out: 0,
            crates_in: 8,
            voucher_ref: "CRT-RETURN-01".to_string(),
            date: Some("2026-11-04".to_string()),
            deposit_paid_paisa: None,
            deposit_refunded_paisa: None,
            notes: Some("Empties collected from shop".to_string()),
            user_id: Some(1),
        },
    ).expect("Crate return should succeed");

    assert_eq!(res2.new_customer_crate_balance, cust_crate_bal_before + 15 - 8);
    assert_eq!(res2.warehouse_empty_crates_stock, wh_crates_before + 8 - 15);

    // CRITICAL ACCEPTANCE INVARIANT: Liquid beverage stock MUST be 100% unchanged!
    let liquid_stock_after: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
        .expect("Liquid stock after");
    assert_eq!(liquid_stock_after, liquid_stock_before, "Liquid drink inventory must not change during crate circulation");
}

/// Test 5: Security Deposit Liability Accounting Isolation
#[test]
fn test_security_deposit_liability_accounting_isolation() {
    let pool = create_in_memory_pool().expect("Initialize pool");
    let mut conn = pool.get().expect("Get connection");
    run_migrations(&mut conn).expect("Run migrations");

    // Customer 2 deposits 2,500 PKR (10 crates @ 250 PKR = 250,000 Paisa)
    let dep_res = InventoryService::record_security_deposit(
        &mut conn,
        RecordSecurityDepositDto {
            customer_id: 2,
            crates_count: 10,
            deposit_rate_per_crate_paisa: 25000,
            payment_mode: "CASH".to_string(),
            notes: Some("Initial security deposit".to_string()),
            user_id: Some(1),
        },
    ).expect("Record deposit");

    assert_eq!(dep_res.amount_paisa, 250000);
    assert_eq!(dep_res.running_deposit_liability_paisa, 250000);

    // Verify Cash Book incremented by 250,000 Paisa
    let cash_in: i64 = conn
        .query_row("SELECT cash_in_paisa FROM cash_book WHERE voucher_ref_type = 'SECURITY_DEPOSIT' ORDER BY id DESC LIMIT 1;", [], |r| r.get(0))
        .expect("Query cash book");
    assert_eq!(cash_in, 250000);

    // Verify Operating Revenue (Account 4010, Acct ID 23) is ZERO
    let rev_credits: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(credit_paisa), 0) FROM journal_lines WHERE account_id = 23;", // Account 4010
            [],
            |r| r.get(0),
        ).unwrap_or(0);
    assert_eq!(rev_credits, 0, "Security deposit must NEVER be booked as sales revenue");

    // Refund deposit
    let ref_res = InventoryService::refund_security_deposit(
        &mut conn,
        RefundSecurityDepositDto {
            customer_id: 2,
            crates_count: 10,
            deposit_rate_per_crate_paisa: 25000,
            payment_mode: "CASH".to_string(),
            notes: Some("Crates returned, deposit refunded".to_string()),
            user_id: Some(1),
        },
    ).expect("Refund deposit");

    assert_eq!(ref_res.running_deposit_liability_paisa, 0);

    // Verify Cash Book decremented by 250,000 Paisa
    let cash_out: i64 = conn
        .query_row("SELECT cash_out_paisa FROM cash_book WHERE voucher_ref_type = 'DEPOSIT_REFUND' ORDER BY id DESC LIMIT 1;", [], |r| r.get(0))
        .expect("Query cash book refund");
    assert_eq!(cash_out, 250000);
}

/// Test 6: Breakage Logging and Operating Loss Deduction
#[test]
fn test_breakage_logging_and_operating_loss_deduction() {
    let pool = create_in_memory_pool().expect("Initialize pool");
    let mut conn = pool.get().expect("Get connection");
    run_migrations(&mut conn).expect("Run migrations");

    let stock_before: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
        .expect("Stock before");

    // Product 1: 180,000 Paisa / 24 = 7,500 Paisa (75.00 PKR) per bottle
    // Record breakage of 12 bottles in warehouse
    let brk_res = InventoryService::record_breakage(
        &mut conn,
        RecordBreakageDto {
            product_id: 1,
            broken_base_units: 12,
            cause: "Pallet Stacking Slip".to_string(),
            incident_location: "Warehouse Bay 2".to_string(),
            responsible_person: Some("Ghulam Abbas".to_string()),
            action_taken: "EXPENSE".to_string(),
            notes: Some("Stack collapsed during unloading".to_string()),
            user_id: Some(1),
        },
    ).expect("Breakage recording should succeed");

    assert_eq!(brk_res.unit_cost_paisa, 7500);
    assert_eq!(brk_res.total_loss_paisa, 12 * 7500); // 90,000 Paisa (900.00 PKR)
    assert_eq!(brk_res.remaining_stock_base_units, stock_before - 12);

    // Verify operating expense entry (Account 6050, Acct ID 34)
    let loss_exp: i64 = conn
        .query_row(
            "SELECT debit_paisa FROM journal_lines WHERE account_id = 34 ORDER BY id DESC LIMIT 1;", // Account 6050
            [],
            |r| r.get(0),
        ).unwrap_or(0);
    assert_eq!(loss_exp, 90000, "Breakage loss must post to Account 6050 Operating Expense");

    // Rejection of invalid breakage (exceeding stock)
    let invalid = InventoryService::record_breakage(
        &mut conn,
        RecordBreakageDto {
            product_id: 1,
            broken_base_units: 50000, // Exceeds stock
            cause: "Catastrophic loss".to_string(),
            incident_location: "Warehouse".to_string(),
            responsible_person: None,
            action_taken: "EXPENSE".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(invalid.is_err(), "Must reject breakage exceeding stock");
}
