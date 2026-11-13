use std::sync::Arc;
use std::thread;
use std::time::Duration;
use rusqlite::params;
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::db::pool::{create_db_pool, create_in_memory_pool, DbPool};
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::services::inventory::*;

/// Helper to initialize a file-backed pool with all migrations applied
fn setup_file_pool(dir: &tempfile::TempDir, name: &str) -> (DbPool, std::path::PathBuf) {
    let db_path = dir.path().join(name);
    let pool = create_db_pool(&db_path).expect("Failed to create file pool");
    {
        let mut conn = pool.get().expect("Failed to get connection for migration");
        run_migrations(&mut conn).expect("Failed to run migrations");
    }
    (pool, db_path)
}

/// Helper to initialize an in-memory pool with all migrations applied
fn setup_memory_pool() -> DbPool {
    let pool = create_in_memory_pool().expect("Failed to create memory pool");
    {
        let mut conn = pool.get().expect("Failed to get connection for migration");
        run_migrations(&mut conn).expect("Failed to run migrations");
    }
    pool
}

// ============================================================================
// CHALLENGE 1: Packaging Math Boundary Conditions (0 Packs, 0 Loose, 0 Units/Pack)
// ============================================================================
#[test]
fn challenge_packaging_math_boundary_conditions() {
    let pool = setup_memory_pool();
    let conn = pool.get().expect("Pool conn");

    // Case 1A: 0 packs, 0 loose units must produce exactly 0 base units
    let res_0_0 = pack_to_base_math(24, 0, 0);
    assert_eq!(res_0_0.unwrap(), 0, "0 packs + 0 loose must yield 0 base units");

    // Case 1B: 0 packs, loose units > 0
    let res_0_loose = pack_to_base_math(24, 0, 17);
    assert_eq!(res_0_loose.unwrap(), 17, "0 packs + 17 loose must yield 17 base units");

    // Case 1C: Packs > 0, 0 loose units
    let res_packs_0 = pack_to_base_math(24, 15, 0);
    assert_eq!(res_packs_0.unwrap(), 360, "15 packs + 0 loose @ 24 must yield 360 base units");

    // Case 1D: Invalid units_per_pack <= 0 must be rejected
    let err_zero_pack = pack_to_base_math(0, 10, 5);
    assert!(err_zero_pack.is_err(), "units_per_pack = 0 must fail");
    match err_zero_pack {
        Err(AppError::Validation(msg)) => assert!(msg.contains("must be > 0")),
        _ => panic!("Expected Validation error for units_per_pack = 0"),
    }

    let err_neg_pack = pack_to_base_math(-12, 10, 5);
    assert!(err_neg_pack.is_err(), "units_per_pack < 0 must fail");

    // Case 1E: Base to pack decomposition for 0 base units
    let (packs_0, loose_0, text_0) = base_to_pack_math(24, 0, "Crate", "Bottle").unwrap();
    assert_eq!(packs_0, 0);
    assert_eq!(loose_0, 0);
    assert_eq!(text_0, "0 Crates, 0 Bottles");

    // Case 1F: Base to pack with invalid units_per_pack <= 0
    let err_decomp_zero = base_to_pack_math(0, 100, "Crate", "Bottle");
    assert!(err_decomp_zero.is_err(), "units_per_pack = 0 in decomposition must fail");

    // Case 1G: Database-driven convert_pack_to_base for 0,0 boundary
    let p1_db_0 = InventoryService::convert_pack_to_base(&conn, 1, 0, 0).expect("DB conversion 0,0");
    assert_eq!(p1_db_0.total_base_units, 0);
    assert!(p1_db_0.formula_applied.contains("(0 × 24) + 0 = 0"));

    // Case 1H: Database-driven convert_base_to_pack for 0 boundary
    let p1_decomp_0 = InventoryService::convert_base_to_pack(&conn, 1, 0).expect("DB decomp 0");
    assert_eq!(p1_decomp_0.packs, 0);
    assert_eq!(p1_decomp_0.loose, 0);
    assert_eq!(p1_decomp_0.display_text, "0 Crates, 0 Bottles");
}

// ============================================================================
// CHALLENGE 2: Packaging Math Negative Quantity Inputs Rejection
// ============================================================================
#[test]
fn challenge_packaging_math_negative_inputs_rejection() {
    let pool = setup_memory_pool();
    let conn = pool.get().expect("Pool conn");

    // 1. Negative pack quantity
    let err_neg_pack = pack_to_base_math(24, -1, 10);
    assert!(err_neg_pack.is_err(), "Negative pack_qty must be rejected");
    match err_neg_pack {
        Err(AppError::Validation(msg)) => assert!(msg.contains("cannot be negative")),
        _ => panic!("Expected Validation error"),
    }

    // 2. Negative loose quantity
    let err_neg_loose = pack_to_base_math(24, 5, -3);
    assert!(err_neg_loose.is_err(), "Negative loose_qty must be rejected");
    match err_neg_loose {
        Err(AppError::Validation(msg)) => assert!(msg.contains("cannot be negative")),
        _ => panic!("Expected Validation error"),
    }

    // 3. Both negative
    let err_both_neg = pack_to_base_math(24, -10, -50);
    assert!(err_both_neg.is_err(), "Both negative quantities must be rejected");

    // 4. Decomposition negative base units
    let err_neg_base = base_to_pack_math(24, -1, "Crate", "Bottle");
    assert!(err_neg_base.is_err(), "Negative base_units must be rejected");
    match err_neg_base {
        Err(AppError::Validation(msg)) => assert!(msg.contains("cannot be negative")),
        _ => panic!("Expected Validation error"),
    }

    // 5. Database service layer negative conversions
    let db_neg_pack = InventoryService::convert_pack_to_base(&conn, 1, -5, 0);
    assert!(db_neg_pack.is_err(), "DB convert_pack_to_base must reject negative pack");

    let db_neg_loose = InventoryService::convert_pack_to_base(&conn, 1, 0, -12);
    assert!(db_neg_loose.is_err(), "DB convert_pack_to_base must reject negative loose");

    let db_neg_base = InventoryService::convert_base_to_pack(&conn, 1, -100);
    assert!(db_neg_base.is_err(), "DB convert_base_to_pack must reject negative base units");
}

// ============================================================================
// CHALLENGE 3: Large Volume Conversions & 64-Bit Arithmetic Overflow Protection
// ============================================================================
#[test]
fn challenge_packaging_math_large_volume_and_overflow() {
    let pool = setup_memory_pool();
    let conn = pool.get().expect("Pool conn");

    // 1. High volume wholesale conversions: 100,000 cartons of 24 bottles
    let res_100k = pack_to_base_math(24, 100_000, 0).expect("100,000 cartons must convert cleanly");
    assert_eq!(res_100k, 2_400_000, "100,000 * 24 = 2,400,000 base bottles");

    // 2. High volume mixed: 100,000 cartons + 19 loose bottles
    let res_100k_mixed = pack_to_base_math(24, 100_000, 19).expect("Mixed 100k must convert cleanly");
    assert_eq!(res_100k_mixed, 2_400_019);

    // 3. Huge multi-million volume: 10,000,000 cartons @ 24 = 240,000,000 base bottles
    let res_10m = pack_to_base_math(24, 10_000_000, 0).expect("10M cartons conversion");
    assert_eq!(res_10m, 240_000_000);

    // 4. Exact round-trip decomposition of large volume:
    let (packs, loose, display) = base_to_pack_math(24, 2_400_019, "Crate", "Bottle").expect("Decomposition of 2.4M");
    assert_eq!(packs, 100_000);
    assert_eq!(loose, 19);
    assert_eq!(display, "100000 Crates, 19 Bottles");

    // 5. Database service layer large volume conversion:
    let db_100k = InventoryService::convert_pack_to_base(&conn, 1, 100_000, 15)
        .expect("DB conversion of 100,000 packs");
    assert_eq!(db_100k.total_base_units, 2_400_015);

    // 6. 64-Bit Arithmetic Overflow Stress Testing:
    // Max safe capacity: i64::MAX / 24 = 384,307,168,202,282,325 crates with 7 loose bottles
    let max_safe_crates: i64 = i64::MAX / 24;
    let max_safe_loose: i64 = i64::MAX % 24; // 7
    let max_base = pack_to_base_math(24, max_safe_crates, max_safe_loose)
        .expect("Reaching exactly i64::MAX must succeed");
    assert_eq!(max_base, i64::MAX, "Must match i64::MAX exactly");

    // Overflow by 1 bottle above i64::MAX must be cleanly trapped by checked_add
    let overflow_loose = pack_to_base_math(24, max_safe_crates, max_safe_loose + 1);
    assert!(overflow_loose.is_err(), "Addition overflow above i64::MAX must be trapped");
    match overflow_loose {
        Err(AppError::Validation(msg)) => assert!(msg.contains("overflow"), "Expected overflow error: {}", msg),
        _ => panic!("Expected Validation overflow error"),
    }

    // Multiplication overflow above i64::MAX must be cleanly trapped by checked_mul
    let overflow_pack = pack_to_base_math(24, i64::MAX, 0);
    assert!(overflow_pack.is_err(), "Multiplication overflow must be trapped");
    match overflow_pack {
        Err(AppError::Validation(msg)) => assert!(msg.contains("overflow"), "Expected overflow error: {}", msg),
        _ => panic!("Expected Validation overflow error"),
    }

    // Extreme decomposition at i64::MAX:
    let (decomp_packs, decomp_loose, _) = base_to_pack_math(24, i64::MAX, "Crate", "Bottle")
        .expect("Decomposition at i64::MAX must succeed without overflow");
    assert_eq!(decomp_packs, max_safe_crates);
    assert_eq!(decomp_loose, max_safe_loose);
}

// ============================================================================
// CHALLENGE 4: Decomposition Text Formatting Across Products & Quantities
// ============================================================================
#[test]
fn challenge_decomposition_text_formatting() {
    let pool = setup_memory_pool();
    let conn = pool.get().expect("Pool conn");

    // Format tests for different unit amounts
    let cases = vec![
        (0, "0 Crates, 0 Bottles"),
        (1, "0 Crates, 1 Bottles"),
        (23, "0 Crates, 23 Bottles"),
        (24, "1 Crates, 0 Bottles"),
        (25, "1 Crates, 1 Bottles"),
        (47, "1 Crates, 23 Bottles"),
        (48, "2 Crates, 0 Bottles"),
        (530, "22 Crates, 2 Bottles"),
        (24000, "1000 Crates, 0 Bottles"),
    ];

    for (units, expected_text) in cases {
        let (_, _, display) = base_to_pack_math(24, units, "Crate", "Bottle").unwrap();
        assert_eq!(display, expected_text, "Failed for units = {}", units);
    }

    // Direct decomposition math across different packaging unit names:
    let (c_packs, c_loose, c_text) = base_to_pack_math(6, 27, "Carton", "Bottle").unwrap();
    assert_eq!(c_packs, 4);
    assert_eq!(c_loose, 3);
    assert_eq!(c_text, "4 Cartons, 3 Bottles");

    let (t_packs, t_loose, t_text) = base_to_pack_math(24, 50, "Tray", "Can").unwrap();
    assert_eq!(t_packs, 2);
    assert_eq!(t_loose, 2);
    assert_eq!(t_text, "2 Trays, 2 Cans");

    // Database-driven decomposition for Product 2 (6 bottles/pack):
    // Note: products.pack_unit_name in schema defaults to 'Crate' when not explicitly seeded
    let p2_decomp = InventoryService::convert_base_to_pack(&conn, 2, 27).unwrap();
    assert_eq!(p2_decomp.packs, 4);
    assert_eq!(p2_decomp.loose, 3);
    assert_eq!(p2_decomp.display_text, format!("4 {}s, 3 Bottles", p2_decomp.pack_unit_name));
}

// ============================================================================
// CHALLENGE 5: Stock Overdraft Boundary Conditions & Atomic Rollback
// ============================================================================
#[test]
fn challenge_stock_overdraft_boundary_conditions_and_rollback() {
    let pool = setup_memory_pool();
    let mut conn = pool.get().expect("Pool conn");

    let initial_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
        .expect("Query initial stock");
    assert_eq!(initial_stock, 12000);

    // Initial movement count should be 0
    let initial_movements: i64 = conn
        .query_row("SELECT COUNT(*) FROM stock_movements WHERE product_id = 1;", [], |r| r.get(0))
        .expect("Query movements");
    assert_eq!(initial_movements, 0);

    // 1. Boundary overdraft: Attempt to decrement 12,001 units (1 unit above available stock)
    let overdraft_res = InventoryService::adjust_stock(
        &mut conn,
        AdjustStockDto {
            product_id: 1,
            delta_base_units: -12001,
            reason: "Boundary Overdraft Test".to_string(),
            notes: Some("Should fail atomically".to_string()),
            user_id: Some(1),
        },
    );

    assert!(overdraft_res.is_err(), "Must reject decrement exceeding available stock");
    match overdraft_res {
        Err(AppError::InsufficientStock { product_id, requested_base, available_base }) => {
            assert_eq!(product_id, 1);
            assert_eq!(requested_base, 12001);
            assert_eq!(available_base, 12000);
        }
        _ => panic!("Expected InsufficientStock error"),
    }

    // VERIFY ATOMIC ROLLBACK:
    // A. Product stock must remain 12,000
    let stock_after_fail: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
        .expect("Query stock");
    assert_eq!(stock_after_fail, 12000, "Stock must remain intact after overdraft");

    // B. No orphaned movement inserted in stock_movements
    let movements_after_fail: i64 = conn
        .query_row("SELECT COUNT(*) FROM stock_movements WHERE product_id = 1;", [], |r| r.get(0))
        .expect("Query movements");
    assert_eq!(movements_after_fail, 0, "No stock_movements row should be created on rollback");

    // C. Location balance must remain 12,000 (location_id = 1)
    let loc_bal: i64 = conn
        .query_row("SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = 1;", [], |r| r.get(0))
        .unwrap_or(12000);
    assert_eq!(loc_bal, 12000, "Location balance must remain intact");

    // 2. Exact depletion to 0: Decrement exactly 12,000 units
    let drain_res = InventoryService::adjust_stock(
        &mut conn,
        AdjustStockDto {
            product_id: 1,
            delta_base_units: -12000,
            reason: "Drain Stock to Zero".to_string(),
            notes: None,
            user_id: Some(1),
        },
    ).expect("Draining stock exactly to zero must succeed");
    assert_eq!(drain_res.new_stock_base_units, 0);

    let stock_at_zero: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
        .expect("Query stock");
    assert_eq!(stock_at_zero, 0);

    // 3. Overdraft from 0: Attempt to decrement 1 unit when stock is 0
    let zero_overdraft = InventoryService::adjust_stock(
        &mut conn,
        AdjustStockDto {
            product_id: 1,
            delta_base_units: -1,
            reason: "Overdraft from 0".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(zero_overdraft.is_err(), "Must reject decrement from zero stock");
    match zero_overdraft {
        Err(AppError::InsufficientStock { product_id, requested_base, available_base }) => {
            assert_eq!(product_id, 1);
            assert_eq!(requested_base, 1);
            assert_eq!(available_base, 0);
        }
        _ => panic!("Expected InsufficientStock error"),
    }

    // 4. Stock recovery: Add 500 units back
    let restock = InventoryService::adjust_stock(
        &mut conn,
        AdjustStockDto {
            product_id: 1,
            delta_base_units: 500,
            reason: "Restock".to_string(),
            notes: None,
            user_id: Some(1),
        },
    ).expect("Restock should succeed");
    assert_eq!(restock.new_stock_base_units, 500);

    // 5. Non-existent product ID rejection
    let non_existent = InventoryService::adjust_stock(
        &mut conn,
        AdjustStockDto {
            product_id: 99999,
            delta_base_units: -10,
            reason: "Ghost Product".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(non_existent.is_err(), "Non-existent product ID must return NotFound error");
}

// ============================================================================
// CHALLENGE 6: Concurrent Multi-Threaded Decrements Under Heavy Overdraft Contention
// ============================================================================
#[test]
fn challenge_concurrent_decrements_under_heavy_overdraft_contention() {
    let temp_dir = tempfile::tempdir().expect("Create temp dir");
    let (pool, _path) = setup_file_pool(&temp_dir, "concurrent_overdraft.db");

    // Set product 1 stock to exactly 500 base bottles
    {
        let conn = pool.get().expect("Conn");
        conn.execute("UPDATE products SET current_stock_base_units = 500, stock_base_units = 500 WHERE id = 1;", [])
            .expect("Set stock to 500");
        conn.execute("INSERT OR REPLACE INTO product_location_balances (product_id, location_id, balance_base_units) VALUES (1, 1, 500);", [])
            .expect("Set loc bal to 500");
    }

    let initial_stock: i64 = {
        let conn = pool.get().expect("Conn");
        conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
            .expect("Get stock")
    };
    assert_eq!(initial_stock, 500);

    let pool_arc = Arc::new(pool);
    let num_threads = 20;
    let units_per_decrement = 40;
    // Total attempted decrements = 20 threads * 40 units = 800 units!
    // Since available stock is only 500 units, exactly 12 threads can succeed (12 * 40 = 480 units, leaving 20).
    // The 13th thread (needs 40, only 20 left) and all subsequent threads MUST receive AppError::InsufficientStock!

    let mut handles = vec![];

    for i in 0..num_threads {
        let pool_clone = Arc::clone(&pool_arc);
        handles.push(thread::spawn(move || {
            let mut conn = pool_clone.get().expect("Thread get conn");
            let mut retries = 0;
            loop {
                let res = InventoryService::adjust_stock(
                    &mut conn,
                    AdjustStockDto {
                        product_id: 1,
                        delta_base_units: -units_per_decrement,
                        reason: format!("Contention Thread {}", i),
                        notes: None,
                        user_id: Some(1),
                    },
                );

                match res {
                    Ok(_) => return Ok(()),
                    Err(AppError::InsufficientStock { .. }) => {
                        // Deterministic overdraft rejection
                        return Err("INSUFFICIENT_STOCK".to_string());
                    }
                    Err(AppError::Database(ref db_err)) if db_err.contains("busy") || db_err.contains("locked") => {
                        if retries > 30 {
                            return Err(format!("BUSY_TIMEOUT: {}", db_err));
                        }
                        retries += 1;
                        thread::sleep(Duration::from_millis(20 + (i * 3) as u64));
                    }
                    Err(other) => {
                        return Err(format!("UNEXPECTED_ERROR: {:?}", other));
                    }
                }
            }
        }));
    }

    let mut successes = 0;
    let mut overdraft_rejections = 0;

    for handle in handles {
        let outcome = handle.join().expect("Thread joined");
        match outcome {
            Ok(()) => successes += 1,
            Err(e) if e == "INSUFFICIENT_STOCK" => overdraft_rejections += 1,
            Err(other) => panic!("Unexpected thread outcome: {}", other),
        }
    }

    println!(
        "[Contention Result] Total Threads: {}, Succeeded: {}, Overdraft Rejections: {}",
        num_threads, successes, overdraft_rejections
    );

    // Verify invariants:
    // 1. Successes * 40 <= 500 (Can never exceed 500!)
    let total_decremented = (successes as i64) * units_per_decrement;
    assert!(
        total_decremented <= 500,
        "Total decremented ({}) must NEVER exceed initial stock (500)!",
        total_decremented
    );

    // 2. Exact expected values: 500 / 40 = 12 successes, 8 rejections
    assert_eq!(successes, 12, "Exactly 12 threads should have succeeded (12 * 40 = 480)");
    assert_eq!(overdraft_rejections, 8, "Exactly 8 threads should have been rejected for insufficient stock");

    // 3. Database final state verification
    let conn = pool_arc.get().expect("Conn");
    let final_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
        .expect("Get stock");
    assert_eq!(final_stock, 500 - 480, "Final stock must be exactly 20");
    assert!(final_stock >= 0, "Stock must never be negative!");

    // 4. product_location_balances must match products current stock
    let loc_bal: i64 = conn
        .query_row("SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = 1;", [], |r| r.get(0))
        .expect("Get loc bal");
    assert_eq!(loc_bal, final_stock, "Location balance must match product stock");

    // 5. stock_movements count must equal successes
    let mov_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM stock_movements WHERE product_id = 1 AND notes LIKE 'Contention Thread%';", [], |r| r.get(0))
        .expect("Get movements");
    assert_eq!(mov_count, successes as i64, "Movement count must match successful transactions");
}

// ============================================================================
// CHALLENGE 7: Breakage Overdraft Protection & Multi-Table Rollback
// ============================================================================
#[test]
fn challenge_breakage_overdraft_protection_and_rollback() {
    let pool = setup_memory_pool();
    let mut conn = pool.get().expect("Pool conn");

    let initial_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
        .expect("Stock");
    assert_eq!(initial_stock, 12000);

    // 1. Breakage with negative units must be rejected
    let neg_brk = InventoryService::record_breakage(
        &mut conn,
        RecordBreakageDto {
            product_id: 1,
            broken_base_units: -5,
            cause: "Negative Breakage".to_string(),
            incident_location: "Warehouse".to_string(),
            responsible_person: None,
            action_taken: "EXPENSE".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(neg_brk.is_err(), "Negative broken_base_units must be rejected");

    // 2. Breakage with 0 units must be rejected
    let zero_brk = InventoryService::record_breakage(
        &mut conn,
        RecordBreakageDto {
            product_id: 1,
            broken_base_units: 0,
            cause: "Zero Breakage".to_string(),
            incident_location: "Warehouse".to_string(),
            responsible_person: None,
            action_taken: "EXPENSE".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(zero_brk.is_err(), "Zero broken_base_units must be rejected");

    // 3. Breakage exceeding available stock (12,001 on 12,000)
    let overdraft_brk = InventoryService::record_breakage(
        &mut conn,
        RecordBreakageDto {
            product_id: 1,
            broken_base_units: 12001,
            cause: "Total Loss Incident".to_string(),
            incident_location: "Transit Route".to_string(),
            responsible_person: None,
            action_taken: "EXPENSE".to_string(),
            notes: None,
            user_id: Some(1),
        },
    );
    assert!(overdraft_brk.is_err(), "Breakage exceeding stock must be rejected");
    match overdraft_brk {
        Err(AppError::InsufficientStock { product_id, requested_base, available_base }) => {
            assert_eq!(product_id, 1);
            assert_eq!(requested_base, 12001);
            assert_eq!(available_base, 12000);
        }
        _ => panic!("Expected InsufficientStock error"),
    }

    // 4. Verify complete rollback across products, breakage_logs, and journal_entries
    let stock_after: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0))
        .expect("Stock");
    assert_eq!(stock_after, 12000, "Stock must remain intact after failed breakage");

    let brk_logs_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM breakage_logs WHERE product_id = 1;", [], |r| r.get(0))
        .expect("Brk logs");
    assert_eq!(brk_logs_count, 0, "No breakage log must be recorded on failed transaction");

    let je_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM journal_entries WHERE reference_doc_type = 'BREAKAGE';", [], |r| r.get(0))
        .expect("Journal entries");
    assert_eq!(je_count, 0, "No journal entry must be recorded on failed transaction");
}

// ============================================================================
// CHALLENGE 8: Concurrent Mixed Transactions (Stock Decrements + Empty Crates)
// ============================================================================
#[test]
fn challenge_concurrent_mixed_stock_and_crate_operations() {
    let temp_dir = tempfile::tempdir().expect("Create temp dir");
    let (pool, _path) = setup_file_pool(&temp_dir, "concurrent_mixed.db");

    let initial_stock: i64 = {
        let conn = pool.get().expect("Conn");
        conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0)).unwrap()
    };
    let initial_crates: i64 = {
        let conn = pool.get().expect("Conn");
        conn.query_row("SELECT empty_crates_stock FROM products WHERE id = 1;", [], |r| r.get(0)).unwrap()
    };

    let pool_arc = Arc::new(pool);
    let mut handles = vec![];

    // 5 threads doing stock decrements of 100 units each (total = 500 units)
    for i in 0..5 {
        let p = Arc::clone(&pool_arc);
        handles.push(thread::spawn(move || {
            let mut conn = p.get().unwrap();
            for _ in 0..30 {
                let res = InventoryService::adjust_stock(
                    &mut conn,
                    AdjustStockDto {
                        product_id: 1,
                        delta_base_units: -100,
                        reason: format!("Stock Dec Thread {}", i),
                        notes: None,
                        user_id: Some(1),
                    },
                );
                if res.is_ok() {
                    return;
                }
                thread::sleep(Duration::from_millis(25));
            }
            panic!("Stock dec thread {} timed out", i);
        }));
    }

    // 5 threads doing crate circulations (Customer 1 issues 10 crates)
    for i in 0..5 {
        let p = Arc::clone(&pool_arc);
        handles.push(thread::spawn(move || {
            let mut conn = p.get().unwrap();
            for _ in 0..30 {
                let res = InventoryService::record_crate_transaction(
                    &mut conn,
                    RecordCrateTransactionDto {
                        customer_id: 1,
                        crates_out: 10,
                        crates_in: 0,
                        voucher_ref: format!("CONC-CRT-{}", i),
                        date: Some("2026-11-04".to_string()),
                        deposit_paid_paisa: None,
                        deposit_refunded_paisa: None,
                        notes: None,
                        user_id: Some(1),
                    },
                );
                if res.is_ok() {
                    return;
                }
                thread::sleep(Duration::from_millis(25));
            }
            panic!("Crate thread {} timed out", i);
        }));
    }

    for handle in handles {
        handle.join().expect("Thread joined successfully");
    }

    let conn = pool_arc.get().unwrap();
    let final_stock: i64 = conn.query_row("SELECT current_stock_base_units FROM products WHERE id = 1;", [], |r| r.get(0)).unwrap();
    let final_crates: i64 = conn.query_row("SELECT empty_crates_stock FROM products WHERE id = 1;", [], |r| r.get(0)).unwrap();

    // 5 threads * 100 units = 500 units deducted
    assert_eq!(final_stock, initial_stock - 500, "Liquid stock must reflect exactly 500 units deducted");
    // 5 threads * 10 crates out = 50 warehouse crates deducted
    assert_eq!(final_crates, initial_crates - 50, "Warehouse crates must reflect exactly 50 crates issued");
}
