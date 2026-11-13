use rusqlite::{params, Connection};
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::domain::dtos::*;
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::domain::models::PaymentType;
use logar_pos_lib::services::cancellations::{CancelInvoiceDto, CancellationService};
use logar_pos_lib::services::logistics::LogisticsService;
use logar_pos_lib::services::sales::{CreateSalesInvoiceDto, CreateSalesInvoiceItemDto, SalesService};
use logar_pos_lib::services::settlement::SettlementService;

/// Helper to spin up an isolated in-memory database with all migrations 001-007 applied.
fn setup_empirical_db() -> Connection {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite database");
    run_migrations(&mut conn).expect("Failed to apply schema migrations 001 through 007");
    conn
}

// ============================================================================
// 1. DRAFT ISOLATION INVARIANTS
// ============================================================================

#[test]
fn test_empirical_draft_isolation_invariants() {
    let mut conn = setup_empirical_db();

    // Query initial baseline states
    let initial_wh_p1: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    let initial_wh_p2: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 2", [], |r| r.get(0))
        .unwrap();
    let initial_wh_crates: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    let initial_movements: i64 = conn
        .query_row("SELECT COUNT(*) FROM stock_movements", [], |r| r.get(0))
        .unwrap();
    let initial_empties_ledger: i64 = conn
        .query_row("SELECT COUNT(*) FROM empties_ledger", [], |r| r.get(0))
        .unwrap();

    // Draft Sheet 1: Route 1, Van 1 (LES-2489)
    let sheet1 = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: Some("Rashid".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(50),
            items: vec![
                LoadingItemInput {
                    product_id: 1, // 250ml Glass (24/crate)
                    pack_qty: 100, // 2,400 bottles
                    loose_qty: 12,
                },
                LoadingItemInput {
                    product_id: 2, // 1.5L PET (6/pack)
                    pack_qty: 80,  // 480 bottles
                    loose_qty: 0,
                },
            ],
            notes: Some("Draft sheet 1 - morning planning".into()),
            created_by: Some(4),
        },
    )
    .expect("Draft sheet 1 must succeed");

    assert_eq!(sheet1.status, "DRAFT");

    // Draft Sheet 2: Route 2, Van 2 (LES-5512)
    let sheet2 = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 2,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(2),
            vehicle_number: Some("LES-5512".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: Some(89100),
            empty_crates_loaded: Some(40),
            items: vec![
                LoadingItemInput {
                    product_id: 1,
                    pack_qty: 150, // 3,600 bottles
                    loose_qty: 0,
                },
            ],
            notes: Some("Draft sheet 2 - highway run".into()),
            created_by: Some(4),
        },
    )
    .expect("Draft sheet 2 must succeed");

    assert_eq!(sheet2.status, "DRAFT");

    // EMPIRICAL ASSERTIONS: Absolute isolation while in DRAFT
    // 1. Warehouse master product stock must be strictly untouched
    let post_wh_p1: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    let post_wh_p2: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 2", [], |r| r.get(0))
        .unwrap();
    assert_eq!(post_wh_p1, initial_wh_p1, "Draft sheets must NEVER deduct warehouse product 1 stock");
    assert_eq!(post_wh_p2, initial_wh_p2, "Draft sheets must NEVER deduct warehouse product 2 stock");

    // 2. Location balances for Location 1 (Warehouse) must be untouched
    let wh_loc1_p1: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(wh_loc1_p1, initial_wh_p1, "LOC-WH-MAIN balance must not change on draft creation");

    // 3. Vehicle location balances (Locations 2 and 3) must NOT have received any stock
    let van1_stock: i64 = conn
        .query_row(
            "SELECT COALESCE(balance_base_units, 0) FROM product_location_balances WHERE product_id = 1 AND location_id = 2",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let van2_stock: i64 = conn
        .query_row(
            "SELECT COALESCE(balance_base_units, 0) FROM product_location_balances WHERE product_id = 1 AND location_id = 3",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    assert_eq!(van1_stock, 0, "LOC-VAN-01 must have 0 stock while sheet is DRAFT");
    assert_eq!(van2_stock, 0, "LOC-VAN-02 must have 0 stock while sheet is DRAFT");

    // 4. Empty crate stock and balances must be completely unchanged
    let post_wh_crates: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(post_wh_crates, initial_wh_crates, "Draft sheets must not lock or deduct empty crates");

    let route1_crates: i64 = conn
        .query_row(
            "SELECT COALESCE(current_crates_balance, 0) FROM entity_crate_balances WHERE entity_type = 'VAN_ROUTE' AND entity_id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    assert_eq!(route1_crates, 0, "VAN_ROUTE 1 crate balance must be 0 in DRAFT");

    // 5. Zero audit log / ledger entries generated
    let post_movements: i64 = conn
        .query_row("SELECT COUNT(*) FROM stock_movements", [], |r| r.get(0))
        .unwrap();
    let post_empties_ledger: i64 = conn
        .query_row("SELECT COUNT(*) FROM empties_ledger", [], |r| r.get(0))
        .unwrap();
    assert_eq!(post_movements, initial_movements, "No stock_movements created for DRAFT sheets");
    assert_eq!(post_empties_ledger, initial_empties_ledger, "No empties_ledger created for DRAFT sheets");
}

// ============================================================================
// 2. MULTI-LOCATION STOCK CUSTODY TRANSFER & CONSERVATION
// ============================================================================

#[test]
fn test_empirical_exact_wh_to_van_custody_transfer_conservation() {
    let mut conn = setup_empirical_db();

    let init_wh_p1: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    let init_wh_p2: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 2", [], |r| r.get(0))
        .unwrap();
    let init_wh_crates: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    // Draft loading sheet with 2 products:
    // P1: Next Cola 250ml Glass (24/pack, requires_crate = 1) -> 20 packs + 6 loose = 486 base units
    // P2: Next Cola 1.5L PET (6/pack, requires_crate = 0) -> 15 packs + 2 loose = 92 base units
    // Spare empty crates: 12
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: Some(45200),
            empty_crates_loaded: Some(12),
            items: vec![
                LoadingItemInput {
                    product_id: 1,
                    pack_qty: 20,
                    loose_qty: 6,
                },
                LoadingItemInput {
                    product_id: 2,
                    pack_qty: 15,
                    loose_qty: 2,
                },
            ],
            notes: Some("Custody transfer verification".into()),
            created_by: Some(4),
        },
    )
    .expect("Create loading sheet");

    // Execute atomic issuance
    let issue_res = LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: Some("08:30:00".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(12),
            morning_dispatcher_id: Some(4),
            notes: Some("Dispatched to Beat-01".into()),
        },
    )
    .expect("Issue loading sheet");

    assert_eq!(issue_res.status, "ISSUED");
    assert_eq!(issue_res.total_base_units_loaded, 486 + 92);
    // Total physical crates: 20 product crates (P1 requires crate, P2 PET does not) + 12 spare = 32 crates
    assert_eq!(issue_res.total_crates_loaded, 32);

    // INVARIANT 1: Exact Deduction from LOC-WH-MAIN equals Increment in LOC-VAN-01
    let wh_p1: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let van_p1: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = 2",
            [],
            |r| r.get(0),
        )
        .unwrap();

    let wh_p2: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 2 AND location_id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let van_p2: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 2 AND location_id = 2",
            [],
            |r| r.get(0),
        )
        .unwrap();

    assert_eq!(init_wh_p1 - wh_p1, 486, "Warehouse P1 decrement must be exactly 486 units");
    assert_eq!(van_p1, 486, "Van P1 increment must be exactly 486 units");
    assert_eq!(init_wh_p1 - wh_p1, van_p1, "Stock deducted from WH must strictly equal stock added to Van");

    assert_eq!(init_wh_p2 - wh_p2, 92, "Warehouse P2 decrement must be exactly 92 units");
    assert_eq!(van_p2, 92, "Van P2 increment must be exactly 92 units");
    assert_eq!(init_wh_p2 - wh_p2, van_p2, "Stock deducted from WH must strictly equal stock added to Van");

    // INVARIANT 2: Global Inventory Conservation Law:
    // Total physical inventory in system (Warehouse + Van) MUST equal original inventory
    assert_eq!(wh_p1 + van_p1, init_wh_p1, "Conservation law holds for Product 1");
    assert_eq!(wh_p2 + van_p2, init_wh_p2, "Conservation law holds for Product 2");

    // INVARIANT 3: Immutable Stock Movements Recorded
    let p1_mov: (String, i64, i64, i64) = conn
        .query_row(
            "SELECT movement_type, from_location_id, to_location_id, quantity_base_units
             FROM stock_movements
             WHERE reference_doc_id = ?1 AND product_id = 1",
            params![sheet.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .expect("Query P1 stock movement");
    assert_eq!(p1_mov.0, "VAN_DISPATCH");
    assert_eq!(p1_mov.1, 1, "Movement from LOC 1 (WH)");
    assert_eq!(p1_mov.2, 2, "Movement to LOC 2 (VAN 1)");
    assert_eq!(p1_mov.3, 486);

    let p2_mov: (String, i64, i64, i64) = conn
        .query_row(
            "SELECT movement_type, from_location_id, to_location_id, quantity_base_units
             FROM stock_movements
             WHERE reference_doc_id = ?1 AND product_id = 2",
            params![sheet.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .expect("Query P2 stock movement");
    assert_eq!(p2_mov.0, "VAN_DISPATCH");
    assert_eq!(p2_mov.1, 1);
    assert_eq!(p2_mov.2, 2);
    assert_eq!(p2_mov.3, 92);

    // INVARIANT 4: Empty Crate Inventory Consistency
    // Spare empties (12) deducted from warehouse empty crate stock
    let post_wh_crates: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(post_wh_crates, init_wh_crates - 12);

    // Total physical crates (32) assigned to VAN_ROUTE 1
    let route_crates: i64 = conn
        .query_row(
            "SELECT current_crates_balance FROM entity_crate_balances WHERE entity_type = 'VAN_ROUTE' AND entity_id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(route_crates, 32);
}

// ============================================================================
// 3. WAREHOUSE OVER-ALLOCATION PREVENTION & CONCURRENCY
// ============================================================================

#[test]
fn test_empirical_multi_sheet_over_allocation_prevention() {
    let mut conn = setup_empirical_db();

    // Available stock for Product 1 in warehouse: 12,000 base units (500 packs of 24)
    let initial_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(initial_stock, 12000);

    // Sheet A requests 300 packs = 7,200 base units
    let sheet_a = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Driver A".into()),
            helper_name: None,
            opening_km: Some(45200),
            empty_crates_loaded: Some(0),
            items: vec![LoadingItemInput {
                product_id: 1,
                pack_qty: 300,
                loose_qty: 0,
            }],
            notes: Some("Route A loading".into()),
            created_by: Some(4),
        },
    )
    .expect("Draft sheet A");

    // Sheet B requests 300 packs = 7,200 base units
    // Total requested between Sheet A and B = 14,400 base units (> 12,000 available)
    let sheet_b = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 2,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(2),
            vehicle_number: Some("LES-5512".into()),
            driver_id: Some(3),
            driver_name: Some("Driver B".into()),
            helper_name: None,
            opening_km: Some(89100),
            empty_crates_loaded: Some(0),
            items: vec![LoadingItemInput {
                product_id: 1,
                pack_qty: 300,
                loose_qty: 0,
            }],
            notes: Some("Route B loading".into()),
            created_by: Some(4),
        },
    )
    .expect("Draft sheet B");

    // 1. Issue Sheet A -> Must succeed
    let res_a = LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet_a.id,
            departure_time: Some("08:00:00".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(0),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect("Issue sheet A must succeed");
    assert_eq!(res_a.status, "ISSUED");

    // Stock in warehouse is now 12,000 - 7,200 = 4,800 base units
    let rem_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(rem_stock, 4800);

    // 2. Issue Sheet B -> MUST FAIL with InsufficientStock because 7,200 > 4,800
    let issue_b_err = LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet_b.id,
            departure_time: Some("08:15:00".into()),
            opening_km: Some(89100),
            empty_crates_loaded: Some(0),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect_err("Issue sheet B must fail due to over-allocation");

    match issue_b_err {
        AppError::InsufficientStock { product_id, requested_base, available_base } => {
            assert_eq!(product_id, 1);
            assert_eq!(requested_base, 7200);
            assert_eq!(available_base, 4800);
        }
        other => panic!("Expected InsufficientStock error, got {:?}", other),
    }

    // 3. Verify Rollback Integrity: Sheet B remains in DRAFT, no partial deduction
    let sheet_b_status: String = conn
        .query_row("SELECT status FROM delivery_sheets WHERE id = ?1", params![sheet_b.id], |r| r.get(0))
        .unwrap();
    assert_eq!(sheet_b_status, "DRAFT", "Sheet B must remain in DRAFT status after rejected issuance");

    let final_wh_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(final_wh_stock, 4800, "Warehouse stock must remain unchanged at 4,800");

    let van_b_stock: i64 = conn
        .query_row(
            "SELECT COALESCE(balance_base_units, 0) FROM product_location_balances WHERE product_id = 1 AND location_id = 3",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    assert_eq!(van_b_stock, 0, "Van B location must have 0 stock");

    let sheet_b_movs: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM stock_movements WHERE reference_doc_id = ?1",
            params![sheet_b.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(sheet_b_movs, 0, "No orphaned stock movements recorded for rejected Sheet B");
}

// ============================================================================
// 4. MULTI-ITEM PARTIAL SHORTAGE ATOMIC ROLLBACK
// ============================================================================

#[test]
fn test_empirical_multi_item_partial_shortage_atomic_rollback() {
    let mut conn = setup_empirical_db();

    let init_p2: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 2", [], |r| r.get(0))
        .unwrap();
    let init_p1: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    // Sheet with Item 1 (Product 2, valid stock), Item 2 (Product 1, grossly exceeding stock)
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Driver".into()),
            helper_name: None,
            opening_km: Some(45200),
            empty_crates_loaded: Some(0),
            items: vec![
                LoadingItemInput {
                    product_id: 2, // Valid: 10 packs = 60 units (available is ~3,000)
                    pack_qty: 10,
                    loose_qty: 0,
                },
                LoadingItemInput {
                    product_id: 1, // Invalid: 1,000 crates = 24,000 units (available is 12,000)
                    pack_qty: 1000,
                    loose_qty: 0,
                },
            ],
            notes: Some("Partial failure test".into()),
            created_by: Some(4),
        },
    )
    .expect("Create loading sheet");

    // Issuance fails on Item 2
    let err = LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: None,
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect_err("Issuance must fail due to item 2 stock shortage");

    match err {
        AppError::InsufficientStock { product_id, .. } => {
            assert_eq!(product_id, 1);
        }
        other => panic!("Expected InsufficientStock, got {:?}", other),
    }

    // Verify Item 1 was atomically rolled back
    let post_p2: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 2", [], |r| r.get(0))
        .unwrap();
    assert_eq!(post_p2, init_p2, "Product 2 stock must NOT be decremented when transaction fails on later item");

    let post_p1: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(post_p1, init_p1, "Product 1 stock must be unchanged");

    let van_p2: i64 = conn
        .query_row(
            "SELECT COALESCE(balance_base_units, 0) FROM product_location_balances WHERE product_id = 2 AND location_id = 2",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    assert_eq!(van_p2, 0, "Van location must have 0 units of Product 2 after rollback");

    let mov_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM stock_movements WHERE reference_doc_id = ?1", params![sheet.id], |r| r.get(0))
        .unwrap();
    assert_eq!(mov_count, 0, "Zero movements must exist after failed issuance");
}

// ============================================================================
// 5. DOUBLE-ISSUANCE PREVENTION
// ============================================================================

#[test]
fn test_empirical_double_issuance_rejection() {
    let mut conn = setup_empirical_db();

    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Driver".into()),
            helper_name: None,
            opening_km: Some(45200),
            empty_crates_loaded: Some(10),
            items: vec![LoadingItemInput {
                product_id: 1,
                pack_qty: 10,
                loose_qty: 0,
            }],
            notes: None,
            created_by: Some(4),
        },
    )
    .expect("Create loading sheet");

    // First issue: succeeds
    let _ = LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: Some("08:00:00".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(10),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect("First issuance must succeed");

    let wh_stock_after_issue1: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    // Second issue attempt: MUST FAIL with Validation error
    let second_err = LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: Some("08:05:00".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(10),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect_err("Second issuance attempt must be strictly rejected");

    match second_err {
        AppError::Validation(msg) => {
            assert!(msg.contains("must be 'DRAFT'"), "Error message must state status is not DRAFT: {}", msg);
        }
        other => panic!("Expected AppError::Validation, got {:?}", other),
    }

    // Verify stock was NOT deducted twice
    let wh_stock_after_second_attempt: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(
        wh_stock_after_second_attempt, wh_stock_after_issue1,
        "Stock must NOT be deducted a second time on repeated issuance"
    );
}

// ============================================================================
// 6. MULTI-VEHICLE FLEET ISOLATION & DYNAMIC LOCATION RESOLUTION
// ============================================================================

#[test]
fn test_empirical_fleet_concurrency_and_location_isolation() {
    let mut conn = setup_empirical_db();

    // 1. Create a dynamic new 4th vehicle in fleet: KHI-7788
    let custom_van = LogisticsService::create_vehicle(
        &mut conn,
        CreateVehicleDto {
            vehicle_number: "KHI-7788".into(),
            model: "Hino Dutro 4.0-Ton".into(),
            capacity_crates: 300,
            capacity_weight_kg: 4000.0,
            default_driver_id: Some(3),
            notes: Some("Fleet expansion van".into()),
        },
    )
    .expect("Create dynamic vehicle");

    let dynamic_loc_id = custom_van.stock_location_id.expect("Dynamic location ID");
    assert!(dynamic_loc_id >= 5, "Dynamic location ID must be allocated");

    // Create a 4th route using this vehicle
    let route4 = LogisticsService::create_route(
        &conn,
        CreateRouteDto {
            route_code: "BEAT-04-EXP".into(),
            route_name: "South Highway Route".into(),
            description: Some("Expansion beat".into()),
            default_driver_id: Some(3),
            default_vehicle_id: Some(custom_van.id),
            default_vehicle_no: Some("KHI-7788".into()),
            start_time: Some("07:30".into()),
            target_daily_sales_paisa: Some(10000000),
        },
    )
    .expect("Create route 4");

    let initial_wh: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    // 2. Dispatch Van 1 (LES-2489, Loc 2) with 10 packs = 240 units
    let s1 = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Driver 1".into()),
            helper_name: None,
            opening_km: Some(45200),
            empty_crates_loaded: Some(0),
            items: vec![LoadingItemInput { product_id: 1, pack_qty: 10, loose_qty: 0 }],
            notes: None,
            created_by: Some(4),
        },
    )
    .unwrap();
    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: s1.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: None,
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    // 3. Dispatch Van 2 (LES-5512, Loc 3) with 20 packs = 480 units
    let s2 = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 2,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(2),
            vehicle_number: Some("LES-5512".into()),
            driver_id: Some(3),
            driver_name: Some("Driver 2".into()),
            helper_name: None,
            opening_km: Some(89100),
            empty_crates_loaded: Some(0),
            items: vec![LoadingItemInput { product_id: 1, pack_qty: 20, loose_qty: 0 }],
            notes: None,
            created_by: Some(4),
        },
    )
    .unwrap();
    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: s2.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: None,
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    // 4. Dispatch Dynamic Van 4 (KHI-7788, dynamic_loc_id) with 30 packs = 720 units
    let s4 = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: route4.id,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(custom_van.id),
            vehicle_number: Some("KHI-7788".into()),
            driver_id: Some(3),
            driver_name: Some("Driver 4".into()),
            helper_name: None,
            opening_km: Some(100),
            empty_crates_loaded: Some(0),
            items: vec![LoadingItemInput { product_id: 1, pack_qty: 30, loose_qty: 0 }],
            notes: None,
            created_by: Some(4),
        },
    )
    .unwrap();
    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: s4.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: None,
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    // 5. Assert strict per-location isolation and multi-vehicle mass conservation
    let bal_wh: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let bal_van1: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = 2",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let bal_van2: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = 3",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let bal_van4: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = ?1",
            params![dynamic_loc_id],
            |r| r.get(0),
        )
        .unwrap();

    assert_eq!(bal_van1, 240, "Van 1 must hold exactly 240 units");
    assert_eq!(bal_van2, 480, "Van 2 must hold exactly 480 units");
    assert_eq!(bal_van4, 720, "Dynamic Van 4 must hold exactly 720 units");
    assert_eq!(bal_wh, initial_wh - (240 + 480 + 720), "Warehouse must reflect sum of all van dispatches");

    // Total physical inventory invariant
    assert_eq!(
        bal_wh + bal_van1 + bal_van2 + bal_van4,
        initial_wh,
        "Global inventory conservation across all 4 locations"
    );
}

// ============================================================================
// 7. VEHICLE CAPACITY CONSTRAINTS & METADATA
// ============================================================================

#[test]
fn test_empirical_vehicle_crate_capacity_validation() {
    let mut conn = setup_empirical_db();

    // Rejection of invalid crate capacity
    let zero_cap = LogisticsService::create_vehicle(
        &mut conn,
        CreateVehicleDto {
            vehicle_number: "BAD-0001".into(),
            model: "Invalid Truck".into(),
            capacity_crates: 0,
            capacity_weight_kg: 1000.0,
            default_driver_id: None,
            notes: None,
        },
    )
    .expect_err("Vehicle with capacity 0 must be rejected");

    match zero_cap {
        AppError::Validation(msg) => {
            assert!(msg.contains("greater than zero"), "Validation message must state capacity > 0");
        }
        other => panic!("Expected Validation error, got {:?}", other),
    }

    let neg_cap = LogisticsService::create_vehicle(
        &mut conn,
        CreateVehicleDto {
            vehicle_number: "BAD-0002".into(),
            model: "Invalid Truck".into(),
            capacity_crates: -50,
            capacity_weight_kg: 1000.0,
            default_driver_id: None,
            notes: None,
        },
    )
    .expect_err("Vehicle with negative capacity must be rejected");

    match neg_cap {
        AppError::Validation(msg) => {
            assert!(msg.contains("greater than zero"));
        }
        other => panic!("Expected Validation error, got {:?}", other),
    }

    // Baseline vehicles have exact configured capacities
    let veh1 = LogisticsService::get_vehicle_by_id(&conn, 1).unwrap();
    assert_eq!(veh1.vehicle_number, "LES-2489");
    assert_eq!(veh1.capacity_crates, 120);

    let veh2 = LogisticsService::get_vehicle_by_id(&conn, 2).unwrap();
    assert_eq!(veh2.vehicle_number, "LES-5512");
    assert_eq!(veh2.capacity_crates, 350);

    let veh3 = LogisticsService::get_vehicle_by_id(&conn, 3).unwrap();
    assert_eq!(veh3.vehicle_number, "LES-8840");
    assert_eq!(veh3.capacity_crates, 180);

    // Verify loading sheet detail returns the vehicle capacity for UI/operational validation
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Driver".into()),
            helper_name: None,
            opening_km: Some(45200),
            empty_crates_loaded: Some(10),
            items: vec![LoadingItemInput { product_id: 1, pack_qty: 10, loose_qty: 0 }],
            notes: None,
            created_by: Some(4),
        },
    )
    .unwrap();

    let sheet_detail = LogisticsService::get_loading_sheet_by_id(&conn, sheet.id).unwrap();
    assert_eq!(sheet_detail.vehicle_capacity_crates, Some(120));
}

// ============================================================================
// 8. CRATE CIRCULATION LEDGER CONSISTENCY ACROSS MULTIPLE DISPATCHES
// ============================================================================

#[test]
fn test_empirical_crate_circulation_ledger_consistency_across_dispatches() {
    let mut conn = setup_empirical_db();

    let init_wh_crates: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    // ------------------------------------------------------------------------
    // CYCLE 1: Balanced Route Run
    // ------------------------------------------------------------------------
    // Morning: Load 10 crates of drinks + 20 empty crates = 30 total crates
    let s1 = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-08".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq".into()),
            helper_name: None,
            opening_km: Some(45000),
            empty_crates_loaded: Some(20),
            items: vec![LoadingItemInput { product_id: 1, pack_qty: 10, loose_qty: 0 }],
            notes: None,
            created_by: Some(4),
        },
    )
    .unwrap();

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: s1.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: Some(20),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    // Check empties balance after morning 1:
    // WH empty crates decreased by 20 spare crates
    let wh_c1: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(wh_c1, init_wh_crates - 20);

    // Route 1 crate balance is 30
    let route_c1: i64 = conn
        .query_row(
            "SELECT current_crates_balance FROM entity_crate_balances WHERE entity_type = 'VAN_ROUTE' AND entity_id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(route_c1, 30);

    // Evening 1: Driver sold 0 bottles, returns 10 full crates + 20 empty crates (balanced)
    // Pre-settlement dry-run check
    let recon1 = SettlementService::calculate_settlement_reconciliation(
        &conn,
        s1.id,
        Some("2026-11-08"),
        &[VanSettlementReturnItemDto {
            product_id: 1,
            returned_packs: 10,
            returned_loose: 0,
            breakage_base: 0,
            notes: None,
        }],
        0,
        20,
        0,
    )
    .expect("Calculate recon 1");

    assert!(recon1.is_balanced);
    assert_eq!(recon1.crates_variance, 0);

    let set1 = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: s1.id,
            settlement_date: "2026-11-08".into(),
            closing_km: Some(45050),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 10,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa: 0,
            empty_crates_returned: 20,
            route_expenses_paisa: None,
            settlement_notes: Some("Cycle 1 complete".into()),
            shortage_action: None,
            user_id: Some(2),
        },
    )
    .expect("Submit settlement 1");

    assert_eq!(set1.status, "SETTLED");
    assert_eq!(set1.empty_crates_restocked, 20);
    assert_eq!(set1.total_shortage_paisa, 0);

    // After settlement 1:
    // WH empty crates restored to original baseline
    let wh_c1_post: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(wh_c1_post, init_wh_crates);

    // Route 1 crate balance decremented by 20 returned empties: 30 - 20 = 10 (product crates returned to WH liquid stock)
    let route_c1_post: i64 = conn
        .query_row(
            "SELECT current_crates_balance FROM entity_crate_balances WHERE entity_type = 'VAN_ROUTE' AND entity_id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(route_c1_post, 10);

    // ------------------------------------------------------------------------
    // CYCLE 2: Route Run with Crate Shortage
    // ------------------------------------------------------------------------
    // Morning 2: Load 10 crates of drinks + 15 empty crates = 25 total crates
    let s2 = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-09".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq".into()),
            helper_name: None,
            opening_km: Some(45050),
            empty_crates_loaded: Some(15),
            items: vec![LoadingItemInput { product_id: 1, pack_qty: 10, loose_qty: 0 }],
            notes: None,
            created_by: Some(4),
        },
    )
    .unwrap();

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: s2.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: Some(15),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    // WH empty crates decreased by 15: init_wh_crates - 15
    let wh_c2: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(wh_c2, init_wh_crates - 15);

    // Evening 2: Driver returns only 11 empty crates out of 15 expected -> 4 CRATES SHORTAGE!
    let recon2 = SettlementService::calculate_settlement_reconciliation(
        &conn,
        s2.id,
        Some("2026-11-09"),
        &[VanSettlementReturnItemDto {
            product_id: 1,
            returned_packs: 10,
            returned_loose: 0,
            breakage_base: 0,
            notes: None,
        }],
        0,
        11,
        0,
    )
    .expect("Calculate recon 2");

    assert!(!recon2.is_balanced);
    assert_eq!(recon2.crates_variance, -4, "Crates variance must be exactly -4");
    // Shortage rate is 600 PKR (60,000 Paisas) per crate -> 4 * 60,000 = 240,000 Paisas
    assert_eq!(recon2.crate_shortage_value_paisa, 240000);
    assert_eq!(recon2.total_driver_shortage_liability_paisa, 240000);

    let set2 = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: s2.id,
            settlement_date: "2026-11-09".into(),
            closing_km: Some(45100),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 10,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa: 0,
            empty_crates_returned: 11,
            route_expenses_paisa: None,
            settlement_notes: Some("Cycle 2 - 4 crates missing".into()),
            shortage_action: Some("CHARGE_DRIVER".into()),
            user_id: Some(2),
        },
    )
    .expect("Submit settlement 2");

    assert_eq!(set2.status, "SETTLED");
    assert_eq!(set2.total_shortage_paisa, 240000);
    assert_eq!(set2.empty_crates_restocked, 11);

    // Verify Shortage Journal Voucher created: Dr 1250 Driver Shortage / Cr 1030 Van Clearing
    assert!(set2.shortage_journal_entry_id.is_some());
    let jv_id = set2.shortage_journal_entry_id.unwrap();
    let jv_debit: i64 = conn
        .query_row(
            "SELECT debit_paisa FROM journal_lines WHERE entry_id = ?1 AND debit_paisa = 240000",
            params![jv_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(jv_debit, 240000, "Journal entry must debit 240,000 Paisas to Driver Shortage Receivables");

    // WH empty crates was restored by 11 returned crates: (init_wh_crates - 15) + 11 = init_wh_crates - 4
    let wh_c2_post: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(wh_c2_post, init_wh_crates - 4, "Warehouse empty crates correctly reflects net 4 missing crates");

    // Empties ledger must contain verifiable records for both dispatches and both returns
    let total_ledger_entries: i64 = conn
        .query_row("SELECT COUNT(*) FROM empties_ledger", [], |r| r.get(0))
        .unwrap();
    assert!(total_ledger_entries >= 4, "Empties ledger must track all dispatches and returns");
}

// ============================================================================
// 9. FULL DISPATCH-TO-SETTLEMENT STOCK CONSERVATION CYCLE
// ============================================================================

#[test]
fn test_empirical_full_dispatch_settlement_stock_conservation_cycle() {
    let mut conn = setup_empirical_db();

    let initial_wh_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    // 1. Dispatch 10 crates (240 bottles)
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: Some(45200),
            empty_crates_loaded: Some(10),
            items: vec![LoadingItemInput { product_id: 1, pack_qty: 10, loose_qty: 0 }],
            notes: None,
            created_by: Some(4),
        },
    )
    .unwrap();

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: Some(10),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    // Warehouse stock decreased by 240, Van has 240
    let wh_disp: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    let van_disp: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = 2",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(wh_disp, initial_wh_stock - 240);
    assert_eq!(van_disp, 240);

    // 2. Simulate Route Sales: Driver sells 7 crates (168 bottles)
    conn.execute(
        "UPDATE delivery_items SET sold_base = 168 WHERE sheet_id = ?1 AND product_id = 1",
        params![sheet.id],
    )
    .unwrap();

    // 3. Evening Physical Return:
    // Unsold: 3 crates (72 bottles) returned to warehouse
    // Breakage: 0
    // Empties returned: 10
    // Cash collection: 18,144 PKR (1,814,400 Paisas)
    let settlement_res = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: "2026-11-10".into(),
            closing_km: Some(45280),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 3,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa: 1814400,
            empty_crates_returned: 10,
            route_expenses_paisa: None,
            settlement_notes: Some("Evening balanced reconciliation".into()),
            shortage_action: None,
            user_id: Some(2),
        },
    )
    .expect("Submit settlement");

    assert_eq!(settlement_res.status, "SETTLED");
    assert_eq!(settlement_res.total_stock_variance_base, 0);

    // 4. VERIFY FINAL INVARIANTS:
    // A. Vehicle in-transit stock location must be decremented by returned stock (240 - 72 = 168 remaining sold units clearing)
    let van_final: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = 2",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(van_final, 240 - 72, "Van location decremented by exactly 72 returned units");

    // B. Warehouse stock restored by 72 returned units: Net decrement on warehouse is strictly 168 (the sold units)
    let wh_final: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(
        wh_final,
        initial_wh_stock - 168,
        "Net warehouse depletion equals exactly the 168 sold bottles"
    );

    // C. Delivery Sheet status updated to SETTLED
    let final_sheet_status: String = conn
        .query_row("SELECT status FROM delivery_sheets WHERE id = ?1", params![sheet.id], |r| r.get(0))
        .unwrap();
    assert_eq!(final_sheet_status, "SETTLED");
}

// ============================================================================
// 10. NON-CRATE PRODUCTS ZERO CRATE SIDE-EFFECTS
// ============================================================================

#[test]
fn test_empirical_non_crate_products_zero_crate_side_effects() {
    let mut conn = setup_empirical_db();

    let init_crates: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    // Product 2 is 1.5L PET Plastic (requires_crate = 0)
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-10".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Driver".into()),
            helper_name: None,
            opening_km: Some(45200),
            empty_crates_loaded: Some(0), // 0 spare empty crates
            items: vec![LoadingItemInput {
                product_id: 2,
                pack_qty: 50, // 50 PET packs = 300 bottles
                loose_qty: 0,
            }],
            notes: Some("100% PET dispatch".into()),
            created_by: Some(4),
        },
    )
    .unwrap();

    let res = LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: None,
            opening_km: None,
            empty_crates_loaded: Some(0),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    // Total crates loaded must be strictly 0
    assert_eq!(res.total_crates_loaded, 0, "PET packs must NOT be counted as crates");

    // Warehouse empty crates must be completely untouched
    let post_crates: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(post_crates, init_crates, "PET dispatch must not alter empty crates stock");

    // No crate balance added to VAN_ROUTE
    let route_crates: i64 = conn
        .query_row(
            "SELECT COALESCE(current_crates_balance, 0) FROM entity_crate_balances WHERE entity_type = 'VAN_ROUTE' AND entity_id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    assert_eq!(route_crates, 0, "VAN_ROUTE crate balance must remain 0 for PET dispatch");
}

// ============================================================================
// 11. EMPIRICAL ADVERSARIAL STRESS-TEST: INVOICED UNITS AUTO-AGGREGATION
// ============================================================================

#[test]
fn test_empirical_invoiced_units_auto_aggregation_cross_sheet_and_cancelled_isolation() {
    let mut conn = setup_empirical_db();
    let test_date = "2026-11-10";

    // 1. Morning Loading & Issuance for Delivery Sheet 1 (Route 1, Van 1)
    // Product 1 (250ml Glass, 24 units/pack): Load 10 packs = 240 base units
    // Product 2 (1.5L PET, 6 units/pack): Load 15 packs = 90 base units
    let sheet1 = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some(test_date.into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: Some(45200),
            empty_crates_loaded: Some(10),
            items: vec![
                LoadingItemInput {
                    product_id: 1,
                    pack_qty: 10, // 240 btls
                    loose_qty: 0,
                },
                LoadingItemInput {
                    product_id: 2,
                    pack_qty: 15, // 90 btls
                    loose_qty: 0,
                },
            ],
            notes: Some("Sheet 1 for empirical aggregation stress test".into()),
            created_by: Some(4),
        },
    )
    .expect("Create loading sheet 1");

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet1.id,
            departure_time: Some("08:00:00".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(10),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect("Issue loading sheet 1");

    // Invariant: delivery_items.sold_base must initially be strictly 0
    let s1_p1_sold: i64 = conn
        .query_row(
            "SELECT sold_base FROM delivery_items WHERE sheet_id = ?1 AND product_id = 1",
            params![sheet1.id],
            |r| r.get(0),
        )
        .unwrap();
    let s1_p2_sold: i64 = conn
        .query_row(
            "SELECT sold_base FROM delivery_items WHERE sheet_id = ?1 AND product_id = 2",
            params![sheet1.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(s1_p1_sold, 0);
    assert_eq!(s1_p2_sold, 0);

    // 2. Morning Loading & Issuance for Delivery Sheet 2 (Route 2, Van 2) - Cross-sheet noise
    let sheet2 = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 2,
            sheet_date: Some(test_date.into()),
            vehicle_id: Some(2),
            vehicle_number: Some("LES-5512".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: Some(89000),
            empty_crates_loaded: Some(5),
            items: vec![
                LoadingItemInput {
                    product_id: 1,
                    pack_qty: 5, // 120 btls
                    loose_qty: 0,
                },
                LoadingItemInput {
                    product_id: 2,
                    pack_qty: 5, // 30 btls
                    loose_qty: 0,
                },
            ],
            notes: Some("Sheet 2 cross-sheet noise".into()),
            created_by: Some(4),
        },
    )
    .expect("Create loading sheet 2");

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet2.id,
            departure_time: Some("08:15:00".into()),
            opening_km: Some(89000),
            empty_crates_loaded: Some(5),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect("Issue loading sheet 2");

    // 3. Activity on Sheet 1:
    // Invoice 1: Cash sale to Customer 1 with MIXED packaging
    // Prod 1: 3 packs + 4 loose = (3*24)+4 = 76 base units
    // Prod 2: 2 packs + 0 loose = (2*6) = 12 base units
    let inv1 = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: None,
            invoice_date: Some(test_date.into()),
            due_date: Some(test_date.into()),
            delivery_sheet_id: Some(sheet1.id),
            trip_id: Some(sheet1.id),
            items: vec![
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 3,
                    loose_qty: 4,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
                CreateSalesInvoiceItemDto {
                    product_id: 2,
                    pack_qty: 2,
                    loose_qty: 0,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
            ],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: Some(894000), // Paid in full
            crates_issued: Some(3),
            crates_returned: Some(3),
            admin_override_pin: None,
            user_id: Some(3),
        },
    )
    .expect("Create sheet 1 invoice 1");

    // Invoice 2: Credit sale to Customer 2 with MIXED packaging
    // Prod 1: 2 packs + 10 loose = (2*24)+10 = 58 base units
    // Prod 2: 4 packs + 3 loose = (4*6)+3 = 27 base units
    let inv2 = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 2,
            invoice_number: None,
            invoice_date: Some(test_date.into()),
            due_date: Some("2026-11-24".into()),
            delivery_sheet_id: Some(sheet1.id),
            trip_id: Some(sheet1.id),
            items: vec![
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 2,
                    loose_qty: 10,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
                CreateSalesInvoiceItemDto {
                    product_id: 2,
                    pack_qty: 4,
                    loose_qty: 3,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
            ],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Credit,
            paid_amount_paisa: Some(0),
            crates_issued: Some(2),
            crates_returned: Some(2),
            admin_override_pin: None,
            user_id: Some(3),
        },
    )
    .expect("Create sheet 1 invoice 2");

    // Invoice 3: Additional Cash sale to Customer 1 (pack only)
    // Prod 1: 1 pack = 24 base units
    let inv3 = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: None,
            invoice_date: Some(test_date.into()),
            due_date: Some(test_date.into()),
            delivery_sheet_id: Some(sheet1.id),
            trip_id: Some(sheet1.id),
            items: vec![
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 1,
                    loose_qty: 0,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
            ],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: Some(216000),
            crates_issued: Some(1),
            crates_returned: Some(1),
            admin_override_pin: None,
            user_id: Some(3),
        },
    )
    .expect("Create sheet 1 invoice 3");

    // Total legitimate invoiced units on Sheet 1:
    // Prod 1 = 76 (inv1) + 58 (inv2) + 24 (inv3) = 158 base units
    // Prod 2 = 12 (inv1) + 27 (inv2) = 39 base units

    // 4. Adversarial Noise 1: Cancelled Invoice on Sheet 1
    // Retailer ordered 2 packs Prod 1 (48 base) and 1 pack Prod 2 (6 base), but canceled delivery
    let inv_cancel = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 2,
            invoice_number: None,
            invoice_date: Some(test_date.into()),
            due_date: Some(test_date.into()),
            delivery_sheet_id: Some(sheet1.id),
            trip_id: Some(sheet1.id),
            items: vec![
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 2, // 48 btls
                    loose_qty: 0,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
                CreateSalesInvoiceItemDto {
                    product_id: 2,
                    pack_qty: 1, // 6 btls
                    loose_qty: 0,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
            ],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Credit,
            paid_amount_paisa: Some(0),
            crates_issued: Some(2),
            crates_returned: Some(2),
            admin_override_pin: None,
            user_id: Some(3),
        },
    )
    .expect("Create invoice to be cancelled");

    CancellationService::cancel_invoice(
        &mut conn,
        CancelInvoiceDto {
            invoice_id: inv_cancel.invoice_id,
            reason: "Retailer cancelled on route".into(),
            cancelled_by: 1,
            admin_pin: Some("1234".into()),
        },
    )
    .expect("Cancel invoice must succeed");

    // Verify invoice is cancelled in DB
    let (is_canc, status): (i64, String) = conn
        .query_row(
            "SELECT is_cancelled, status FROM sales_invoices WHERE id = ?1",
            params![inv_cancel.invoice_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(is_canc, 1);
    assert_eq!(status, "CANCELLED");

    // 5. Adversarial Noise 2: Invoices on Sheet 2
    let _inv_sheet2 = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 3,
            invoice_number: None,
            invoice_date: Some(test_date.into()),
            due_date: Some(test_date.into()),
            delivery_sheet_id: Some(sheet2.id),
            trip_id: Some(sheet2.id),
            items: vec![
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 3, // 72 btls
                    loose_qty: 0,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
                CreateSalesInvoiceItemDto {
                    product_id: 2,
                    pack_qty: 2, // 12 btls
                    loose_qty: 0,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
            ],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: Some(500000),
            crates_issued: Some(3),
            crates_returned: Some(3),
            admin_override_pin: None,
            user_id: Some(3),
        },
    )
    .expect("Create sheet 2 invoice");

    // 6. Adversarial Noise 3: Counter Walk-in POS Sale at Depot (No Sheet / trip_id: None)
    let _inv_counter = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 3,
            invoice_number: None,
            invoice_date: Some(test_date.into()),
            due_date: Some(test_date.into()),
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 4, // 96 btls
                    loose_qty: 0,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
                CreateSalesInvoiceItemDto {
                    product_id: 2,
                    pack_qty: 3, // 18 btls
                    loose_qty: 0,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
            ],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: Some(1000000),
            crates_issued: Some(4),
            crates_returned: Some(4),
            admin_override_pin: None,
            user_id: Some(1),
        },
    )
    .expect("Create counter POS invoice");

    // 7. Verify Invariant: delivery_items.sold_base on Sheet 1 is STILL 0 in DB before calculation
    let pre_calc_sold_p1: i64 = conn
        .query_row(
            "SELECT sold_base FROM delivery_items WHERE sheet_id = ?1 AND product_id = 1",
            params![sheet1.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(pre_calc_sold_p1, 0, "delivery_items.sold_base must not be manually set");

    // 8. Run SettlementService::calculate_settlement_reconciliation
    // Returns:
    // Prod 1: loaded 240 btls. Sold 158 btls. Breakage: 2 btls.
    // Expected return = 240 - 158 - 2 = 80 btls = 3 packs (72) + 8 loose.
    // Prod 2: loaded 90 btls. Sold 39 btls. Breakage: 0 btls.
    // Expected return = 90 - 39 = 51 btls = 8 packs (48) + 3 loose.
    let expected_cash = inv1.paid_amount_paisa + inv3.paid_amount_paisa; // Only active Sheet 1 cash sales

    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet1.id,
        Some(test_date),
        &[
            VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 3,
                returned_loose: 8,
                breakage_base: 2,
                notes: None,
            },
            VanSettlementReturnItemDto {
                product_id: 2,
                returned_packs: 8,
                returned_loose: 3,
                breakage_base: 0,
                notes: None,
            },
        ],
        expected_cash,
        10,
        0,
    )
    .expect("Settlement reconciliation must succeed");

    // 9. EMPIRICAL VERIFICATIONS:
    // A. Product 1 sold_base must be strictly 158
    let item_p1 = recon.stock_items.iter().find(|i| i.product_id == 1).expect("Prod 1 item");
    assert_eq!(
        item_p1.sold_base, 158,
        "Prod 1 sold_base must auto-aggregate exactly 76 + 58 + 24 = 158 (excluding cancelled 48, sheet2 72, counter 96)"
    );
    assert_eq!(item_p1.expected_return_base, 80);
    assert_eq!(item_p1.total_returned_base, 80);
    assert_eq!(item_p1.variance_base, 0);
    assert_eq!(item_p1.status, "BALANCED");

    // B. Product 2 sold_base must be strictly 39
    let item_p2 = recon.stock_items.iter().find(|i| i.product_id == 2).expect("Prod 2 item");
    assert_eq!(
        item_p2.sold_base, 39,
        "Prod 2 sold_base must auto-aggregate exactly 12 + 27 = 39 (excluding cancelled 6, sheet2 12, counter 18)"
    );
    assert_eq!(item_p2.expected_return_base, 51);
    assert_eq!(item_p2.total_returned_base, 51);
    assert_eq!(item_p2.variance_base, 0);
    assert_eq!(item_p2.status, "BALANCED");

    // C. Financial verification
    assert_eq!(recon.route_cash_sales_paisa, expected_cash);
    assert_eq!(recon.route_credit_sales_paisa, inv2.due_amount_paisa);
    assert_eq!(recon.actual_cash_paisa, expected_cash);
    assert_eq!(recon.cash_variance_paisa, 0);
    assert!(recon.is_balanced);

    // 10. Submit Van Settlement and prove DB persistence of auto-aggregated units
    let submit_res = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet1.id,
            settlement_date: test_date.into(),
            closing_km: Some(45280),
            returns: vec![
                VanSettlementReturnItemDto {
                    product_id: 1,
                    returned_packs: 3,
                    returned_loose: 8,
                    breakage_base: 2,
                    notes: None,
                },
                VanSettlementReturnItemDto {
                    product_id: 2,
                    returned_packs: 8,
                    returned_loose: 3,
                    breakage_base: 0,
                    notes: None,
                },
            ],
            actual_cash_paisa: expected_cash,
            empty_crates_returned: 10,
            route_expenses_paisa: None,
            shortage_action: Some("BALANCED".into()),
            settlement_notes: Some("Empirical verification passed".into()),
            user_id: Some(1),
        },
    )
    .expect("Submit van settlement");

    assert_eq!(submit_res.status, "SETTLED");

    // Verify delivery_items in DB now holds the persisted auto-aggregated values
    let post_sold_p1: i64 = conn
        .query_row(
            "SELECT sold_base FROM delivery_items WHERE sheet_id = ?1 AND product_id = 1",
            params![sheet1.id],
            |r| r.get(0),
        )
        .unwrap();
    let post_sold_p2: i64 = conn
        .query_row(
            "SELECT sold_base FROM delivery_items WHERE sheet_id = ?1 AND product_id = 2",
            params![sheet1.id],
            |r| r.get(0),
        )
        .unwrap();

    assert_eq!(post_sold_p1, 158, "delivery_items.sold_base for Prod 1 must be persisted as 158 in DB");
    assert_eq!(post_sold_p2, 39, "delivery_items.sold_base for Prod 2 must be persisted as 39 in DB");
}

// ============================================================================
// 12. EMPIRICAL ADVERSARIAL STRESS-TEST: SHORTAGE DISCRIMINATION & DUAL CANCELLATION FLAGS
// ============================================================================

#[test]
fn test_empirical_invoiced_units_adversarial_cancellation_modes_and_shortage_detection() {
    let mut conn = setup_empirical_db();
    let test_date = "2026-11-10";

    // 1. Dispatch Sheet (Route 1, Van 1) with Prod 1: 5 packs = 120 base units
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some(test_date.into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: Some(45200),
            empty_crates_loaded: Some(5),
            items: vec![
                LoadingItemInput {
                    product_id: 1,
                    pack_qty: 5, // 120 btls
                    loose_qty: 0,
                },
            ],
            notes: Some("Shortage discrimination stress test".into()),
            created_by: Some(4),
        },
    )
    .expect("Create loading sheet");

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: Some("08:00:00".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(5),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect("Issue loading sheet");

    // 2. Invoice with MULTIPLE lines of the SAME product
    // Line 1: 1 pack = 24 btls
    // Line 2: 1 pack + 6 loose = 30 btls
    // Total on invoice = 54 btls
    let inv1 = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: None,
            invoice_date: Some(test_date.into()),
            due_date: Some(test_date.into()),
            delivery_sheet_id: Some(sheet.id),
            trip_id: Some(sheet.id),
            items: vec![
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 1,
                    loose_qty: 0,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 1,
                    loose_qty: 6,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
            ],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: Some(486000),
            crates_issued: Some(2),
            crates_returned: Some(2),
            admin_override_pin: None,
            user_id: Some(3),
        },
    )
    .expect("Create multi-line invoice");

    // 3. Adversarial Invoices testing dual cancellation conditions:
    // A. Invoice with is_cancelled = 1 but status = 'ACTIVE' (simulating partial flag or legacy state)
    let inv_flag1 = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 2,
            invoice_number: None,
            invoice_date: Some(test_date.into()),
            due_date: Some(test_date.into()),
            delivery_sheet_id: Some(sheet.id),
            trip_id: Some(sheet.id),
            items: vec![
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 1, // 24 btls
                    loose_qty: 0,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
            ],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Credit,
            paid_amount_paisa: Some(0),
            crates_issued: Some(1),
            crates_returned: Some(1),
            admin_override_pin: None,
            user_id: Some(3),
        },
    )
    .expect("Create flag1 invoice");

    conn.execute(
        "UPDATE sales_invoices SET is_cancelled = 1, status = 'UNPAID' WHERE id = ?1",
        params![inv_flag1.invoice_id],
    )
    .unwrap();

    // B. Invoice with is_cancelled = 0 but status = 'CANCELLED'
    let inv_flag2 = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 2,
            invoice_number: None,
            invoice_date: Some(test_date.into()),
            due_date: Some(test_date.into()),
            delivery_sheet_id: Some(sheet.id),
            trip_id: Some(sheet.id),
            items: vec![
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 1, // 24 btls
                    loose_qty: 0,
                    unit_price_paisa: None,
                    line_discount_paisa: None,
                },
            ],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Credit,
            paid_amount_paisa: Some(0),
            crates_issued: Some(1),
            crates_returned: Some(1),
            admin_override_pin: None,
            user_id: Some(3),
        },
    )
    .expect("Create flag2 invoice");

    conn.execute(
        "UPDATE sales_invoices SET is_cancelled = 0, status = 'CANCELLED' WHERE id = ?1",
        params![inv_flag2.invoice_id],
    )
    .unwrap();

    // 4. Test Shortage Detection:
    // Total loaded: 120 btls
    // Legitimate sold units: 54 btls (multi-line inv1: 24 + 30)
    // Expected return if no breakage = 120 - 54 = 66 btls
    // Driver physically returns ONLY 50 btls (2 packs of 24 = 48 + 2 loose = 50 btls)
    // Shortage = 50 - 66 = -16 btls!
    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some(test_date),
        &[
            VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 2,
                returned_loose: 2,
                breakage_base: 0,
                notes: None,
            },
        ],
        inv1.paid_amount_paisa,
        5,
        0,
    )
    .expect("Reconciliation must execute cleanly");

    let item_p1 = recon.stock_items.iter().find(|i| i.product_id == 1).expect("Prod 1 line");
    assert_eq!(
        item_p1.sold_base, 54,
        "Auto-aggregation must sum multi-line items (24 + 30 = 54) and strictly exclude both is_cancelled=1 and status='CANCELLED'"
    );
    assert_eq!(item_p1.expected_return_base, 66);
    assert_eq!(item_p1.total_returned_base, 50);
    assert_eq!(item_p1.variance_base, -16, "Must accurately detect 16 bottles shortage");
    assert_eq!(item_p1.status, "SHORTAGE");
    assert!(
        item_p1.shortage_value_paisa > 0,
        "Shortage must have non-zero financial liability"
    );
    assert_eq!(recon.total_stock_variance_base, -16);
    assert!(!recon.is_balanced, "Trip with shortage must NOT be balanced");
}
