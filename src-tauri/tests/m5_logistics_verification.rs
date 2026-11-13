use rusqlite::{params, Connection};
use logar_pos_lib::db::migrations::run_migrations;
use logar_pos_lib::domain::dtos::*;
use logar_pos_lib::domain::errors::AppError;
use logar_pos_lib::domain::models::PaymentType;
use logar_pos_lib::domain::rbac::{check_permission, has_permission, Action, Role};
use logar_pos_lib::services::accounting::AccountingService;
use logar_pos_lib::services::auth::{AuditService, AuthService};
use logar_pos_lib::services::closing::{ClosingService, DenominationCountsDto, SubmitClosingDto};
use logar_pos_lib::services::logistics::LogisticsService;
use logar_pos_lib::services::sales::{CreateSalesInvoiceDto, CreateSalesInvoiceItemDto, SalesService};
use logar_pos_lib::services::settlement::SettlementService;

fn setup_test_db() -> Connection {
    let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite database");
    run_migrations(&mut conn).expect("Failed to apply schema migrations 001 through 007");
    conn
}

// ============================================================================
// 1. FLEET & ROUTE MANAGEMENT TESTS
// ============================================================================

#[test]
fn test_vehicle_creation_and_fleet_listing() {
    let mut conn = setup_test_db();

    // 1. Verify pre-seeded vehicles from Migration 007
    let initial_vehicles = LogisticsService::list_vehicles(&conn, false).expect("List initial vehicles");
    assert_eq!(initial_vehicles.len(), 3, "Migration 007 must seed 3 baseline depot vehicles");
    assert_eq!(initial_vehicles[0].vehicle_number, "LES-2489");
    assert_eq!(initial_vehicles[1].vehicle_number, "LES-5512");
    assert_eq!(initial_vehicles[2].vehicle_number, "LES-8840");

    // 2. Register a new vehicle
    let new_veh = LogisticsService::create_vehicle(
        &mut conn,
        CreateVehicleDto {
            vehicle_number: "LEA-9900".into(),
            model: "Master Foton 3.5-Ton".into(),
            capacity_crates: 250,
            capacity_weight_kg: 3500.0,
            default_driver_id: Some(3),
            notes: Some("New auxiliary van".into()),
        },
    )
    .expect("Create new vehicle");

    assert_eq!(new_veh.vehicle_number, "LEA-9900");
    assert_eq!(new_veh.capacity_crates, 250);
    assert!(new_veh.stock_location_id.is_some(), "Vehicle must be assigned a stock_location_id");

    // 3. Verify stock_location created for vehicle
    let loc_code: String = conn
        .query_row(
            "SELECT code FROM stock_locations WHERE id = ?1",
            params![new_veh.stock_location_id.unwrap()],
            |r| r.get(0),
        )
        .expect("Query vehicle stock location");
    assert_eq!(loc_code, "LOC-VAN-LEA9900");

    // 4. Update vehicle attributes
    let updated = LogisticsService::update_vehicle(
        &conn,
        new_veh.id,
        UpdateVehicleDto {
            model: "Master Foton 3.5-Ton Turbo".into(),
            capacity_crates: 260,
            capacity_weight_kg: 3600.0,
            default_driver_id: Some(3),
            current_odometer_km: 1500,
            is_active: true,
            notes: Some("Odometer calibrated".into()),
        },
    )
    .expect("Update vehicle");
    assert_eq!(updated.capacity_crates, 260);
    assert_eq!(updated.current_odometer_km, 1500);
}

#[test]
fn test_route_creation_and_beat_management() {
    let conn = setup_test_db();

    // 1. Initial 3 routes pre-seeded
    let routes = LogisticsService::list_routes(&conn, false).expect("List initial routes");
    assert_eq!(routes.len(), 3, "Baseline must contain 3 routes (BEAT-01, BEAT-02, BEAT-03)");
    assert_eq!(routes[0].route_code, "BEAT-01");
    assert_eq!(routes[0].default_vehicle_id, Some(1));

    // 2. Create Route 4
    let route4 = LogisticsService::create_route(
        &conn,
        CreateRouteDto {
            route_code: "BEAT-04".into(),
            route_name: "Sadiqabad Highway Express".into(),
            description: Some("Outstation highway distribution beat".into()),
            default_driver_id: Some(3),
            default_vehicle_id: Some(2),
            default_vehicle_no: Some("LES-5512".into()),
            start_time: Some("07:00".into()),
            target_daily_sales_paisa: Some(15000000), // 150,000 PKR
        },
    )
    .expect("Create route 4");

    assert_eq!(route4.route_code, "BEAT-04");
    assert_eq!(route4.target_daily_sales_paisa, 15000000);

    // 3. Update Route 4
    let updated_r4 = LogisticsService::update_route(
        &conn,
        route4.id,
        UpdateRouteDto {
            route_name: "Sadiqabad & Chowk Bahadur Express".into(),
            description: Some("Updated highway beat".into()),
            default_driver_id: Some(3),
            default_vehicle_id: Some(2),
            default_vehicle_no: Some("LES-5512".into()),
            start_time: Some("06:30".into()),
            target_daily_sales_paisa: Some(18000000),
            is_active: true,
        },
    )
    .expect("Update route 4");

    assert_eq!(updated_r4.route_name, "Sadiqabad & Chowk Bahadur Express");
    assert_eq!(updated_r4.target_daily_sales_paisa, 18000000);
}

// ============================================================================
// 2. VEHICLE LOADING & STOCK ISSUANCE TESTS (FEATURE 15)
// ============================================================================

#[test]
fn test_morning_loading_sheet_creation_and_draft_state() {
    let mut conn = setup_test_db();

    // Draft loading sheet for Route 1 (BEAT-01)
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-06".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: Some("Rashid (Loader)".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(20),
            items: vec![
                LoadingItemInput {
                    product_id: 1, // Next Cola 250ml Glass (24/crate)
                    pack_qty: 10,  // 10 crates = 240 bottles
                    loose_qty: 5,  // 5 loose bottles -> total 245
                },
                LoadingItemInput {
                    product_id: 2, // Next Cola 1.5L PET (6/pack)
                    pack_qty: 15,  // 15 packs = 90 bottles
                    loose_qty: 0,
                },
            ],
            notes: Some("Morning dispatch run 1".into()),
            created_by: Some(4), // warehouse1
        },
    )
    .expect("Draft loading sheet");

    assert_eq!(sheet.status, "DRAFT");
    assert!(sheet.sheet_number.starts_with("LOAD-20261106-"));
    assert_eq!(sheet.items.len(), 2);
    assert_eq!(sheet.items[0].total_loaded_base, 245);
    assert_eq!(sheet.items[1].total_loaded_base, 90);

    // Verify stock has NOT been deducted while in DRAFT status
    let stock_p1: i64 = conn
        .query_row(
            "SELECT current_stock_base_units FROM products WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .expect("Query product 1 stock");
    assert_eq!(stock_p1, 12000, "Draft loading sheet must not deduct warehouse physical stock");
}

#[test]
fn test_vehicle_stock_issuance_multi_location_and_crate_tracking() {
    let mut conn = setup_test_db();

    // 1. Create draft sheet
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-06".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: Some("Rashid (Loader)".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(15), // 15 spare empty crates
            items: vec![
                LoadingItemInput {
                    product_id: 1, // 250ml RGB Glass (24/crate, requires_crate=1)
                    pack_qty: 10,  // 240 bottles in 10 crates
                    loose_qty: 0,
                },
            ],
            notes: None,
            created_by: Some(4),
        },
    )
    .expect("Draft sheet");

    let initial_wh_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    let initial_wh_crates: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();

    // 2. Issue loading sheet (Atomic Warehouse Dispatch)
    let issue_res = LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: Some("08:15:00".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(15),
            morning_dispatcher_id: Some(4),
            notes: Some("Gate pass approved".into()),
        },
    )
    .expect("Issue loading sheet");

    assert_eq!(issue_res.status, "ISSUED");
    assert_eq!(issue_res.total_base_units_loaded, 240);
    assert_eq!(issue_res.total_crates_loaded, 25); // 10 product crates + 15 spare empty crates

    // 3. Verify Master Inventory Deducted
    let post_wh_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(post_wh_stock, initial_wh_stock - 240);

    // 4. Verify Multi-Location Balances: Warehouse decremented, Van incremented
    let wh_loc_balance: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(wh_loc_balance, initial_wh_stock - 240);

    let van_loc_balance: i64 = conn
        .query_row(
            "SELECT balance_base_units FROM product_location_balances WHERE product_id = 1 AND location_id = 2",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(van_loc_balance, 240, "Van location 2 must hold 240 in-transit bottles");

    // 5. Verify Immutable Stock Movement Audit: VAN_DISPATCH
    let mov_type: String = conn
        .query_row(
            "SELECT movement_type FROM stock_movements WHERE reference_doc_id = ?1 ORDER BY id DESC LIMIT 1",
            params![sheet.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(mov_type, "VAN_DISPATCH");

    // 6. Verify Empty Crate Circulation
    let post_wh_crates: i64 = conn
        .query_row("SELECT empty_crates_stock FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(post_wh_crates, initial_wh_crates - 15, "Spare empty crates must be decremented from warehouse");

    let route_crate_balance: i64 = conn
        .query_row(
            "SELECT current_crates_balance FROM entity_crate_balances WHERE entity_type = 'VAN_ROUTE' AND entity_id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(route_crate_balance, 25, "VAN_ROUTE must be charged with 25 crates in circulation");
}

#[test]
fn test_insufficient_stock_rejection_at_issuance() {
    let mut conn = setup_test_db();

    // Available stock for Product 1 is 12,000 base units (500 crates)
    // Attempt to load 600 crates (14,400 base units)
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-06".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Driver".into()),
            helper_name: None,
            opening_km: None,
            empty_crates_loaded: None,
            items: vec![
                LoadingItemInput {
                    product_id: 1,
                    pack_qty: 600, // Exceeds 12,000 base
                    loose_qty: 0,
                },
            ],
            notes: None,
            created_by: Some(4),
        },
    )
    .expect("Draft sheet creation succeeds");

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
    .expect_err("Must reject issuance when stock is insufficient");

    match err {
        AppError::InsufficientStock { product_id, requested_base, available_base } => {
            assert_eq!(product_id, 1);
            assert_eq!(requested_base, 14400);
            assert_eq!(available_base, 12000);
        }
        other => panic!("Expected InsufficientStock error, got {:?}", other),
    }
}

// ============================================================================
// 3. VAN SETTLEMENT, RETURNS & SHORTAGE RECONCILIATION TESTS (FEATURE 16)
// ============================================================================

#[test]
fn test_van_settlement_balanced_run() {
    let mut conn = setup_test_db();

    // 1. Dispatch 10 crates (240 bottles) of Product 1 and 20 empty crates
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-06".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: Some(45200),
            empty_crates_loaded: Some(20),
            items: vec![
                LoadingItemInput {
                    product_id: 1,
                    pack_qty: 10,
                    loose_qty: 0,
                },
            ],
            notes: None,
            created_by: Some(4),
        },
    )
    .unwrap();

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: Some("08:00:00".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(20),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    // 2. Simulate route delivery: Driver sold 6 crates (144 bottles) for 12,960 PKR cash
    // In delivery_items: sold_base = 144
    conn.execute(
        "UPDATE delivery_items SET sold_base = 144 WHERE sheet_id = ?1 AND product_id = 1",
        params![sheet.id],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO sales_invoices (
            invoice_number, customer_id, delivery_sheet_id, invoice_date, due_date,
            subtotal_paisa, discount_paisa, net_total_paisa, paid_amount_paisa, due_amount_paisa,
            crates_issued, crates_returned, payment_type, created_by
         ) VALUES ('INV-ROUTE-BAL-01', 1, ?1, '2026-11-06', '2026-11-06', 1296000, 0, 1296000, 1296000, 0, 0, 10, 'CASH', 3)",
        params![sheet.id],
    )
    .unwrap();



    // Driver returns with:
    // - 4 crates (96 bottles) unsold
    // - 0 breakage
    // - 30 empty crates (20 morning + 10 full swapped)
    // - 12,960 PKR cash (1,296,000 Paisas)
    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some("2026-11-06"),
        &[VanSettlementReturnItemDto {
            product_id: 1,
            returned_packs: 4,
            returned_loose: 0,
            breakage_base: 0,
            notes: None,
        }],
        1296000,
        30,
        0,
    )
    .expect("Dry run reconciliation");

    assert!(recon.is_balanced, "Reconciliation must be perfectly balanced");
    assert_eq!(recon.total_stock_variance_base, 0);
    assert_eq!(recon.cash_variance_paisa, 0);
    assert_eq!(recon.crates_variance, 0);
    assert_eq!(recon.total_driver_shortage_liability_paisa, 0);

    // 3. Submit Settlement
    let result = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: "2026-11-06".into(),
            closing_km: Some(45280),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 4,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa: 1296000,
            empty_crates_returned: 30,
            route_expenses_paisa: None,
            settlement_notes: Some("Balanced evening return".into()),
            shortage_action: None,
            user_id: Some(2), // accountant
        },
    )
    .expect("Submit settlement");

    assert_eq!(result.status, "SETTLED");
    assert!(result.cash_book_entry_id.is_some(), "Cash book entry must be created for handover");
    assert!(result.shortage_journal_entry_id.is_none(), "No shortage JV for balanced trip");

    // 4. Verify Warehouse Stock Restored by exactly 4 crates (96 bottles)
    let final_wh_stock: i64 = conn
        .query_row("SELECT current_stock_base_units FROM products WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(final_wh_stock, 12000 - 144, "Net warehouse decrement equals sold bottles only");

    // 5. Verify Cash Book Record
    let (cb_type, cb_cash_in): (String, i64) = conn
        .query_row(
            "SELECT transaction_type, cash_in_paisa FROM cash_book WHERE id = ?1",
            params![result.cash_book_entry_id.unwrap()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(cb_type, "ROUTE_CASH_HANDOVER");
    assert_eq!(cb_cash_in, 1296000);
}

#[test]
fn test_van_settlement_shortage_detection_and_penalty_voucher() {
    let mut conn = setup_test_db();

    // 1. Dispatch 10 crates (240 bottles) of Product 1
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-06".into()),
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
                    pack_qty: 10,
                    loose_qty: 0,
                },
            ],
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

    // 2. Route activity:
    // - Sold 5 crates (120 bottles) on invoices
    conn.execute(
        "UPDATE delivery_items SET sold_base = 120 WHERE sheet_id = ?1 AND product_id = 1",
        params![sheet.id],
    )
    .unwrap();

    // Driver returns with:
    // - 3 crates (72 bottles) physical return -> Expected return was 5 crates (120 bottles) -> SHORTAGE OF 48 BOTTLES (-2 crates)
    // - 8 empty crates returned -> Expected was 10 crates -> SHORTAGE OF 2 CRATES
    // - Hands over 8,000 PKR (800,000 Paisas) cash instead of expected 10,800 PKR (1,080,000 Paisas) -> SHORTAGE OF 2,800 PKR (280,000 Paisas)
    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some("2026-11-06"),
        &[VanSettlementReturnItemDto {
            product_id: 1,
            returned_packs: 3,
            returned_loose: 0,
            breakage_base: 0,
            notes: None,
        }],
        800000,
        8,
        0,
    )
    .unwrap();

    assert!(!recon.is_balanced);
    assert_eq!(recon.total_stock_variance_base, -48, "48 bottles missing");
    assert_eq!(recon.cash_variance_paisa, 800000 - 0); // No invoice paid_amount recorded in test DB, so expected is 0, actual is 800000 -> excess
    assert_eq!(recon.crates_variance, -2, "2 empty crates missing");

    // 3. Submit Settlement with Shortage Penalty (CHARGE_DRIVER)
    let result = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: "2026-11-06".into(),
            closing_km: Some(45290),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 3,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa: 800000,
            empty_crates_returned: 8,
            route_expenses_paisa: None,
            settlement_notes: Some("Discrepancy detected".into()),
            shortage_action: Some("CHARGE_DRIVER".into()),
            user_id: Some(2),
        },
    )
    .expect("Submit settlement with shortage");

    assert_eq!(result.status, "SETTLED");
    assert!(result.shortage_journal_entry_id.is_some(), "Must generate shortage Journal Voucher");

    // 4. Verify Journal Lines: Debit 1250 (Driver Shortage Receivables)
    let jv_id = result.shortage_journal_entry_id.unwrap();
    let (debit_acct, debit_paisa): (i64, i64) = conn
        .query_row(
            "SELECT account_id, debit_paisa FROM journal_lines WHERE entry_id = ?1 AND debit_paisa > 0",
            params![jv_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("Query shortage debit line");
    assert_eq!(debit_acct, 9, "Account ID 9 corresponds to Account 1250 Driver Shortages");
    assert!(debit_paisa > 0, "Shortage liability must be greater than zero");
}

#[test]
fn test_van_settlement_transit_breakage_handled_without_false_shortage() {
    let mut conn = setup_test_db();

    // 1. Dispatch 10 crates (240 bottles)
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-06".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: None,
            empty_crates_loaded: None,
            items: vec![
                LoadingItemInput {
                    product_id: 1,
                    pack_qty: 10,
                    loose_qty: 0,
                },
            ],
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
            empty_crates_loaded: None,
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    // Sold 8 crates (192 bottles)
    conn.execute(
        "UPDATE delivery_items SET sold_base = 192 WHERE sheet_id = ?1 AND product_id = 1",
        params![sheet.id],
    )
    .unwrap();

    // Driver returns:
    // - 1 crate + 20 loose bottles = 44 bottles returned good
    // - 4 bottles broken in road transit
    // Expected return: 240 - 192 - 4 = 44. Returned: 44. Variance = 0!
    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some("2026-11-06"),
        &[VanSettlementReturnItemDto {
            product_id: 1,
            returned_packs: 1,
            returned_loose: 20,
            breakage_base: 4,
            notes: Some("4 bottles cracked during speed bump impact".into()),
        }],
        0,
        0,
        0,
    )
    .unwrap();

    assert_eq!(recon.total_stock_variance_base, 0, "Breakage must prevent false stock shortage");
    assert_eq!(recon.total_stock_shortage_value_paisa, 0);

    // Submit settlement
    let res = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: "2026-11-06".into(),
            closing_km: None,
            returns: vec![VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 1,
                returned_loose: 20,
                breakage_base: 4,
                notes: None,
            }],
            actual_cash_paisa: 0,
            empty_crates_returned: 0,
            route_expenses_paisa: None,
            settlement_notes: None,
            shortage_action: None,
            user_id: Some(2),
        },
    )
    .unwrap();

    assert_eq!(res.status, "SETTLED");

    // Verify Breakage Log Created
    let (broken_units, action): (i64, String) = conn
        .query_row(
            "SELECT broken_base_units, action_taken FROM breakage_logs ORDER BY id DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(broken_units, 4);
    assert_eq!(action, "EXPENSE");
}

// ============================================================================
// 4. CLOSING SERVICE INTEGRATION & LOCKING TESTS (FEATURE 17)
// ============================================================================

#[test]
fn test_route_cash_handover_daily_closing_integration() {
    let mut conn = setup_test_db();

    // 1. Check opening cash
    let summary1 = ClosingService::get_daily_summary(&conn, Some("2026-11-06")).unwrap();
    let initial_expected = summary1.expected_closing_cash_paisa;

    // 2. Create and settle delivery sheet with 50,000 PKR (5,000,000 Paisas) route cash
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some("2026-11-06".into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: None,
            empty_crates_loaded: None,
            items: vec![
                LoadingItemInput {
                    product_id: 1,
                    pack_qty: 2,
                    loose_qty: 0,
                },
            ],
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
            empty_crates_loaded: None,
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .unwrap();

    SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: "2026-11-06".into(),
            closing_km: None,
            returns: vec![VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 2,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa: 5000000,
            empty_crates_returned: 2,
            route_expenses_paisa: None,
            settlement_notes: None,
            shortage_action: None,
            user_id: Some(2),
        },
    )
    .unwrap();

    // 3. Inspect Daily Closing Summary:
    // Route cash must appear in route_cash_collections_paisa
    // Other cash in must NOT include route cash (no double-counting)
    let summary2 = ClosingService::get_daily_summary(&conn, Some("2026-11-06")).unwrap();
    assert_eq!(summary2.cash_in.route_cash_collections_paisa, 5000000);
    assert_eq!(summary2.cash_in.other_cash_in_paisa, 0, "Route cash must not be counted in other_cash_in");
    assert_eq!(summary2.expected_closing_cash_paisa, initial_expected + 5000000);
}

#[test]
fn test_day_locking_prevents_dispatch_or_settlement_on_closed_date() {
    let mut conn = setup_test_db();
    let closed_date = "2026-11-05";

    // 1. Finalize Daily Closing for 2026-11-05
    let _ = ClosingService::get_daily_summary(&conn, Some(closed_date)).unwrap();
    ClosingService::submit_closing(
        &mut conn,
        SubmitClosingDto {
            closing_date: closed_date.into(),
            physical_denominations: DenominationCountsDto {
                note_5000: 0,
                note_1000: 0,
                note_500: 0,
                note_100: 0,
                note_50: 0,
                note_20: 0,
                note_10: 0,
                coin_10: 0,
                coin_5: 0,
                coin_2: 0,
                coin_1: 0,
            },
            variance_reason: None,
            admin_pin: None,
            user_id: Some(1),
        },
    )
    .expect("Submit daily closing");

    // 2. Attempt to create loading sheet on closed date -> MUST BE REJECTED
    let err_create = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some(closed_date.into()),
            vehicle_id: Some(1),
            vehicle_number: None,
            driver_id: None,
            driver_name: None,
            helper_name: None,
            opening_km: None,
            empty_crates_loaded: None,
            items: vec![
                LoadingItemInput {
                    product_id: 1,
                    pack_qty: 1,
                    loose_qty: 0,
                },
            ],
            notes: None,
            created_by: Some(4),
        },
    )
    .expect_err("Must reject loading sheet creation on closed date");

    match err_create {
        AppError::DayLocked(date) => assert_eq!(date, closed_date),
        other => panic!("Expected DayLocked, got {:?}", other),
    }

    // 3. Verify SQLite Trigger directly rejects direct INSERT
    let trigger_res = conn.execute(
        "INSERT INTO delivery_sheets (sheet_number, sheet_date, route_id, status) VALUES ('LOAD-TEST-01', ?1, 1, 'DRAFT')",
        params![closed_date],
    );
    assert!(trigger_res.is_err(), "Database trigger trg_prevent_insert_locked_delivery_sheet must abort insert");
}

// ============================================================================
// 5. RBAC SECURITY & IMMUTABLE AUDIT LOG TESTS (FEATURES 18 & 19)
// ============================================================================

#[test]
fn test_rbac_four_roles_permission_enforcement() {
    // 1. Admin: Omnipotent
    assert!(has_permission(Role::Admin, Action::PosCreateInvoice));
    assert!(has_permission(Role::Admin, Action::PosCancelInvoice));
    assert!(has_permission(Role::Admin, Action::InventoryAdjustStock));
    assert!(has_permission(Role::Admin, Action::AccountingDailyClosing));
    assert!(has_permission(Role::Admin, Action::AdminManageUsers));
    assert!(check_permission(Role::Admin, Action::AdminViewAuditLogs).is_ok());

    // 2. Accountant: Financials allowed, POS billing/stock adjustments blocked
    assert!(has_permission(Role::Accountant, Action::AccountingDailyClosing));
    assert!(has_permission(Role::Accountant, Action::AccountingViewCashBook));
    assert!(has_permission(Role::Accountant, Action::LogisticsAuditSettlement));
    assert!(!has_permission(Role::Accountant, Action::PosCreateInvoice));
    assert!(!has_permission(Role::Accountant, Action::PosCancelInvoice));
    assert!(!has_permission(Role::Accountant, Action::InventoryAdjustStock));
    assert!(!has_permission(Role::Accountant, Action::AdminManageUsers));
    assert!(check_permission(Role::Accountant, Action::AdminManageUsers).is_err());

    // 3. Salesman: POS sales allowed, financial reports/warehouse dispatch blocked
    assert!(has_permission(Role::Salesman, Action::PosCreateInvoice));
    assert!(has_permission(Role::Salesman, Action::LogisticsSubmitSettlement));
    assert!(!has_permission(Role::Salesman, Action::PosCancelInvoice));
    assert!(!has_permission(Role::Salesman, Action::AccountingDailyClosing));
    assert!(!has_permission(Role::Salesman, Action::InventoryIssueVehicleStock));
    assert!(check_permission(Role::Salesman, Action::AccountingDailyClosing).is_err());

    // 4. Warehouse: Loading/stock allowed, financial cash book blocked
    assert!(has_permission(Role::Warehouse, Action::InventoryIssueVehicleStock));
    assert!(has_permission(Role::Warehouse, Action::InventoryAdjustStock));
    assert!(has_permission(Role::Warehouse, Action::LogisticsIssueLoadingSheet));
    assert!(!has_permission(Role::Warehouse, Action::PosCreateInvoice));
    assert!(!has_permission(Role::Warehouse, Action::AccountingViewCashBook));
    assert!(!has_permission(Role::Warehouse, Action::AccountingDailyClosing));
    assert!(check_permission(Role::Warehouse, Action::AccountingViewCashBook).is_err());
}

#[test]
fn test_audit_logs_tamper_resistance_rejects_update_and_delete() {
    let conn = setup_test_db();

    // 1. Insert audit log entry
    let log_id = AuditService::log_audit_action(
        &conn,
        Some(1),
        Some("admin"),
        "SECURITY_TEST",
        "system",
        None,
        "Testing immutability triggers",
    )
    .expect("Insert audit log");
    assert!(log_id > 0);

    // 2. Attempt UPDATE on audit_logs -> MUST FAIL (Trigger trg_prevent_update_audit_logs)
    let update_res = conn.execute(
        "UPDATE audit_logs SET action = 'TAMPERED' WHERE id = ?1",
        params![log_id],
    );
    assert!(update_res.is_err(), "UPDATE on audit_logs must be aborted by trigger");

    // 3. Attempt DELETE on audit_logs -> MUST FAIL (Trigger trg_prevent_delete_audit_logs)
    let delete_res = conn.execute(
        "DELETE FROM audit_logs WHERE id = ?1",
        params![log_id],
    );
    assert!(delete_res.is_err(), "DELETE on audit_logs must be aborted by trigger");

    // 4. Query audit logs via service
    let res = AuditService::query_logs(
        &conn,
        AuditLogFilterDto {
            action: Some("SECURITY_TEST".into()),
            ..Default::default()
        },
    )
    .expect("Query audit logs");
    assert_eq!(res.total_count, 1);
    assert_eq!(res.logs[0].action, "SECURITY_TEST");
    assert_eq!(res.logs[0].username, "admin");
}

#[test]
fn test_pin_authentication_and_supervisor_override() {
    let conn = setup_test_db();

    // 1. PIN Login: Admin (PIN: 1234)
    let admin_session = AuthService::login_pin(&conn, "1234").expect("Admin PIN login");
    assert_eq!(admin_session.role, Role::Admin);
    assert_eq!(admin_session.username, "admin");

    // 2. PIN Login: Warehouse (PIN: 4567)
    let wh_session = AuthService::login_pin(&conn, "4567").expect("Warehouse PIN login");
    assert_eq!(wh_session.role, Role::Warehouse);

    // 3. Invalid PIN Login -> MUST FAIL
    let invalid_res = AuthService::login_pin(&conn, "9999");
    assert!(invalid_res.is_err(), "Invalid PIN must return Unauthorized error");

    // 4. Supervisor Override: Admin PIN (1234) authorizes override
    let override_res = AuthService::validate_supervisor_pin(
        &conn,
        "1234",
        "CREDIT_LIMIT_OVERRIDE",
        "Override customer Bismillah Kiryana limit for Eid rush",
    )
    .expect("Admin override");
    assert!(override_res.authorized);
    assert_eq!(override_res.admin_user_id, 1);
    assert!(override_res.audit_log_id > 0);

    // 5. Supervisor Override: Salesman PIN (3456) -> MUST FAIL (Only Admin can override)
    let bad_override = AuthService::validate_supervisor_pin(
        &conn,
        "3456",
        "BILL_CANCEL",
        "Attempted non-admin override",
    );
    assert!(bad_override.is_err(), "Non-admin PIN cannot authorize supervisor override");
}

// ============================================================================
// 7. REMEDIATION INTEGRATION TESTS (AUTO-AGGREGATION & ROUTE RECOVERY)
// ============================================================================

#[test]
fn test_van_settlement_invoiced_units_auto_aggregation_from_sales_invoice_items() {
    let mut conn = setup_test_db();
    let date = "2026-11-06";

    // 1. Morning Dispatch: Load 10 crates (240 btls) of Prod 1 and 10 packs (60 btls) of Prod 2
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some(date.into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: Some("Rashid".into()),
            opening_km: Some(45200),
            empty_crates_loaded: Some(20),
            items: vec![
                LoadingItemInput {
                    product_id: 1, // Next Cola 250ml Glass (24/crate)
                    pack_qty: 10,  // 240 bottles
                    loose_qty: 0,
                },
                LoadingItemInput {
                    product_id: 2, // Next Cola 1.5L PET (6/pack)
                    pack_qty: 10,  // 60 bottles
                    loose_qty: 0,
                },
            ],
            notes: Some("Auto-aggregation verification run".into()),
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
            empty_crates_loaded: Some(20),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect("Issue loading sheet");

    // 2. VERIFY INVARIANT: delivery_items.sold_base MUST be 0 upon issuance
    let sold_p1: i64 = conn
        .query_row(
            "SELECT sold_base FROM delivery_items WHERE sheet_id = ?1 AND product_id = 1",
            params![sheet.id],
            |r| r.get(0),
        )
        .expect("Query prod 1 sold_base");
    let sold_p2: i64 = conn
        .query_row(
            "SELECT sold_base FROM delivery_items WHERE sheet_id = ?1 AND product_id = 2",
            params![sheet.id],
            |r| r.get(0),
        )
        .expect("Query prod 2 sold_base");
    assert_eq!(sold_p1, 0, "sold_base must initially be 0 in delivery_items");
    assert_eq!(sold_p2, 0, "sold_base must initially be 0 in delivery_items");

    // 3. Simulate Route Delivery Sales via Genuine SalesService Invoices linked to sheet.id
    // Stop 1: Retailer 1 (Customer 1) buys 4 crates of Prod 1 (96 btls) & 3 packs of Prod 2 (18 btls) on Cash
    let _inv1 = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: None,
            invoice_date: Some(date.into()),
            due_date: Some(date.into()),
            delivery_sheet_id: Some(sheet.id),
            trip_id: Some(sheet.id),
            items: vec![
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 4,
                    loose_qty: 0,
                    unit_price_paisa: None, // Wholesale: 2,160 PKR/crate (8,640 PKR)
                    line_discount_paisa: None,
                },
                CreateSalesInvoiceItemDto {
                    product_id: 2,
                    pack_qty: 3,
                    loose_qty: 0,
                    unit_price_paisa: None, // Wholesale: 1,050 PKR/pack (3,150 PKR)
                    line_discount_paisa: None,
                },
            ],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: Some(1179000), // 11,790 PKR Cash
            crates_issued: Some(4),
            crates_returned: Some(4),
            admin_override_pin: None,
            user_id: Some(3),
        },
    )
    .expect("Create route invoice 1");

    // Stop 2: Retailer 2 (Customer 2) buys 2 crates of Prod 1 (48 btls) & 2 packs of Prod 2 (12 btls) on Credit
    let _inv2 = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 2,
            invoice_number: None,
            invoice_date: Some(date.into()),
            due_date: Some("2026-11-20".into()),
            delivery_sheet_id: Some(sheet.id),
            trip_id: Some(sheet.id),
            items: vec![
                CreateSalesInvoiceItemDto {
                    product_id: 1,
                    pack_qty: 2,
                    loose_qty: 0,
                    unit_price_paisa: None, // Wholesale: 4,320 PKR
                    line_discount_paisa: None,
                },
                CreateSalesInvoiceItemDto {
                    product_id: 2,
                    pack_qty: 2,
                    loose_qty: 0,
                    unit_price_paisa: None, // Wholesale: 2,100 PKR
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
    .expect("Create route invoice 2");

    // CONFIRM: delivery_items.sold_base is STILL 0 in the DB (we did NOT do manual SQL updates!)
    let sold_check: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(sold_base), 0) FROM delivery_items WHERE sheet_id = ?1",
            params![sheet.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(sold_check, 0, "delivery_items.sold_base must NOT be manually updated");

    // 4. Evening Settlement Reconciliation:
    // Prod 1: Loaded 10 crates (240). Sold 6 crates (144). Driver returns 4 crates (96 btls).
    // Prod 2: Loaded 10 packs (60). Sold 5 packs (30). Driver returns 5 packs (30 btls).
    // Crates: 20 morning loaded + 6 swapped in = 20 returned.
    // Cash: 11,790 PKR (1,179,000 Paisas).
    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some(date),
        &[
            VanSettlementReturnItemDto {
                product_id: 1,
                returned_packs: 4,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            },
            VanSettlementReturnItemDto {
                product_id: 2,
                returned_packs: 5,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            },
        ],
        1179000,
        20,
        0,
    )
    .expect("Reconciliation must execute without SQL errors and auto-aggregate from sales_invoice_items");

    // 5. Assert that calculate_settlement_reconciliation automatically aggregated from sii.total_base_units:
    let line_p1 = recon.stock_items.iter().find(|i| i.product_id == 1).expect("Prod 1 line");
    assert_eq!(line_p1.sold_base, 144, "Prod 1 sold_base must be automatically aggregated from invoices (96 + 48 = 144)");
    assert_eq!(line_p1.expected_return_base, 96, "Expected return = 240 - 144 = 96");
    assert_eq!(line_p1.total_returned_base, 96);
    assert_eq!(line_p1.variance_base, 0, "No false shortage for Prod 1!");
    assert_eq!(line_p1.status, "BALANCED");

    let line_p2 = recon.stock_items.iter().find(|i| i.product_id == 2).expect("Prod 2 line");
    assert_eq!(line_p2.sold_base, 30, "Prod 2 sold_base must be automatically aggregated from invoices (18 + 12 = 30)");
    assert_eq!(line_p2.expected_return_base, 30, "Expected return = 60 - 30 = 30");
    assert_eq!(line_p2.total_returned_base, 30);
    assert_eq!(line_p2.variance_base, 0, "No false shortage for Prod 2!");
    assert_eq!(line_p2.status, "BALANCED");

    assert_eq!(recon.total_stock_variance_base, 0);
    assert_eq!(recon.total_stock_shortage_value_paisa, 0);
    assert_eq!(recon.route_cash_sales_paisa, 1179000);
    assert_eq!(recon.route_credit_sales_paisa, 642000);
    assert_eq!(recon.expected_cash_paisa, 1179000);
    assert_eq!(recon.actual_cash_paisa, 1179000);
    assert_eq!(recon.cash_variance_paisa, 0);
    assert_eq!(recon.crates_variance, 0);
    assert!(recon.is_balanced, "Trip reconciliation must be perfectly balanced");

    // 6. Submit Settlement and verify DB updates
    let result = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: date.into(),
            closing_km: Some(45275),
            returns: vec![
                VanSettlementReturnItemDto {
                    product_id: 1,
                    returned_packs: 4,
                    returned_loose: 0,
                    breakage_base: 0,
                    notes: None,
                },
                VanSettlementReturnItemDto {
                    product_id: 2,
                    returned_packs: 5,
                    returned_loose: 0,
                    breakage_base: 0,
                    notes: None,
                },
            ],
            actual_cash_paisa: 1179000,
            empty_crates_returned: 20,
            route_expenses_paisa: None,
            shortage_action: Some("BALANCED".into()),
            settlement_notes: Some("Auto-aggregation balanced settlement".into()),
            user_id: Some(1),
        },
    )
    .expect("Submit van settlement");

    assert_eq!(result.status, "SETTLED");
    assert_eq!(result.total_stock_variance_base, 0);
    assert_eq!(result.cash_variance_paisa, 0);

    // Verify delivery_items now records aggregated sold_base
    let post_sold_p1: i64 = conn
        .query_row(
            "SELECT sold_base FROM delivery_items WHERE sheet_id = ?1 AND product_id = 1",
            params![sheet.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(post_sold_p1, 144, "delivery_items.sold_base must now be persisted as 144");
}

#[test]
fn test_route_customer_recovery_linkage_and_settlement_cash_reconciliation() {
    let mut conn = setup_test_db();
    let prior_date = "2026-11-05";
    let route_date = "2026-11-07";

    // 1. Establish Prior Customer Debt for Customer 1 (Bismillah Kiryana Store)
    // Credit Sale of 10 crates (240 btls) of Prod 1: 21,600 PKR (2,160,000 Paisas)
    let _prior_inv = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 1,
            invoice_number: None,
            invoice_date: Some(prior_date.into()),
            due_date: Some("2026-11-19".into()),
            delivery_sheet_id: None,
            trip_id: None,
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 1,
                pack_qty: 10,
                loose_qty: 0,
                unit_price_paisa: None,
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Credit,
            paid_amount_paisa: Some(0),
            crates_issued: Some(10),
            crates_returned: Some(0),
            admin_override_pin: None,
            user_id: Some(1),
        },
    )
    .expect("Create prior credit invoice");

    let cust1_balance: i64 = conn
        .query_row(
            "SELECT current_balance_paisa FROM customers WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .expect("Query customer 1 balance");
    assert_eq!(cust1_balance, 2160000, "Customer 1 must have 21,600 PKR outstanding debt");

    // 2. Dispatch Van on Route 1 on 2026-11-07
    let sheet = LogisticsService::create_loading_sheet(
        &mut conn,
        CreateLoadingSheetDto {
            route_id: 1,
            sheet_date: Some(route_date.into()),
            vehicle_id: Some(1),
            vehicle_number: Some("LES-2489".into()),
            driver_id: Some(3),
            driver_name: Some("Tariq Mahmood".into()),
            helper_name: None,
            opening_km: Some(45300),
            empty_crates_loaded: Some(0),
            items: vec![LoadingItemInput {
                product_id: 2, // 1.5L PET (6/pack)
                pack_qty: 5,   // 30 bottles
                loose_qty: 0,
            }],
            notes: Some("Route recovery test trip".into()),
            created_by: Some(4),
        },
    )
    .expect("Create loading sheet");

    LogisticsService::issue_loading_sheet(
        &mut conn,
        IssueLoadingSheetDto {
            sheet_id: sheet.id,
            departure_time: Some("08:30:00".into()),
            opening_km: Some(45300),
            empty_crates_loaded: Some(0),
            morning_dispatcher_id: Some(4),
            notes: None,
        },
    )
    .expect("Issue loading sheet");

    // 3. Activity on Route:
    // A. Cash Sale to Customer 2: 2 packs of Prod 2 (12 btls) = 2,100 PKR (210,000 Paisas)
    let _inv = SalesService::create_invoice(
        &mut conn,
        CreateSalesInvoiceDto {
            customer_id: 2,
            invoice_number: None,
            invoice_date: Some(route_date.into()),
            due_date: Some(route_date.into()),
            delivery_sheet_id: Some(sheet.id),
            trip_id: Some(sheet.id),
            items: vec![CreateSalesInvoiceItemDto {
                product_id: 2,
                pack_qty: 2,
                loose_qty: 0,
                unit_price_paisa: None,
                line_discount_paisa: None,
            }],
            invoice_discount_paisa: None,
            crate_deposit_charged_paisa: None,
            payment_type: PaymentType::Cash,
            paid_amount_paisa: Some(210000),
            crates_issued: Some(0),
            crates_returned: Some(0),
            admin_override_pin: None,
            user_id: Some(3),
        },
    )
    .expect("Create route cash invoice");

    // B. Route Recovery from Customer 1: Salesman collects 15,000 PKR (1,500,000 Paisas) against prior debt
    let rec_receipt = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 1,
            amount_paisa: 1500000, // 15,000 PKR
            payment_mode: "CASH".into(),
            allocation_mode: Some("FIFO".into()),
            payment_date: Some(route_date.into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Route collection from Haji Bismillah on Beat-01".into()),
            user_id: Some(3),
            delivery_sheet_id: Some(sheet.id),
        },
    )
    .expect("Record route customer recovery");

    // Verify recovery was persisted with delivery_sheet_id
    let saved_sheet_id: Option<i64> = conn
        .query_row(
            "SELECT delivery_sheet_id FROM customer_recoveries WHERE id = ?1",
            params![rec_receipt.recovery_id],
            |r| r.get(0),
        )
        .expect("Query recovery delivery_sheet_id");
    assert_eq!(saved_sheet_id, Some(sheet.id), "Customer recovery MUST store delivery_sheet_id");

    // C. Non-Route Depot Recovery: Customer 3 pays 5,000 PKR (500,000 Paisas) at depot office (delivery_sheet_id: None)
    let _depot_receipt = AccountingService::record_customer_recovery(
        &mut conn,
        RecordCustomerRecoveryDto {
            customer_id: 3,
            amount_paisa: 500000,
            payment_mode: "CASH".into(),
            allocation_mode: Some("ON_ACCOUNT".into()),
            payment_date: Some(route_date.into()),
            target_invoice_ids: None,
            bank_account_id: None,
            bank_name: None,
            instrument_number: None,
            instrument_date: None,
            notes: Some("Depot walk-in counter recovery".into()),
            user_id: Some(2),
            delivery_sheet_id: None,
        },
    )
    .expect("Record depot recovery");

    // D. Route Fuel Expense: 500 PKR (50,000 Paisas)
    let route_expense_paisa = 50000i64;

    // 4. Expected Cash Calculation:
    // Route Cash Sales:    210,000 Paisas  (2,100 PKR)
    // Route Recoveries:  1,500,000 Paisas (15,000 PKR)
    // Route Expenses:      -50,000 Paisas   (-500 PKR)
    // Total Expected:    1,660,000 Paisas (16,600 PKR)
    // Driver hands over exactly 1,660,000 Paisas.
    let actual_cash_paisa = 1660000i64;

    let recon = SettlementService::calculate_settlement_reconciliation(
        &conn,
        sheet.id,
        Some(route_date),
        &[VanSettlementReturnItemDto {
            product_id: 2,
            returned_packs: 3, // 5 loaded - 2 sold = 3 returned
            returned_loose: 0,
            breakage_base: 0,
            notes: None,
        }],
        actual_cash_paisa,
        0,
        route_expense_paisa,
    )
    .expect("Reconciliation must execute without SQL errors");

    // 5. Assertions on Cash Reconciliation & Recovery Isolation:
    assert_eq!(recon.route_cash_sales_paisa, 210000);
    assert_eq!(
        recon.route_recoveries_collected_paisa, 1500000,
        "Must isolate ONLY the route recovery of 15,000 PKR (excluding the 5,000 PKR depot recovery)"
    );
    assert_eq!(recon.route_expenses_deducted_paisa, 50000);
    assert_eq!(
        recon.expected_cash_paisa, 1660000,
        "Expected cash must equal Sales (2,100) + Recoveries (15,000) - Expenses (500) = 16,600 PKR"
    );
    assert_eq!(recon.actual_cash_paisa, 1660000);
    assert_eq!(recon.cash_variance_paisa, 0);
    assert_eq!(recon.cash_variance_type, "BALANCED");
    assert!(recon.is_balanced, "Reconciliation must be balanced");

    // 6. Submit Settlement and verify DB integrity
    let result = SettlementService::submit_van_settlement(
        &mut conn,
        SubmitVanSettlementDto {
            sheet_id: sheet.id,
            settlement_date: route_date.into(),
            closing_km: Some(45360),
            returns: vec![VanSettlementReturnItemDto {
                product_id: 2,
                returned_packs: 3,
                returned_loose: 0,
                breakage_base: 0,
                notes: None,
            }],
            actual_cash_paisa,
            empty_crates_returned: 0,
            route_expenses_paisa: Some(route_expense_paisa),
            shortage_action: Some("BALANCED".into()),
            settlement_notes: Some("Route trip with customer recovery fully settled".into()),
            user_id: Some(1),
        },
    )
    .expect("Submit van settlement");

    assert_eq!(result.status, "SETTLED");
    assert_eq!(result.cash_variance_paisa, 0);

    // Verify delivery_sheets record
    let (db_recov, db_exp, db_exp_cash): (i64, i64, i64) = conn
        .query_row(
            "SELECT total_recoveries_paisa, total_route_expenses_paisa, expected_cash_paisa 
             FROM delivery_sheets WHERE id = ?1",
            params![sheet.id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .expect("Query settled delivery sheet");
    assert_eq!(db_recov, 1500000);
    assert_eq!(db_exp, 50000);
    assert_eq!(db_exp_cash, 1660000);

    // Verify Cash Book Entry: Cashier received actual_cash_paisa (16,600 PKR) into Cash Drawer (1010)
    let cb_cash_in: i64 = conn
        .query_row(
            "SELECT cash_in_paisa FROM cash_book 
             WHERE transaction_type = 'ROUTE_CASH_HANDOVER' AND voucher_ref_id = ?1",
            params![sheet.id],
            |r| r.get(0),
        )
        .expect("Query cash book entry");
    assert_eq!(cb_cash_in, 1660000, "Cash Book must record 16,600 PKR liquid cash received");
}
